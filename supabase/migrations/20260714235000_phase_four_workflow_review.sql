begin;

create or replace function public.enforce_payable_approval()
returns trigger language plpgsql as $$
declare v_requires_approval boolean;
begin
  v_requires_approval := case
    when tg_op = 'INSERT' then new.status in ('approved','open','overdue','partial','paid')
    else new.status is distinct from old.status and new.status in ('approved','open','overdue','partial','paid')
  end;
  if v_requires_approval then
    if not public.has_permission(new.organization_id,new.branch_id,'financial.approve') then raise exception 'approval_permission_required'; end if;
    new.approved_by := auth.uid();
    new.approved_at := coalesce(new.approved_at,now());
  end if;
  return new;
end;
$$;
drop trigger if exists payables_enforce_approval on public.payables;
create trigger payables_enforce_approval before insert or update on public.payables for each row execute function public.enforce_payable_approval();

create or replace function public.generate_financial_title_from_source()
returns trigger security definer set search_path=public set row_security=off language plpgsql as $$
begin
  if tg_table_name='work_orders' and new.status='delivered' and old.status is distinct from new.status and new.total>0 then
    insert into public.receivables(organization_id,branch_id,customer_id,work_order_id,number,document,description,due_date,original_amount,status,created_by,updated_by)
    select new.organization_id,new.branch_id,new.customer_id,new.id,'','OS '||new.number,'Ordem de serviço '||new.number,current_date,new.total,'open',auth.uid(),auth.uid()
    where not exists(select 1 from public.receivables where work_order_id=new.id and deleted_at is null);
  elsif tg_table_name='purchase_orders' and new.status='received' and old.status is distinct from new.status and new.total>0 then
    insert into public.payables(organization_id,branch_id,supplier_id,purchase_order_id,number,document,description,due_date,original_amount,status,created_by,updated_by)
    select new.organization_id,new.branch_id,new.supplier_id,new.id,'','PC '||new.number,'Pedido de compra '||new.number,coalesce(new.expected_at,current_date),new.total,'pending_approval',auth.uid(),auth.uid()
    where not exists(select 1 from public.payables where purchase_order_id=new.id and deleted_at is null);
  end if;
  return new;
end;
$$;

create or replace function public.generate_work_order_commissions()
returns trigger security definer set search_path=public set row_security=off language plpgsql as $$
declare v_rule public.commission_rules%rowtype; v_basis numeric; v_user uuid; v_name text;
begin
  if new.status <> 'delivered' or old.status is not distinct from new.status then return new; end if;
  for v_rule in select * from public.commission_rules where organization_id=new.organization_id and branch_id=new.branch_id and active and deleted_at is null loop
    v_user := case
      when v_rule.beneficiary_role = 'mechanic' then new.technician_id
      when v_rule.beneficiary_role = 'service_advisor' then new.consultant_id
      else coalesce(new.updated_by,new.created_by,auth.uid())
    end;
    if v_user is null then continue; end if;
    if v_rule.beneficiary_role is not null and v_rule.beneficiary_role not in ('mechanic','service_advisor') and not exists (
      select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
      where ur.user_id=v_user and ur.organization_id=new.organization_id and (ur.branch_id is null or ur.branch_id=new.branch_id)
        and r.code=v_rule.beneficiary_role and r.deleted_at is null
    ) then continue; end if;
    select coalesce(full_name,'Equipe') into v_name from public.profiles where id=v_user;
    v_name := coalesce(nullif(v_name,''),'Equipe');
    v_basis := case v_rule.basis
      when 'service' then coalesce((select sum(total) from public.work_order_items where work_order_id=new.id and item_type in ('service','outsourced')),0)
      when 'product' then coalesce((select sum(total) from public.work_order_items where work_order_id=new.id and item_type in ('part','supply')),0)
      when 'gross_profit' then greatest(0,new.total-coalesce((select sum(quantity*unit_cost) from public.work_order_items where work_order_id=new.id),0))
      else new.total end;
    if (v_rule.minimum_base is null or v_basis>=v_rule.minimum_base) and (v_rule.maximum_base is null or v_basis<=v_rule.maximum_base) then
      insert into public.commissions(organization_id,branch_id,rule_id,work_order_id,beneficiary_user_id,beneficiary_name,competence_date,basis_amount,rate_percent,amount,status,confirmed_at,created_by,updated_by)
      select new.organization_id,new.branch_id,v_rule.id,new.id,v_user,v_name,current_date,v_basis,v_rule.rate_percent,round(v_basis*v_rule.rate_percent/100+v_rule.fixed_amount,2),'confirmed',now(),auth.uid(),auth.uid()
      where not exists(select 1 from public.commissions where rule_id=v_rule.id and work_order_id=new.id and beneficiary_user_id=v_user and status<>'reversed' and deleted_at is null);
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function public.generate_work_order_commissions() from public,anon,authenticated;
revoke all on function public.generate_financial_title_from_source() from public,anon,authenticated;

commit;
