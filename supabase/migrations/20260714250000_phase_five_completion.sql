begin;

insert into public.permissions(code,module,action,description) values
 ('notifications.view','notifications','view','Visualizar as próprias notificações'),
 ('notifications.manage','notifications','manage','Administrar notificações da organização'),
 ('privacy.view','privacy','view','Consultar solicitações de privacidade'),
 ('privacy.export','privacy','export','Exportar dados pessoais de clientes'),
 ('privacy.anonymize','privacy','anonymize','Anonimizar dados pessoais de clientes')
on conflict(code) do update set description=excluded.description;

insert into public.role_permissions(role_id,permission_id,created_by)
select r.id,p.id,r.created_by from public.roles r cross join public.permissions p
where r.code in ('owner','administrator') and p.module in ('notifications','privacy') on conflict do nothing;
insert into public.role_permissions(role_id,permission_id,created_by)
select r.id,p.id,r.created_by from public.roles r cross join public.permissions p
where r.code in ('service_advisor','read_only') and p.code='notifications.view' on conflict do nothing;

create table public.notifications(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 branch_id uuid references public.branches(id),
 recipient_user_id uuid not null references auth.users(id) on delete cascade,
 notification_type text not null check(notification_type in ('estimate','warranty','financial','stock','system')),
 severity text not null default 'info' check(severity in ('info','warning','critical','success')),
 title text not null,
 message text not null,
 href text,
 entity_type text,
 entity_id uuid,
 idempotency_key text not null,
 read_at timestamptz,
 expires_at timestamptz,
 created_at timestamptz not null default now(),
 unique(recipient_user_id,idempotency_key)
);
create index notifications_recipient_idx on public.notifications(recipient_user_id,read_at,created_at desc);
create index notifications_scope_idx on public.notifications(organization_id,branch_id,created_at desc);

create table public.privacy_requests(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 branch_id uuid references public.branches(id),
 customer_id uuid not null references public.customers(id),
 request_type text not null check(request_type in ('export','anonymization')),
 status text not null default 'completed' check(status in ('requested','processing','completed','rejected')),
 reason text,
 requested_by uuid not null references auth.users(id),
 requested_at timestamptz not null default now(),
 completed_at timestamptz,
 metadata jsonb not null default '{}'::jsonb
);
create index privacy_requests_scope_idx on public.privacy_requests(organization_id,requested_at desc);

alter table public.notifications enable row level security;
alter table public.privacy_requests enable row level security;

create policy notifications_select on public.notifications for select
 using(recipient_user_id=auth.uid() and public.is_organization_member(organization_id));
create policy notifications_read on public.notifications for update
 using(recipient_user_id=auth.uid() and public.is_organization_member(organization_id))
 with check(recipient_user_id=auth.uid() and public.is_organization_member(organization_id));
create policy privacy_requests_select on public.privacy_requests for select
 using(public.has_permission(organization_id,branch_id,'privacy.view'));

create or replace function public.validate_completion_scope()
returns trigger security definer set search_path=public set row_security=off language plpgsql as $$
begin
 if new.branch_id is not null and not exists(select 1 from public.branches b where b.id=new.branch_id and b.organization_id=new.organization_id and b.deleted_at is null) then
  raise exception 'branch_scope_mismatch';
 end if;
 if tg_table_name='privacy_requests' and not exists(select 1 from public.customers c where c.id=new.customer_id and c.organization_id=new.organization_id) then
  raise exception 'customer_scope_mismatch';
 end if;
 return new;
end;
$$;
create trigger notifications_validate_scope before insert or update on public.notifications for each row execute function public.validate_completion_scope();
create trigger privacy_requests_validate_scope before insert or update on public.privacy_requests for each row execute function public.validate_completion_scope();

create or replace function public.refresh_operational_notifications(p_branch_id uuid)
returns integer security definer set search_path=public set row_security=off language plpgsql as $$
declare v_org uuid; v_count integer:=0; v_rows integer;
begin
 if auth.uid() is null then raise exception 'authentication_required'; end if;
 select organization_id into v_org from public.branches where id=p_branch_id and deleted_at is null;
 if v_org is null or not public.is_branch_member(p_branch_id) then raise exception 'permission_denied'; end if;

 if public.has_permission(v_org,p_branch_id,'warranties.view') then
  insert into public.notifications(organization_id,branch_id,recipient_user_id,notification_type,severity,title,message,href,entity_type,entity_id,idempotency_key,expires_at)
  select w.organization_id,w.branch_id,auth.uid(),'warranty',case when w.expires_at<=current_date+7 then 'critical' else 'warning' end,
   'Garantia próxima do vencimento',w.description||' vence em '||to_char(w.expires_at,'DD/MM/YYYY'),'/garantias','warranty',w.id,'warranty-expiry:'||w.id,now()+interval '45 days'
  from public.warranties w where w.organization_id=v_org and w.branch_id=p_branch_id and w.status in ('active','claimed') and w.expires_at between current_date and current_date+30 and w.deleted_at is null
  on conflict(recipient_user_id,idempotency_key) do nothing;
  get diagnostics v_rows=row_count; v_count:=v_count+v_rows;
 end if;

 if public.has_permission(v_org,p_branch_id,'estimates.view') then
  insert into public.notifications(organization_id,branch_id,recipient_user_id,notification_type,severity,title,message,href,entity_type,entity_id,idempotency_key,expires_at)
  select e.organization_id,e.branch_id,auth.uid(),'estimate',case when e.valid_until<current_date then 'critical' else 'warning' end,
   'Orçamento aguardando resposta','Orçamento '||e.number||case when e.valid_until is not null then ' válido até '||to_char(e.valid_until,'DD/MM/YYYY') else '' end,
   '/orcamentos','estimate',e.id,'estimate-pending:'||e.id,now()+interval '30 days'
  from public.estimates e where e.organization_id=v_org and e.branch_id=p_branch_id and e.status in ('sent','viewed','partially_approved') and e.deleted_at is null
  on conflict(recipient_user_id,idempotency_key) do nothing;
  get diagnostics v_rows=row_count; v_count:=v_count+v_rows;
 end if;

 if public.has_permission(v_org,p_branch_id,'financial.view') then
  insert into public.notifications(organization_id,branch_id,recipient_user_id,notification_type,severity,title,message,href,entity_type,entity_id,idempotency_key,expires_at)
  select r.organization_id,r.branch_id,auth.uid(),'financial','critical','Recebimento vencido',r.description||' • '||to_char(r.due_date,'DD/MM/YYYY'),
   '/contas-receber','receivable',r.id,'receivable-overdue:'||r.id,now()+interval '90 days'
  from public.receivables r where r.organization_id=v_org and r.branch_id=p_branch_id and r.status in ('open','overdue','partial') and r.outstanding_amount>0 and r.due_date<current_date and r.deleted_at is null
  on conflict(recipient_user_id,idempotency_key) do nothing;
  get diagnostics v_rows=row_count; v_count:=v_count+v_rows;
 end if;

 delete from public.notifications where recipient_user_id=auth.uid() and expires_at<now();
 return v_count;
end;
$$;

create or replace function public.export_customer_data(p_customer_id uuid)
returns jsonb security definer set search_path=public set row_security=off language plpgsql as $$
declare v_customer public.customers%rowtype; v_result jsonb;
begin
 select * into v_customer from public.customers where id=p_customer_id and deleted_at is null;
 if v_customer.id is null or not public.has_permission(v_customer.organization_id,v_customer.primary_branch_id,'privacy.export') then raise exception 'permission_denied'; end if;
 v_result:=jsonb_build_object(
  'generated_at',now(),'customer',to_jsonb(v_customer),
  'contacts',coalesce((select jsonb_agg(to_jsonb(x)) from public.customer_contacts x where x.customer_id=p_customer_id and x.deleted_at is null),'[]'::jsonb),
  'addresses',coalesce((select jsonb_agg(to_jsonb(x)) from public.customer_addresses x where x.customer_id=p_customer_id and x.deleted_at is null),'[]'::jsonb),
  'vehicles',coalesce((select jsonb_agg(to_jsonb(x)) from public.vehicles x where x.customer_id=p_customer_id and x.deleted_at is null),'[]'::jsonb),
  'interactions',coalesce((select jsonb_agg(to_jsonb(x)) from public.customer_interactions x where x.customer_id=p_customer_id and x.deleted_at is null),'[]'::jsonb),
  'work_orders',coalesce((select jsonb_agg(to_jsonb(x)) from public.work_orders x where x.customer_id=p_customer_id and x.deleted_at is null),'[]'::jsonb),
  'warranties',coalesce((select jsonb_agg(to_jsonb(x)) from public.warranties x where x.customer_id=p_customer_id and x.deleted_at is null),'[]'::jsonb),
  'feedback',coalesce((select jsonb_agg(to_jsonb(x)) from public.customer_feedback x where x.customer_id=p_customer_id),'[]'::jsonb)
 );
 insert into public.privacy_requests(organization_id,branch_id,customer_id,request_type,status,requested_by,completed_at,metadata)
 values(v_customer.organization_id,v_customer.primary_branch_id,p_customer_id,'export','completed',auth.uid(),now(),jsonb_build_object('record_groups',7));
 return v_result;
end;
$$;

create or replace function public.anonymize_customer(p_customer_id uuid,p_reason text)
returns void security definer set search_path=public set row_security=off language plpgsql as $$
declare v_customer public.customers%rowtype;
begin
 select * into v_customer from public.customers where id=p_customer_id and deleted_at is null for update;
 if v_customer.id is null or not public.has_permission(v_customer.organization_id,v_customer.primary_branch_id,'privacy.anonymize') then raise exception 'permission_denied'; end if;
 if char_length(trim(coalesce(p_reason,'')))<10 then raise exception 'reason_required'; end if;
 if exists(select 1 from public.work_orders w where w.customer_id=p_customer_id and w.status not in ('delivered','cancelled') and w.deleted_at is null) then raise exception 'customer_has_active_work_orders'; end if;
 if exists(select 1 from public.receivables r where r.customer_id=p_customer_id and r.status in ('open','overdue','partial') and r.outstanding_amount>0 and r.deleted_at is null) then raise exception 'customer_has_open_receivables'; end if;

 update public.customers set name='Cliente anonimizado '||left(id::text,8),trade_name=null,tax_id=null,state_registration=null,birth_date=null,primary_phone=null,whatsapp=null,primary_email=null,source=null,notes=null,communication_consent=false,consent_at=null,updated_by=auth.uid() where id=p_customer_id;
 update public.customer_contacts set label=null,value='anonimizado',deleted_at=coalesce(deleted_at,now()) where customer_id=p_customer_id;
 update public.customer_addresses set postal_code=null,street='Anonimizado',number=null,complement=null,district=null,city='Anonimizado',state='NA',deleted_at=coalesce(deleted_at,now()) where customer_id=p_customer_id;
 update public.vehicles set license_plate='ANON'||upper(left(id::text,8)),chassis=null,renavam=null,fleet_code=null,insurer=null,notes=null,updated_by=auth.uid() where customer_id=p_customer_id and deleted_at is null;
 insert into public.privacy_requests(organization_id,branch_id,customer_id,request_type,status,reason,requested_by,completed_at)
 values(v_customer.organization_id,v_customer.primary_branch_id,p_customer_id,'anonymization','completed',trim(p_reason),auth.uid(),now());
end;
$$;

create trigger audit_privacy_requests after insert or update or delete on public.privacy_requests for each row execute function public.write_audit_log();

revoke all on public.notifications,public.privacy_requests from anon;
revoke all on public.notifications,public.privacy_requests from authenticated;
grant select on public.notifications,public.privacy_requests to authenticated;
grant update(read_at) on public.notifications to authenticated;
revoke all on function public.validate_completion_scope() from public,anon,authenticated;
revoke all on function public.refresh_operational_notifications(uuid) from public,anon;
revoke all on function public.export_customer_data(uuid) from public,anon;
revoke all on function public.anonymize_customer(uuid,text) from public,anon;
grant execute on function public.refresh_operational_notifications(uuid) to authenticated;
grant execute on function public.export_customer_data(uuid) to authenticated;
grant execute on function public.anonymize_customer(uuid,text) to authenticated;

commit;
