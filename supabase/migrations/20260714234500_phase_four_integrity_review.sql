begin;

create or replace function public.validate_financial_scope()
returns trigger
security definer
set search_path = public
set row_security = off
language plpgsql
as $$
begin
  if (select organization_id from public.branches where id = new.branch_id and deleted_at is null) is distinct from new.organization_id then
    raise exception 'branch_organization_mismatch';
  end if;

  if tg_table_name = 'receivables' then
    if new.customer_id is not null and not exists (select 1 from public.customers where id = new.customer_id and organization_id = new.organization_id and deleted_at is null) then raise exception 'customer_scope_mismatch'; end if;
    if new.work_order_id is not null and not exists (select 1 from public.work_orders where id = new.work_order_id and organization_id = new.organization_id and branch_id = new.branch_id and deleted_at is null) then raise exception 'work_order_scope_mismatch'; end if;
    if new.category_id is not null and not exists (select 1 from public.financial_categories where id = new.category_id and organization_id = new.organization_id and category_type = 'income' and deleted_at is null) then raise exception 'category_scope_mismatch'; end if;
    if new.cost_center_id is not null and not exists (select 1 from public.cost_centers where id = new.cost_center_id and organization_id = new.organization_id and branch_id = new.branch_id and deleted_at is null) then raise exception 'cost_center_scope_mismatch'; end if;
  elsif tg_table_name = 'payables' then
    if new.supplier_id is not null and not exists (select 1 from public.suppliers where id = new.supplier_id and organization_id = new.organization_id and deleted_at is null) then raise exception 'supplier_scope_mismatch'; end if;
    if new.purchase_order_id is not null and not exists (select 1 from public.purchase_orders where id = new.purchase_order_id and organization_id = new.organization_id and branch_id = new.branch_id and deleted_at is null) then raise exception 'purchase_order_scope_mismatch'; end if;
    if new.category_id is not null and not exists (select 1 from public.financial_categories where id = new.category_id and organization_id = new.organization_id and category_type = 'expense' and deleted_at is null) then raise exception 'category_scope_mismatch'; end if;
    if new.cost_center_id is not null and not exists (select 1 from public.cost_centers where id = new.cost_center_id and organization_id = new.organization_id and branch_id = new.branch_id and deleted_at is null) then raise exception 'cost_center_scope_mismatch'; end if;
  elsif tg_table_name = 'financial_transactions' then
    if not exists (select 1 from public.financial_accounts where id = new.account_id and organization_id = new.organization_id and branch_id = new.branch_id and active and deleted_at is null) then raise exception 'account_scope_mismatch'; end if;
    if new.receivable_id is not null and not exists (select 1 from public.receivables where id = new.receivable_id and organization_id = new.organization_id and branch_id = new.branch_id and deleted_at is null) then raise exception 'receivable_scope_mismatch'; end if;
    if new.payable_id is not null and not exists (select 1 from public.payables where id = new.payable_id and organization_id = new.organization_id and branch_id = new.branch_id and deleted_at is null) then raise exception 'payable_scope_mismatch'; end if;
    if new.payment_method_id is not null and not exists (select 1 from public.payment_methods where id = new.payment_method_id and organization_id = new.organization_id and branch_id = new.branch_id and active and deleted_at is null) then raise exception 'payment_method_scope_mismatch'; end if;
    if new.category_id is not null and not exists (select 1 from public.financial_categories where id = new.category_id and organization_id = new.organization_id and deleted_at is null) then raise exception 'category_scope_mismatch'; end if;
    if new.cost_center_id is not null and not exists (select 1 from public.cost_centers where id = new.cost_center_id and organization_id = new.organization_id and branch_id = new.branch_id and deleted_at is null) then raise exception 'cost_center_scope_mismatch'; end if;
  elsif tg_table_name = 'cash_sessions' then
    if not exists (select 1 from public.financial_accounts where id = new.account_id and organization_id = new.organization_id and branch_id = new.branch_id and account_type = 'cash' and active and deleted_at is null) then raise exception 'cash_account_scope_mismatch'; end if;
  elsif tg_table_name = 'cash_movements' then
    if not exists (select 1 from public.cash_sessions where id = new.cash_session_id and organization_id = new.organization_id and branch_id = new.branch_id and deleted_at is null) then raise exception 'cash_session_scope_mismatch'; end if;
    if new.financial_transaction_id is not null and not exists (select 1 from public.financial_transactions where id = new.financial_transaction_id and organization_id = new.organization_id and branch_id = new.branch_id) then raise exception 'financial_transaction_scope_mismatch'; end if;
  elsif tg_table_name = 'commissions' then
    if new.rule_id is not null and not exists (select 1 from public.commission_rules where id = new.rule_id and organization_id = new.organization_id and branch_id = new.branch_id and deleted_at is null) then raise exception 'commission_rule_scope_mismatch'; end if;
    if new.work_order_id is not null and not exists (select 1 from public.work_orders where id = new.work_order_id and organization_id = new.organization_id and branch_id = new.branch_id and deleted_at is null) then raise exception 'work_order_scope_mismatch'; end if;
  end if;
  return new;
end;
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array['cost_centers','financial_accounts','payment_methods','receivables','payables','financial_transactions','cash_sessions','cash_movements','commission_rules','commissions'] loop
    execute format('create trigger %I_validate_scope before insert or update on public.%I for each row execute function public.validate_financial_scope()', v_table, v_table);
  end loop;
end;
$$;

create or replace function public.validate_financial_category_scope()
returns trigger
security definer
set search_path = public
set row_security = off
language plpgsql
as $$
begin
  if new.parent_id is not null and not exists (
    select 1 from public.financial_categories
    where id = new.parent_id and organization_id = new.organization_id and category_type = new.category_type and deleted_at is null
  ) then
    raise exception 'parent_category_scope_mismatch';
  end if;
  return new;
end;
$$;
create trigger financial_categories_validate_scope before insert or update on public.financial_categories for each row execute function public.validate_financial_category_scope();

create or replace function public.settle_receivable(p_receivable_id uuid, p_amount numeric, p_account_id uuid, p_payment_method_id uuid, p_paid_at timestamptz default now(), p_notes text default null)
returns uuid security definer set search_path = public set row_security = off language plpgsql as $$
declare v_title public.receivables%rowtype; v_id uuid; v_new_paid numeric; v_total numeric;
begin
  select * into v_title from public.receivables where id = p_receivable_id and deleted_at is null for update;
  if v_title.id is null or v_title.status not in ('open','overdue','partial') then raise exception 'invalid_receivable_status'; end if;
  if not public.has_permission(v_title.organization_id,v_title.branch_id,'financial.pay') then raise exception 'permission_denied'; end if;
  if not exists (select 1 from public.financial_accounts where id = p_account_id and organization_id = v_title.organization_id and branch_id = v_title.branch_id and active and deleted_at is null) then raise exception 'invalid_account_scope'; end if;
  if not exists (select 1 from public.payment_methods where id = p_payment_method_id and organization_id = v_title.organization_id and branch_id = v_title.branch_id and active and deleted_at is null) then raise exception 'invalid_payment_method_scope'; end if;
  if p_amount <= 0 or p_amount > v_title.outstanding_amount then raise exception 'invalid_payment_amount'; end if;
  v_total := v_title.original_amount + v_title.interest_amount + v_title.fine_amount - v_title.discount_amount;
  v_new_paid := v_title.paid_amount + p_amount;
  perform set_config('app.finance_settlement','on',true);
  update public.receivables set paid_amount = v_new_paid, status = case when v_new_paid >= v_total then 'paid' else 'partial' end, updated_by = auth.uid() where id = v_title.id;
  insert into public.financial_transactions (organization_id,branch_id,account_id,transaction_type,direction,amount,occurred_at,receivable_id,payment_method_id,category_id,cost_center_id,description,idempotency_key,created_by)
  values (v_title.organization_id,v_title.branch_id,p_account_id,'receivable_payment',1,p_amount,coalesce(p_paid_at,now()),v_title.id,p_payment_method_id,v_title.category_id,v_title.cost_center_id,coalesce(nullif(p_notes,''),'Recebimento '||v_title.number),'receivable:'||v_title.id||':'||v_new_paid,auth.uid()) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.settle_payable(p_payable_id uuid, p_amount numeric, p_account_id uuid, p_payment_method_id uuid, p_paid_at timestamptz default now(), p_notes text default null)
returns uuid security definer set search_path = public set row_security = off language plpgsql as $$
declare v_title public.payables%rowtype; v_id uuid; v_new_paid numeric; v_total numeric;
begin
  select * into v_title from public.payables where id = p_payable_id and deleted_at is null for update;
  if v_title.id is null or v_title.status not in ('approved','open','overdue','partial') then raise exception 'invalid_payable_status'; end if;
  if not public.has_permission(v_title.organization_id,v_title.branch_id,'financial.pay') then raise exception 'permission_denied'; end if;
  if not exists (select 1 from public.financial_accounts where id = p_account_id and organization_id = v_title.organization_id and branch_id = v_title.branch_id and active and deleted_at is null) then raise exception 'invalid_account_scope'; end if;
  if not exists (select 1 from public.payment_methods where id = p_payment_method_id and organization_id = v_title.organization_id and branch_id = v_title.branch_id and active and deleted_at is null) then raise exception 'invalid_payment_method_scope'; end if;
  if p_amount <= 0 or p_amount > v_title.outstanding_amount then raise exception 'invalid_payment_amount'; end if;
  v_total := v_title.original_amount + v_title.interest_amount + v_title.fine_amount - v_title.discount_amount;
  v_new_paid := v_title.paid_amount + p_amount;
  perform set_config('app.finance_settlement','on',true);
  update public.payables set paid_amount = v_new_paid, status = case when v_new_paid >= v_total then 'paid' else 'partial' end, updated_by = auth.uid() where id = v_title.id;
  insert into public.financial_transactions (organization_id,branch_id,account_id,transaction_type,direction,amount,occurred_at,payable_id,payment_method_id,category_id,cost_center_id,description,idempotency_key,created_by)
  values (v_title.organization_id,v_title.branch_id,p_account_id,'payable_payment',-1,p_amount,coalesce(p_paid_at,now()),v_title.id,p_payment_method_id,v_title.category_id,v_title.cost_center_id,coalesce(nullif(p_notes,''),'Pagamento '||v_title.number),'payable:'||v_title.id||':'||v_new_paid,auth.uid()) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.open_cash_session(p_account_id uuid,p_initial_amount numeric default 0)
returns uuid security definer set search_path=public set row_security=off language plpgsql as $$
declare v_account public.financial_accounts%rowtype; v_id uuid;
begin
  if coalesce(p_initial_amount,0) < 0 then raise exception 'invalid_initial_amount'; end if;
  select * into v_account from public.financial_accounts where id=p_account_id and account_type='cash' and active and deleted_at is null;
  if v_account.id is null or not public.has_permission(v_account.organization_id,v_account.branch_id,'cash.manage') then raise exception 'permission_denied'; end if;
  insert into public.cash_sessions(organization_id,branch_id,account_id,opened_by,initial_amount,created_by,updated_by) values(v_account.organization_id,v_account.branch_id,v_account.id,auth.uid(),coalesce(p_initial_amount,0),auth.uid(),auth.uid()) returning id into v_id;
  insert into public.cash_movements(organization_id,branch_id,cash_session_id,movement_type,direction,amount,description,created_by) values(v_account.organization_id,v_account.branch_id,v_id,'opening',1,coalesce(p_initial_amount,0),'Abertura de caixa',auth.uid());
  return v_id;
end;
$$;

create or replace function public.close_cash_session(p_cash_session_id uuid,p_counted_amount numeric,p_notes text default null)
returns void security definer set search_path=public set row_security=off language plpgsql as $$
declare v_session public.cash_sessions%rowtype; v_expected numeric;
begin
  if p_counted_amount is null or p_counted_amount < 0 then raise exception 'invalid_counted_amount'; end if;
  select * into v_session from public.cash_sessions where id=p_cash_session_id and status='open' and deleted_at is null for update;
  if v_session.id is null or not public.has_permission(v_session.organization_id,v_session.branch_id,'cash.manage') then raise exception 'permission_denied'; end if;
  select v_session.initial_amount + coalesce(sum(direction*amount),0) into v_expected from public.cash_movements where cash_session_id=v_session.id and movement_type<>'opening';
  update public.cash_sessions set status='closed',closed_by=auth.uid(),closed_at=now(),expected_amount=v_expected,counted_amount=p_counted_amount,difference_amount=p_counted_amount-v_expected,closing_notes=p_notes,updated_by=auth.uid() where id=v_session.id;
  insert into public.cash_movements(organization_id,branch_id,cash_session_id,movement_type,direction,amount,description,created_by) values(v_session.organization_id,v_session.branch_id,v_session.id,'closing',1,p_counted_amount,'Fechamento de caixa',auth.uid());
end;
$$;

revoke all on function public.validate_financial_scope() from public, anon, authenticated;
revoke all on function public.validate_financial_category_scope() from public, anon, authenticated;
revoke all on function public.settle_receivable(uuid,numeric,uuid,uuid,timestamptz,text) from public,anon;
revoke all on function public.settle_payable(uuid,numeric,uuid,uuid,timestamptz,text) from public,anon;
revoke all on function public.open_cash_session(uuid,numeric) from public,anon;
revoke all on function public.close_cash_session(uuid,numeric,text) from public,anon;
grant execute on function public.settle_receivable(uuid,numeric,uuid,uuid,timestamptz,text) to authenticated;
grant execute on function public.settle_payable(uuid,numeric,uuid,uuid,timestamptz,text) to authenticated;
grant execute on function public.open_cash_session(uuid,numeric) to authenticated;
grant execute on function public.close_cash_session(uuid,numeric,text) to authenticated;

commit;
