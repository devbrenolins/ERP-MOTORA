begin;

create or replace function public.guard_financial_settlement()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if (new.paid_amount > 0 or new.status in ('paid','partial')) and current_setting('app.finance_settlement', true) <> 'on' then
      raise exception 'settlement_function_required';
    end if;
  else
    if new.paid_amount is distinct from old.paid_amount and current_setting('app.finance_settlement', true) <> 'on' then raise exception 'settlement_function_required'; end if;
    if new.status is distinct from old.status and new.status in ('paid','partial') and current_setting('app.finance_settlement', true) <> 'on' then raise exception 'settlement_function_required'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists receivables_guard_settlement on public.receivables;
drop trigger if exists payables_guard_settlement on public.payables;
create trigger receivables_guard_settlement before insert or update on public.receivables for each row execute function public.guard_financial_settlement();
create trigger payables_guard_settlement before insert or update on public.payables for each row execute function public.guard_financial_settlement();

create or replace function public.enforce_payable_approval()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status and new.status = 'approved' then
    if not public.has_permission(new.organization_id,new.branch_id,'financial.approve') then raise exception 'approval_permission_required'; end if;
    new.approved_by := auth.uid(); new.approved_at := coalesce(new.approved_at,now());
  end if;
  return new;
end;
$$;
create trigger payables_enforce_approval before update on public.payables for each row execute function public.enforce_payable_approval();

create or replace function public.sync_payment_to_cash()
returns trigger security definer set search_path=public set row_security=off language plpgsql as $$
declare v_account_type text; v_session uuid;
begin
  if new.transaction_type not in ('receivable_payment','payable_payment') then return new; end if;
  select account_type into v_account_type from public.financial_accounts where id=new.account_id;
  if v_account_type <> 'cash' then return new; end if;
  select id into v_session from public.cash_sessions where account_id=new.account_id and status='open' and deleted_at is null for update;
  if v_session is null then raise exception 'cash_session_required'; end if;
  insert into public.cash_movements(organization_id,branch_id,cash_session_id,financial_transaction_id,movement_type,direction,amount,description,created_by)
  values(new.organization_id,new.branch_id,v_session,new.id,case when new.direction=1 then 'receipt' else 'payment' end,new.direction,new.amount,new.description,new.created_by);
  return new;
end;
$$;
create trigger financial_transactions_sync_cash after insert on public.financial_transactions for each row execute function public.sync_payment_to_cash();

create or replace function public.generate_work_order_commissions()
returns trigger security definer set search_path=public set row_security=off language plpgsql as $$
declare v_rule public.commission_rules%rowtype; v_basis numeric; v_user uuid; v_name text;
begin
  if new.status <> 'delivered' or old.status is not distinct from new.status then return new; end if;
  v_user := coalesce(new.updated_by,new.created_by,auth.uid());
  select coalesce(full_name,'Equipe') into v_name from public.profiles where id=v_user;
  v_name := coalesce(nullif(v_name,''),'Equipe');
  for v_rule in select * from public.commission_rules where organization_id=new.organization_id and branch_id=new.branch_id and active and deleted_at is null loop
    v_basis := case v_rule.basis
      when 'service' then coalesce((select sum(total) from public.work_order_items where work_order_id=new.id and item_type in ('service','outsourced')),0)
      when 'product' then coalesce((select sum(total) from public.work_order_items where work_order_id=new.id and item_type in ('part','supply')),0)
      when 'gross_profit' then greatest(0,new.total-coalesce((select sum(quantity*unit_cost) from public.work_order_items where work_order_id=new.id),0))
      else new.total end;
    if (v_rule.minimum_base is null or v_basis>=v_rule.minimum_base) and (v_rule.maximum_base is null or v_basis<=v_rule.maximum_base) then
      insert into public.commissions(organization_id,branch_id,rule_id,work_order_id,beneficiary_user_id,beneficiary_name,competence_date,basis_amount,rate_percent,amount,status,confirmed_at,created_by,updated_by)
      select new.organization_id,new.branch_id,v_rule.id,new.id,v_user,v_name,current_date,v_basis,v_rule.rate_percent,round(v_basis*v_rule.rate_percent/100+v_rule.fixed_amount,2),'confirmed',now(),auth.uid(),auth.uid()
      where not exists(select 1 from public.commissions where rule_id=v_rule.id and work_order_id=new.id and status<>'reversed' and deleted_at is null);
    end if;
  end loop;
  return new;
end;
$$;
create trigger work_orders_generate_commissions after update on public.work_orders for each row execute function public.generate_work_order_commissions();

create or replace function public.protect_paid_commission()
returns trigger language plpgsql as $$
begin
  if old.status='paid' and (new.amount is distinct from old.amount or new.basis_amount is distinct from old.basis_amount or new.rate_percent is distinct from old.rate_percent)
    and not public.has_permission(new.organization_id,new.branch_id,'financial.reverse') then raise exception 'paid_commission_is_locked'; end if;
  if new.status is distinct from old.status and new.status='paid' then
    if not public.has_permission(new.organization_id,new.branch_id,'financial.pay') then raise exception 'payment_permission_required'; end if;
    new.paid_at:=coalesce(new.paid_at,now());
  end if;
  return new;
end;
$$;
create trigger commissions_protect_paid before update on public.commissions for each row execute function public.protect_paid_commission();

do $$
declare v_function regprocedure;
begin
  for v_function in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef loop
    execute format('revoke all on function %s from public',v_function);
    execute format('revoke all on function %s from anon',v_function);
  end loop;
end;
$$;
grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.is_branch_member(uuid) to authenticated;
grant execute on function public.has_permission(uuid,uuid,text) to authenticated;
grant execute on function public.complete_onboarding(text,text,text,text,text,text) to authenticated;
grant execute on function public.convert_estimate_to_work_order(uuid) to authenticated;
grant execute on function public.post_stock_movement(uuid,uuid,text,numeric,numeric,text,uuid,text,text) to authenticated;
grant execute on function public.reserve_stock(uuid,uuid,uuid,numeric) to authenticated;
grant execute on function public.release_stock_reservation(uuid,text) to authenticated;
grant execute on function public.receive_purchase_order(uuid,text) to authenticated;
grant execute on function public.complete_stock_transfer(uuid) to authenticated;
grant execute on function public.complete_stock_count(uuid) to authenticated;
grant execute on function public.settle_receivable(uuid,numeric,uuid,uuid,timestamptz,text) to authenticated;
grant execute on function public.settle_payable(uuid,numeric,uuid,uuid,timestamptz,text) to authenticated;
grant execute on function public.open_cash_session(uuid,numeric) to authenticated;
grant execute on function public.post_cash_movement(uuid,text,numeric,text) to authenticated;
grant execute on function public.close_cash_session(uuid,numeric,text) to authenticated;

commit;
