begin;

insert into public.permissions (code,module,action,description) values
 ('crm.view','crm','view','Visualizar CRM e segmentações'),
 ('crm.manage','crm','manage','Administrar CRM e segmentações'),
 ('warranties.view','warranties','view','Visualizar garantias e retornos'),
 ('warranties.manage','warranties','manage','Administrar garantias e retornos'),
 ('warranties.approve','warranties','approve','Aprovar retornos em garantia'),
 ('fleets.view','fleets','view','Visualizar frotas e convênios'),
 ('fleets.manage','fleets','manage','Administrar frotas e convênios'),
 ('automations.view','automations','view','Visualizar automações e comunicações'),
 ('automations.manage','automations','manage','Administrar e executar automações'),
 ('portal.view','portal','view','Visualizar acessos do portal'),
 ('portal.manage','portal','manage','Emitir e revogar acessos do portal'),
 ('bi.view','bi','view','Visualizar indicadores avançados'),
 ('integrations.view','integrations','view','Visualizar integrações'),
 ('integrations.manage','integrations','manage','Administrar integrações')
on conflict(code) do update set description=excluded.description;

insert into public.role_permissions(role_id,permission_id,created_by)
select r.id,p.id,r.created_by from public.roles r cross join public.permissions p
where r.code='owner' and p.module in ('crm','warranties','fleets','automations','portal','bi','integrations') on conflict do nothing;
insert into public.role_permissions(role_id,permission_id,created_by)
select r.id,p.id,r.created_by from public.roles r cross join public.permissions p
where r.code='administrator' and p.module in ('crm','warranties','fleets','automations','portal','bi','integrations') on conflict do nothing;
insert into public.role_permissions(role_id,permission_id,created_by)
select r.id,p.id,r.created_by from public.roles r cross join public.permissions p
where r.code='service_advisor' and p.code in ('crm.view','crm.manage','warranties.view','warranties.manage','fleets.view','portal.view','portal.manage') on conflict do nothing;
insert into public.role_permissions(role_id,permission_id,created_by)
select r.id,p.id,r.created_by from public.roles r cross join public.permissions p
where r.code='read_only' and p.action='view' and p.module in ('crm','warranties','fleets','automations','portal','bi','integrations') on conflict do nothing;

create table public.customer_segments(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 name text not null, description text, segment_type text not null default 'manual' check(segment_type in ('manual','inactive','recurring','delinquent','birthday','fleet','custom')),
 color text, active boolean not null default true, criteria jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz,
 unique(organization_id,name)
);
create table public.customer_segment_members(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), segment_id uuid not null references public.customer_segments(id) on delete cascade,
 customer_id uuid not null references public.customers(id) on delete cascade, source text not null default 'manual', created_at timestamptz not null default now(), created_by uuid references auth.users(id),
 unique(segment_id,customer_id)
);

create table public.warranties(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), branch_id uuid not null references public.branches(id),
 customer_id uuid not null references public.customers(id), vehicle_id uuid not null references public.vehicles(id), work_order_id uuid references public.work_orders(id), work_order_item_id uuid references public.work_order_items(id),
 warranty_type text not null check(warranty_type in ('service','product','work_order')), description text not null,
 starts_at date not null default current_date, expires_at date not null, mileage_start integer, mileage_limit integer,
 status text not null default 'active' check(status in ('active','claimed','expired','voided')), terms text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz,
 check(expires_at>=starts_at)
);
create index warranties_expiry_idx on public.warranties(organization_id,branch_id,status,expires_at) where deleted_at is null;
create unique index warranties_item_type_uidx on public.warranties(work_order_item_id,warranty_type) where work_order_item_id is not null and deleted_at is null;
create table public.warranty_claims(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), branch_id uuid not null references public.branches(id),
 warranty_id uuid not null references public.warranties(id), customer_id uuid not null references public.customers(id), vehicle_id uuid not null references public.vehicles(id),
 original_work_order_id uuid references public.work_orders(id), return_work_order_id uuid references public.work_orders(id),
 status text not null default 'requested' check(status in ('requested','analysis','approved','rejected','in_progress','completed','cancelled')),
 reason text not null, diagnosis text, responsibility text, estimated_cost numeric(14,2) not null default 0, actual_cost numeric(14,2) not null default 0,
 technical_opinion text, rework boolean not null default true, approved_by uuid references auth.users(id), approved_at timestamptz, completed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz
);

create table public.fleet_contracts(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), branch_id uuid not null references public.branches(id),
 customer_id uuid not null references public.customers(id), code text not null, name text not null, status text not null default 'active' check(status in ('draft','active','suspended','expired','cancelled')),
 starts_at date not null default current_date, expires_at date, approval_required boolean not null default true, monthly_close_day smallint not null default 1 check(monthly_close_day between 1 and 28),
 vehicle_credit_limit numeric(14,2) not null default 0, price_table_name text, payment_terms text, commercial_terms text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz,
 unique(branch_id,code), check(expires_at is null or expires_at>=starts_at)
);
create table public.fleet_drivers(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), branch_id uuid not null references public.branches(id), contract_id uuid not null references public.fleet_contracts(id) on delete cascade,
 name text not null, document text, license_number text, phone text, email text, active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz
);
create table public.fleet_vehicles(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), branch_id uuid not null references public.branches(id), contract_id uuid not null references public.fleet_contracts(id) on delete cascade,
 vehicle_id uuid not null references public.vehicles(id), default_driver_id uuid references public.fleet_drivers(id), cost_center_id uuid references public.cost_centers(id),
 internal_code text, monthly_limit numeric(14,2), authorization_required boolean not null default true, active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz,
 unique(contract_id,vehicle_id)
);

create table public.message_templates(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), branch_id uuid references public.branches(id),
 code text not null, name text not null, channel text not null check(channel in ('whatsapp','email','sms','internal')), subject text, body text not null, variables text[] not null default '{}', active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz,
 unique nulls not distinct(organization_id,branch_id,code)
);
create table public.automation_rules(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), branch_id uuid not null references public.branches(id), template_id uuid references public.message_templates(id),
 name text not null, event_type text not null check(event_type in ('service_due','oil_change_due','preventive_due','rating_request','estimate_pending','vehicle_ready','inactive_customer','birthday','warranty_expiring')),
 channel text not null check(channel in ('whatsapp','email','sms','internal')), days_offset integer not null default 0, active boolean not null default true, settings jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz
);
create table public.automation_jobs(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), branch_id uuid not null references public.branches(id), rule_id uuid not null references public.automation_rules(id),
 customer_id uuid not null references public.customers(id), vehicle_id uuid references public.vehicles(id), warranty_id uuid references public.warranties(id),
 status text not null default 'queued' check(status in ('queued','processing','sent','failed','cancelled')), scheduled_for timestamptz not null default now(),
 rendered_subject text, rendered_body text, channel text not null, recipient text, idempotency_key text not null, sent_at timestamptz, failure_reason text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_by uuid references auth.users(id), unique(organization_id,idempotency_key)
);
create table public.customer_feedback(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), branch_id uuid not null references public.branches(id), customer_id uuid not null references public.customers(id),
 work_order_id uuid references public.work_orders(id), rating smallint not null check(rating between 1 and 5), comment text, source text not null default 'portal',
 created_at timestamptz not null default now(), unique nulls not distinct(customer_id,work_order_id,source)
);

create table public.portal_access_tokens(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), branch_id uuid not null references public.branches(id), customer_id uuid not null references public.customers(id),
 work_order_id uuid references public.work_orders(id), token_hash text not null unique, expires_at timestamptz not null, revoked_at timestamptz, last_used_at timestamptz,
 created_at timestamptz not null default now(), created_by uuid references auth.users(id), check(expires_at>created_at)
);

create table public.integration_connections(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), branch_id uuid references public.branches(id),
 provider text not null check(provider in ('whatsapp','email','sms','payment','accounting','parts_catalog','webhook','other')), name text not null,
 status text not null default 'draft' check(status in ('draft','active','paused','error')), endpoint_url text, secret_reference text, settings jsonb not null default '{}'::jsonb, last_checked_at timestamptz, last_error text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz
);
create table public.integration_events(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), branch_id uuid references public.branches(id), connection_id uuid references public.integration_connections(id),
 event_type text not null, aggregate_type text, aggregate_id uuid, payload jsonb not null default '{}'::jsonb, status text not null default 'pending' check(status in ('pending','processing','delivered','failed','cancelled')),
 attempt_count integer not null default 0, available_at timestamptz not null default now(), delivered_at timestamptz, last_error text, created_at timestamptz not null default now(), idempotency_key text,
 check(attempt_count>=0)
);
create unique index integration_events_idempotency_uidx on public.integration_events(organization_id,idempotency_key) where idempotency_key is not null;

alter table public.work_orders add column if not exists warranty_claim_id uuid references public.warranty_claims(id);
create unique index work_orders_warranty_claim_uidx on public.work_orders(warranty_claim_id) where warranty_claim_id is not null and deleted_at is null;

create trigger customer_segments_set_updated_at before update on public.customer_segments for each row execute function public.set_updated_at();
create trigger warranties_set_updated_at before update on public.warranties for each row execute function public.set_updated_at();
create trigger warranty_claims_set_updated_at before update on public.warranty_claims for each row execute function public.set_updated_at();
create trigger fleet_contracts_set_updated_at before update on public.fleet_contracts for each row execute function public.set_updated_at();
create trigger fleet_drivers_set_updated_at before update on public.fleet_drivers for each row execute function public.set_updated_at();
create trigger fleet_vehicles_set_updated_at before update on public.fleet_vehicles for each row execute function public.set_updated_at();
create trigger message_templates_set_updated_at before update on public.message_templates for each row execute function public.set_updated_at();
create trigger automation_rules_set_updated_at before update on public.automation_rules for each row execute function public.set_updated_at();
create trigger automation_jobs_set_updated_at before update on public.automation_jobs for each row execute function public.set_updated_at();
create trigger integration_connections_set_updated_at before update on public.integration_connections for each row execute function public.set_updated_at();

create or replace function public.generate_work_order_warranties()
returns trigger security definer set search_path=public set row_security=off language plpgsql as $$
begin
 if new.status='delivered' and old.status is distinct from new.status then
  insert into public.warranties(organization_id,branch_id,customer_id,vehicle_id,work_order_id,work_order_item_id,warranty_type,description,starts_at,expires_at,mileage_start,status,created_by,updated_by)
  select new.organization_id,new.branch_id,new.customer_id,new.vehicle_id,new.id,i.id,case when i.item_type in ('part','supply') then 'product' else 'service' end,
    i.description,coalesce(new.delivered_at::date,current_date),coalesce(new.delivered_at::date,current_date)+i.warranty_days,new.mileage_in,'active',auth.uid(),auth.uid()
  from public.work_order_items i where i.work_order_id=new.id and i.warranty_days>0
  on conflict(work_order_item_id,warranty_type) do nothing;
 end if;
 return new;
end;
$$;
create trigger work_orders_generate_warranties after update on public.work_orders for each row execute function public.generate_work_order_warranties();

create or replace function public.guard_warranty_claim_status()
returns trigger language plpgsql as $$
begin
 if new.status is distinct from old.status then
  if new.status in ('approved','rejected') and current_setting('app.warranty_approval',true)<>'on' then raise exception 'approval_function_required'; end if;
  if new.status='in_progress' and old.status<>'approved' then raise exception 'claim_must_be_approved'; end if;
  if new.status='completed' and old.status<>'in_progress' then raise exception 'claim_must_be_in_progress'; end if;
  if old.status in ('completed','rejected','cancelled') then raise exception 'terminal_claim_is_locked'; end if;
 end if;
 return new;
end;
$$;
create trigger warranty_claims_guard_status before update on public.warranty_claims for each row execute function public.guard_warranty_claim_status();

create or replace function public.approve_warranty_claim(p_claim_id uuid,p_approved boolean,p_opinion text default null)
returns uuid security definer set search_path=public set row_security=off language plpgsql as $$
declare v_claim public.warranty_claims%rowtype; v_warranty public.warranties%rowtype; v_order uuid;
begin
 select * into v_claim from public.warranty_claims where id=p_claim_id and deleted_at is null for update;
 if v_claim.id is null or v_claim.status not in ('requested','analysis') then raise exception 'invalid_claim_status'; end if;
 if not public.has_permission(v_claim.organization_id,v_claim.branch_id,'warranties.approve') then raise exception 'permission_denied'; end if;
 select * into v_warranty from public.warranties where id=v_claim.warranty_id and deleted_at is null;
 perform set_config('app.warranty_approval','on',true);
 if p_approved then
  insert into public.work_orders(organization_id,branch_id,number,customer_id,vehicle_id,status,priority,customer_complaint,diagnosis,internal_notes,total,warranty_claim_id,created_by,updated_by)
  values(v_claim.organization_id,v_claim.branch_id,'',v_claim.customer_id,v_claim.vehicle_id,'awaiting_triage','high','Retorno em garantia: '||v_claim.reason,v_claim.diagnosis,p_opinion,0,v_claim.id,auth.uid(),auth.uid()) returning id into v_order;
  update public.warranty_claims set status='approved',return_work_order_id=v_order,approved_by=auth.uid(),approved_at=now(),technical_opinion=p_opinion,updated_by=auth.uid() where id=v_claim.id;
  update public.warranties set status='claimed',updated_by=auth.uid() where id=v_claim.warranty_id;
 else
  update public.warranty_claims set status='rejected',approved_by=auth.uid(),approved_at=now(),technical_opinion=p_opinion,updated_by=auth.uid() where id=v_claim.id;
 end if;
 return v_order;
end;
$$;

create or replace function public.create_portal_access(p_customer_id uuid,p_work_order_id uuid default null,p_hours integer default 72)
returns text security definer set search_path=public,extensions set row_security=off language plpgsql as $$
declare v_customer public.customers%rowtype; v_branch uuid; v_token text;
begin
 select * into v_customer from public.customers where id=p_customer_id and deleted_at is null;
 if v_customer.id is null then raise exception 'customer_not_found'; end if;
 v_branch:=v_customer.primary_branch_id;
 if p_work_order_id is not null then
  select branch_id into v_branch from public.work_orders where id=p_work_order_id and customer_id=p_customer_id and organization_id=v_customer.organization_id and deleted_at is null;
  if v_branch is null then raise exception 'work_order_scope_mismatch'; end if;
 end if;
 if not public.has_permission(v_customer.organization_id,v_branch,'portal.manage') then raise exception 'permission_denied'; end if;
 if p_hours<1 or p_hours>720 then raise exception 'invalid_expiration'; end if;
 v_token:=encode(gen_random_bytes(32),'hex');
 insert into public.portal_access_tokens(organization_id,branch_id,customer_id,work_order_id,token_hash,expires_at,created_by)
 values(v_customer.organization_id,v_branch,p_customer_id,p_work_order_id,encode(digest(v_token,'sha256'),'hex'),now()+make_interval(hours=>p_hours),auth.uid());
 return v_token;
end;
$$;

create or replace function public.get_customer_portal(p_token text)
returns jsonb security definer set search_path=public,extensions set row_security=off language plpgsql as $$
declare v_access public.portal_access_tokens%rowtype; v_result jsonb;
begin
 if p_token is null or length(p_token)<40 then raise exception 'invalid_token'; end if;
 select * into v_access from public.portal_access_tokens where token_hash=encode(digest(p_token,'sha256'),'hex') and revoked_at is null and expires_at>now() for update;
 if v_access.id is null then raise exception 'invalid_or_expired_token'; end if;
 update public.portal_access_tokens set last_used_at=now() where id=v_access.id;
 select jsonb_build_object(
  'customer',jsonb_build_object('name',c.name),
  'expires_at',v_access.expires_at,
  'vehicles',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'plate',v.license_plate,'brand',v.brand,'model',v.model,'mileage',v.mileage)) from public.vehicles v where v.customer_id=c.id and v.deleted_at is null),'[]'::jsonb),
  'work_orders',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'number',w.number,'status',w.status,'complaint',w.customer_complaint,'entry_at',w.entry_at,'due_at',w.due_at,'total',w.total,'vehicle_id',w.vehicle_id) order by w.entry_at desc) from public.work_orders w where w.customer_id=c.id and w.deleted_at is null and (v_access.work_order_id is null or w.id=v_access.work_order_id)),'[]'::jsonb),
  'estimates',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'number',e.number,'status',e.status,'valid_until',e.valid_until,'total',e.total,'items',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'description',i.description,'quantity',i.quantity,'total',i.total,'approval_status',i.approval_status) order by i.sort_order),'[]'::jsonb) from public.estimate_items i where i.estimate_id=e.id))) from public.estimates e where e.customer_id=c.id and e.deleted_at is null and (v_access.work_order_id is null or exists(select 1 from public.work_orders w where w.id=v_access.work_order_id and w.estimate_id=e.id))),'[]'::jsonb),
  'warranties',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'description',g.description,'type',g.warranty_type,'starts_at',g.starts_at,'expires_at',g.expires_at,'status',g.status) order by g.expires_at desc) from public.warranties g where g.customer_id=c.id and g.deleted_at is null),'[]'::jsonb)
 ) into v_result from public.customers c where c.id=v_access.customer_id;
 return v_result;
end;
$$;

create or replace function public.portal_respond_estimate(p_token text,p_estimate_id uuid,p_decision text,p_notes text default null)
returns void security definer set search_path=public,extensions set row_security=off language plpgsql as $$
declare v_access public.portal_access_tokens%rowtype; v_estimate public.estimates%rowtype;
begin
 if p_decision not in ('approved','rejected') then raise exception 'invalid_decision'; end if;
 select * into v_access from public.portal_access_tokens where token_hash=encode(digest(p_token,'sha256'),'hex') and revoked_at is null and expires_at>now();
 select * into v_estimate from public.estimates where id=p_estimate_id and customer_id=v_access.customer_id and deleted_at is null for update;
 if v_access.id is null or v_estimate.id is null or v_estimate.status not in ('sent','viewed','partially_approved') then raise exception 'invalid_portal_scope_or_status'; end if;
 if v_access.work_order_id is not null and not exists(select 1 from public.work_orders where id=v_access.work_order_id and estimate_id=v_estimate.id) then raise exception 'invalid_portal_scope'; end if;
 update public.estimate_items set approval_status=p_decision,rejection_reason=case when p_decision='rejected' then p_notes else null end,updated_at=now() where estimate_id=v_estimate.id;
 update public.estimates set status=p_decision,approved_at=case when p_decision='approved' then now() else approved_at end,viewed_at=coalesce(viewed_at,now()),updated_at=now() where id=v_estimate.id;
 insert into public.estimate_approvals(organization_id,estimate_id,approved_by_name,decision,notes) values(v_estimate.organization_id,v_estimate.id,'Cliente via portal',p_decision,p_notes);
end;
$$;

create or replace function public.portal_submit_rating(p_token text,p_work_order_id uuid,p_rating smallint,p_comment text default null)
returns void security definer set search_path=public,extensions set row_security=off language plpgsql as $$
declare v_access public.portal_access_tokens%rowtype; v_order public.work_orders%rowtype;
begin
 select * into v_access from public.portal_access_tokens where token_hash=encode(digest(p_token,'sha256'),'hex') and revoked_at is null and expires_at>now();
 select * into v_order from public.work_orders where id=p_work_order_id and customer_id=v_access.customer_id and deleted_at is null;
 if v_access.id is null or v_order.id is null or p_rating not between 1 and 5 then raise exception 'invalid_rating_scope'; end if;
 if v_access.work_order_id is not null and v_access.work_order_id<>v_order.id then raise exception 'invalid_portal_scope'; end if;
 insert into public.customer_feedback(organization_id,branch_id,customer_id,work_order_id,rating,comment)
 values(v_order.organization_id,v_order.branch_id,v_order.customer_id,v_order.id,p_rating,nullif(trim(p_comment),''))
 on conflict(customer_id,work_order_id,source) do update set rating=excluded.rating,comment=excluded.comment,created_at=now();
end;
$$;

create or replace function public.run_automation_cycle(p_branch_id uuid)
returns integer security definer set search_path=public set row_security=off language plpgsql as $$
declare v_rule public.automation_rules%rowtype; v_target record; v_count integer:=0; v_body text; v_recipient text; v_key text;
begin
 if not exists(select 1 from public.branches b where b.id=p_branch_id and public.has_permission(b.organization_id,b.id,'automations.manage')) then raise exception 'permission_denied'; end if;
 for v_rule in select * from public.automation_rules where branch_id=p_branch_id and active and deleted_at is null loop
  for v_target in
   select c.id customer_id,v.id vehicle_id,w.id warranty_id,c.name,c.primary_phone,c.whatsapp,c.primary_email,v.license_plate,v.brand,v.model,wo.number work_order_number,wo.total
   from public.customers c
   left join public.vehicles v on v.customer_id=c.id and v.deleted_at is null
   left join public.warranties w on w.customer_id=c.id and (v.id is null or w.vehicle_id=v.id) and w.deleted_at is null and w.status='active'
   left join lateral(select x.number,x.total,x.delivered_at from public.work_orders x where x.customer_id=c.id and (v.id is null or x.vehicle_id=v.id) and x.deleted_at is null order by x.entry_at desc limit 1) wo on true
   where c.organization_id=v_rule.organization_id and c.deleted_at is null and c.communication_consent
    and case v_rule.event_type
      when 'birthday' then c.birth_date is not null and extract(month from c.birth_date)=extract(month from current_date) and extract(day from c.birth_date)=extract(day from current_date)
      when 'service_due' then v.next_service_at is not null and v.next_service_at<=current_date+v_rule.days_offset
      when 'preventive_due' then v.next_service_at is not null and v.next_service_at<=current_date+v_rule.days_offset
      when 'warranty_expiring' then w.expires_at is not null and w.expires_at between current_date and current_date+v_rule.days_offset
      when 'inactive_customer' then coalesce(wo.delivered_at::date,c.created_at::date)<=current_date-greatest(30,abs(v_rule.days_offset))
      when 'rating_request' then wo.delivered_at::date=current_date-greatest(0,v_rule.days_offset)
      else false end
  loop
   v_key:=v_rule.id||':'||v_target.customer_id||':'||coalesce(v_target.vehicle_id::text,'-')||':'||coalesce(v_target.warranty_id::text,'-')||':'||current_date;
   select replace(replace(replace(replace(replace(coalesce(t.body,v_rule.name),'{{nome}}',v_target.name),'{{placa}}',coalesce(v_target.license_plate,'')),'{{veiculo}}',trim(coalesce(v_target.brand,'')||' '||coalesce(v_target.model,''))),'{{os}}',coalesce(v_target.work_order_number,'')),'{{valor}}',coalesce(v_target.total::text,'')),t.subject
   into v_body,v_recipient from public.message_templates t where t.id=v_rule.template_id;
   v_recipient:=case v_rule.channel when 'email' then v_target.primary_email else coalesce(v_target.whatsapp,v_target.primary_phone) end;
   if v_recipient is not null then
    insert into public.automation_jobs(organization_id,branch_id,rule_id,customer_id,vehicle_id,warranty_id,rendered_body,channel,recipient,idempotency_key,created_by,updated_by)
    values(v_rule.organization_id,v_rule.branch_id,v_rule.id,v_target.customer_id,v_target.vehicle_id,v_target.warranty_id,v_body,v_rule.channel,v_recipient,v_key,auth.uid(),auth.uid()) on conflict(organization_id,idempotency_key) do nothing;
    if found then v_count:=v_count+1; end if;
   end if;
  end loop;
 end loop;
 return v_count;
end;
$$;

create view public.crm_customer_overview with(security_invoker=true) as
select c.organization_id,c.primary_branch_id as branch_id,c.id as customer_id,c.name,c.birth_date,c.classification,c.communication_consent,
 (select count(*) from public.vehicles v where v.customer_id=c.id and v.deleted_at is null) vehicle_count,
 (select count(*) from public.work_orders w where w.customer_id=c.id and w.deleted_at is null) work_order_count,
 coalesce((select sum(w.total) from public.work_orders w where w.customer_id=c.id and w.status='delivered' and w.deleted_at is null),0) lifetime_value,
 (select max(w.entry_at) from public.work_orders w where w.customer_id=c.id and w.deleted_at is null) last_visit_at,
 coalesce((select sum(r.outstanding_amount) from public.receivables r where r.customer_id=c.id and r.status in('open','overdue','partial') and r.deleted_at is null),0) outstanding_amount,
 coalesce((select avg(f.rating) from public.customer_feedback f where f.customer_id=c.id),0) average_rating
from public.customers c where c.deleted_at is null;

create view public.bi_branch_overview with(security_invoker=true) as
select b.organization_id,b.id branch_id,
 (select count(*) from public.customers c where c.organization_id=b.organization_id and c.deleted_at is null) active_customers,
 (select count(*) from public.work_orders w where w.branch_id=b.id and w.status not in('delivered','cancelled') and w.deleted_at is null) open_orders,
 coalesce((select sum(w.total) from public.work_orders w where w.branch_id=b.id and w.status='delivered' and w.delivered_at>=date_trunc('month',now()) and w.deleted_at is null),0) month_revenue,
 coalesce((select sum(t.direction*t.amount) from public.financial_transactions t where t.branch_id=b.id and t.occurred_at>=date_trunc('month',now())),0) month_cash,
 coalesce((select avg(f.rating) from public.customer_feedback f where f.branch_id=b.id),0) average_rating,
 coalesce((select count(*) from public.warranty_claims g where g.branch_id=b.id and g.status not in('completed','rejected','cancelled') and g.deleted_at is null),0) open_warranty_claims
from public.branches b where b.deleted_at is null;

create view public.bi_monthly_performance with(security_invoker=true) as
select w.organization_id,w.branch_id,date_trunc('month',coalesce(w.delivered_at,w.created_at))::date period_month,
 count(*) filter(where w.status='delivered') delivered_orders,coalesce(sum(w.total) filter(where w.status='delivered'),0) revenue,
 coalesce(sum(coalesce(ic.cost,0)) filter(where w.status='delivered'),0) cost
from public.work_orders w left join (select work_order_id,sum(quantity*unit_cost) cost from public.work_order_items group by work_order_id) ic on ic.work_order_id=w.id
where w.deleted_at is null group by w.organization_id,w.branch_id,date_trunc('month',coalesce(w.delivered_at,w.created_at))::date;

create view public.fleet_monthly_billing with(security_invoker=true) as
select fc.organization_id,fc.branch_id,fc.id contract_id,fc.code,fc.name,date_trunc('month',w.delivered_at)::date period_month,count(distinct w.id) orders,coalesce(sum(w.total),0) total
from public.fleet_contracts fc join public.fleet_vehicles fv on fv.contract_id=fc.id and fv.deleted_at is null join public.work_orders w on w.vehicle_id=fv.vehicle_id and w.status='delivered' and w.deleted_at is null
where fc.deleted_at is null group by fc.organization_id,fc.branch_id,fc.id,date_trunc('month',w.delivered_at)::date;

alter table public.customer_segments enable row level security; alter table public.customer_segment_members enable row level security;
alter table public.warranties enable row level security; alter table public.warranty_claims enable row level security;
alter table public.fleet_contracts enable row level security; alter table public.fleet_drivers enable row level security; alter table public.fleet_vehicles enable row level security;
alter table public.message_templates enable row level security; alter table public.automation_rules enable row level security; alter table public.automation_jobs enable row level security;
alter table public.customer_feedback enable row level security; alter table public.portal_access_tokens enable row level security;
alter table public.integration_connections enable row level security; alter table public.integration_events enable row level security;

create policy customer_segments_select on public.customer_segments for select using(deleted_at is null and public.has_permission(organization_id,null,'crm.view'));
create policy customer_segments_manage on public.customer_segments for all using(public.has_permission(organization_id,null,'crm.manage')) with check(public.has_permission(organization_id,null,'crm.manage'));
create policy customer_segment_members_select on public.customer_segment_members for select using(public.has_permission(organization_id,null,'crm.view'));
create policy customer_segment_members_manage on public.customer_segment_members for all using(public.has_permission(organization_id,null,'crm.manage')) with check(public.has_permission(organization_id,null,'crm.manage'));
create policy warranties_select on public.warranties for select using(deleted_at is null and public.has_permission(organization_id,branch_id,'warranties.view'));
create policy warranties_manage on public.warranties for all using(public.has_permission(organization_id,branch_id,'warranties.manage')) with check(public.has_permission(organization_id,branch_id,'warranties.manage'));
create policy warranty_claims_select on public.warranty_claims for select using(deleted_at is null and public.has_permission(organization_id,branch_id,'warranties.view'));
create policy warranty_claims_manage on public.warranty_claims for all using(public.has_permission(organization_id,branch_id,'warranties.manage')) with check(public.has_permission(organization_id,branch_id,'warranties.manage'));
create policy fleet_contracts_select on public.fleet_contracts for select using(deleted_at is null and public.has_permission(organization_id,branch_id,'fleets.view'));
create policy fleet_contracts_manage on public.fleet_contracts for all using(public.has_permission(organization_id,branch_id,'fleets.manage')) with check(public.has_permission(organization_id,branch_id,'fleets.manage'));
create policy fleet_drivers_select on public.fleet_drivers for select using(deleted_at is null and public.has_permission(organization_id,branch_id,'fleets.view'));
create policy fleet_drivers_manage on public.fleet_drivers for all using(public.has_permission(organization_id,branch_id,'fleets.manage')) with check(public.has_permission(organization_id,branch_id,'fleets.manage'));
create policy fleet_vehicles_select on public.fleet_vehicles for select using(deleted_at is null and public.has_permission(organization_id,branch_id,'fleets.view'));
create policy fleet_vehicles_manage on public.fleet_vehicles for all using(public.has_permission(organization_id,branch_id,'fleets.manage')) with check(public.has_permission(organization_id,branch_id,'fleets.manage'));
create policy message_templates_select on public.message_templates for select using(deleted_at is null and public.has_permission(organization_id,branch_id,'automations.view'));
create policy message_templates_manage on public.message_templates for all using(public.has_permission(organization_id,branch_id,'automations.manage')) with check(public.has_permission(organization_id,branch_id,'automations.manage'));
create policy automation_rules_select on public.automation_rules for select using(deleted_at is null and public.has_permission(organization_id,branch_id,'automations.view'));
create policy automation_rules_manage on public.automation_rules for all using(public.has_permission(organization_id,branch_id,'automations.manage')) with check(public.has_permission(organization_id,branch_id,'automations.manage'));
create policy automation_jobs_select on public.automation_jobs for select using(public.has_permission(organization_id,branch_id,'automations.view'));
create policy feedback_select on public.customer_feedback for select using(public.has_permission(organization_id,branch_id,'crm.view'));
create policy portal_tokens_select on public.portal_access_tokens for select using(public.has_permission(organization_id,branch_id,'portal.view'));
create policy portal_tokens_manage on public.portal_access_tokens for update using(public.has_permission(organization_id,branch_id,'portal.manage')) with check(public.has_permission(organization_id,branch_id,'portal.manage'));
create policy integrations_select on public.integration_connections for select using(deleted_at is null and public.has_permission(organization_id,branch_id,'integrations.view'));
create policy integrations_manage on public.integration_connections for all using(public.has_permission(organization_id,branch_id,'integrations.manage')) with check(public.has_permission(organization_id,branch_id,'integrations.manage'));
create policy integration_events_select on public.integration_events for select using(public.has_permission(organization_id,branch_id,'integrations.view'));

grant select,insert,update,delete on public.customer_segments,public.customer_segment_members,public.warranties,public.warranty_claims,public.fleet_contracts,public.fleet_drivers,public.fleet_vehicles,public.message_templates,public.automation_rules,public.integration_connections to authenticated;
grant select on public.automation_jobs,public.customer_feedback,public.portal_access_tokens,public.integration_events,public.crm_customer_overview,public.bi_branch_overview,public.bi_monthly_performance,public.fleet_monthly_billing to authenticated;
revoke all on public.customer_segments,public.customer_segment_members,public.warranties,public.warranty_claims,public.fleet_contracts,public.fleet_drivers,public.fleet_vehicles,public.message_templates,public.automation_rules,public.automation_jobs,public.customer_feedback,public.portal_access_tokens,public.integration_connections,public.integration_events,public.crm_customer_overview,public.bi_branch_overview,public.bi_monthly_performance,public.fleet_monthly_billing from anon;

revoke all on function public.generate_work_order_warranties() from public,anon,authenticated;
revoke all on function public.guard_warranty_claim_status() from public,anon,authenticated;
revoke all on function public.approve_warranty_claim(uuid,boolean,text) from public,anon;
revoke all on function public.create_portal_access(uuid,uuid,integer) from public,anon;
revoke all on function public.get_customer_portal(text) from public,authenticated;
revoke all on function public.portal_respond_estimate(text,uuid,text,text) from public,authenticated;
revoke all on function public.portal_submit_rating(text,uuid,smallint,text) from public,authenticated;
revoke all on function public.run_automation_cycle(uuid) from public,anon;
grant execute on function public.approve_warranty_claim(uuid,boolean,text) to authenticated;
grant execute on function public.create_portal_access(uuid,uuid,integer) to authenticated;
grant execute on function public.get_customer_portal(text) to anon,authenticated;
grant execute on function public.portal_respond_estimate(text,uuid,text,text) to anon,authenticated;
grant execute on function public.portal_submit_rating(text,uuid,smallint,text) to anon,authenticated;
grant execute on function public.run_automation_cycle(uuid) to authenticated;

create trigger audit_warranties after insert or update or delete on public.warranties for each row execute function public.write_audit_log();
create trigger audit_warranty_claims after insert or update or delete on public.warranty_claims for each row execute function public.write_audit_log();
create trigger audit_fleet_contracts after insert or update or delete on public.fleet_contracts for each row execute function public.write_audit_log();
create trigger audit_automation_rules after insert or update or delete on public.automation_rules for each row execute function public.write_audit_log();
create trigger audit_integration_connections after insert or update or delete on public.integration_connections for each row execute function public.write_audit_log();

commit;
