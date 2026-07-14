begin;

insert into public.permissions (code, module, action, description) values
  ('financial.approve', 'financial', 'approve', 'Aprovar títulos e pagamentos'),
  ('financial.pay', 'financial', 'pay', 'Receber e pagar títulos'),
  ('financial.reverse', 'financial', 'reverse', 'Estornar movimentações financeiras'),
  ('cash.view', 'cash', 'view', 'Visualizar caixas e sessões'),
  ('cash.manage', 'cash', 'manage', 'Abrir, movimentar e fechar caixa'),
  ('cash.reopen', 'cash', 'reopen', 'Reabrir caixa fechado'),
  ('commissions.view', 'commissions', 'view', 'Visualizar comissões'),
  ('commissions.manage', 'commissions', 'manage', 'Administrar regras e comissões'),
  ('reports.view', 'reports', 'view', 'Visualizar relatórios'),
  ('reports.export', 'reports', 'export', 'Exportar relatórios')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id, created_by)
select r.id, p.id, r.created_by from public.roles r cross join public.permissions p
where r.code = 'owner' and p.module in ('financial','cash','commissions','reports') on conflict do nothing;
insert into public.role_permissions (role_id, permission_id, created_by)
select r.id, p.id, r.created_by from public.roles r cross join public.permissions p
where r.code = 'administrator' and p.module in ('financial','cash','commissions','reports') and p.code not in ('cash.reopen','financial.reverse') on conflict do nothing;
insert into public.role_permissions (role_id, permission_id, created_by)
select r.id, p.id, r.created_by from public.roles r cross join public.permissions p
where r.code = 'read_only' and p.action = 'view' and p.module in ('financial','cash','commissions','reports') on conflict do nothing;

create table public.financial_categories (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  parent_id uuid references public.financial_categories(id), category_type text not null check (category_type in ('income','expense')),
  code text not null, name text not null, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz,
  unique (organization_id, code)
);
create table public.cost_centers (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), branch_id uuid not null references public.branches(id),
  code text not null, name text not null, active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz, unique (branch_id, code)
);
create table public.financial_accounts (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), branch_id uuid not null references public.branches(id),
  code text not null, name text not null, account_type text not null default 'cash' check (account_type in ('cash','checking','savings','payment','credit_card','other')),
  bank_name text, agency text, account_number text, opening_balance numeric(14,2) not null default 0, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz,
  unique (branch_id, code)
);
create table public.payment_methods (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), branch_id uuid not null references public.branches(id),
  code text not null, name text not null, method_type text not null check (method_type in ('cash','pix','debit_card','credit_card','boleto','bank_transfer','check','store_credit','other')),
  fee_percent numeric(8,4) not null default 0, settlement_days integer not null default 0, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz,
  unique (branch_id, code)
);

create table public.receivables (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), branch_id uuid not null references public.branches(id),
  customer_id uuid references public.customers(id), work_order_id uuid references public.work_orders(id), category_id uuid references public.financial_categories(id), cost_center_id uuid references public.cost_centers(id),
  number text not null default '', document text, description text not null, installment_number integer not null default 1, installment_count integer not null default 1,
  competence_date date not null default current_date, due_date date not null, original_amount numeric(14,2) not null check (original_amount >= 0),
  interest_amount numeric(14,2) not null default 0, fine_amount numeric(14,2) not null default 0, discount_amount numeric(14,2) not null default 0,
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  outstanding_amount numeric(14,2) generated always as (greatest(0, original_amount + interest_amount + fine_amount - discount_amount - paid_amount)) stored,
  status text not null default 'open' check (status in ('open','overdue','partial','paid','renegotiated','cancelled')),
  notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz,
  unique (organization_id, branch_id, number)
);
create index receivables_due_idx on public.receivables (organization_id, branch_id, status, due_date) where deleted_at is null;

create table public.payables (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), branch_id uuid not null references public.branches(id),
  supplier_id uuid references public.suppliers(id), purchase_order_id uuid references public.purchase_orders(id), category_id uuid references public.financial_categories(id), cost_center_id uuid references public.cost_centers(id),
  number text not null default '', document text, description text not null, installment_number integer not null default 1, installment_count integer not null default 1,
  competence_date date not null default current_date, due_date date not null, original_amount numeric(14,2) not null check (original_amount >= 0),
  interest_amount numeric(14,2) not null default 0, fine_amount numeric(14,2) not null default 0, discount_amount numeric(14,2) not null default 0,
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  outstanding_amount numeric(14,2) generated always as (greatest(0, original_amount + interest_amount + fine_amount - discount_amount - paid_amount)) stored,
  status text not null default 'open' check (status in ('draft','pending_approval','approved','open','overdue','partial','paid','cancelled')),
  approved_by uuid references auth.users(id), approved_at timestamptz, recurrence_key text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz,
  unique (organization_id, branch_id, number)
);
create index payables_due_idx on public.payables (organization_id, branch_id, status, due_date) where deleted_at is null;

create table public.financial_transactions (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), branch_id uuid not null references public.branches(id),
  account_id uuid not null references public.financial_accounts(id), transaction_type text not null check (transaction_type in ('receivable_payment','payable_payment','cash_supply','cash_withdrawal','transfer_in','transfer_out','fee','interest','adjustment','reversal')),
  direction smallint not null check (direction in (-1,1)), amount numeric(14,2) not null check (amount > 0), occurred_at timestamptz not null default now(),
  receivable_id uuid references public.receivables(id), payable_id uuid references public.payables(id), payment_method_id uuid references public.payment_methods(id),
  category_id uuid references public.financial_categories(id), cost_center_id uuid references public.cost_centers(id), reference_type text, reference_id uuid,
  description text not null, reversed_transaction_id uuid references public.financial_transactions(id), idempotency_key text,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id)
);
create index financial_transactions_ledger_idx on public.financial_transactions (organization_id, branch_id, account_id, occurred_at desc);
create unique index financial_transactions_idempotency_uidx on public.financial_transactions (organization_id, idempotency_key) where idempotency_key is not null;

create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), branch_id uuid not null references public.branches(id),
  account_id uuid not null references public.financial_accounts(id), opened_by uuid not null references auth.users(id), opened_at timestamptz not null default now(),
  initial_amount numeric(14,2) not null default 0, status text not null default 'open' check (status in ('open','closed')),
  closed_by uuid references auth.users(id), closed_at timestamptz, expected_amount numeric(14,2), counted_amount numeric(14,2), difference_amount numeric(14,2), closing_notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz
);
create unique index cash_sessions_one_open_uidx on public.cash_sessions (branch_id, account_id) where status = 'open' and deleted_at is null;
create table public.cash_movements (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), branch_id uuid not null references public.branches(id),
  cash_session_id uuid not null references public.cash_sessions(id), financial_transaction_id uuid references public.financial_transactions(id),
  movement_type text not null check (movement_type in ('opening','receipt','payment','supply','withdrawal','closing','adjustment')),
  direction smallint not null check (direction in (-1,1)), amount numeric(14,2) not null check (amount >= 0), description text not null,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id)
);

create table public.commission_rules (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), branch_id uuid not null references public.branches(id),
  name text not null, basis text not null check (basis in ('service','product','revenue','gross_profit','target_range')),
  beneficiary_role text, rate_percent numeric(8,4) not null default 0, fixed_amount numeric(14,2) not null default 0,
  minimum_base numeric(14,2), maximum_base numeric(14,2), active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz
);
create table public.commissions (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), branch_id uuid not null references public.branches(id),
  rule_id uuid references public.commission_rules(id), work_order_id uuid references public.work_orders(id), beneficiary_user_id uuid references auth.users(id), beneficiary_name text not null,
  competence_date date not null default current_date, basis_amount numeric(14,2) not null default 0, rate_percent numeric(8,4) not null default 0,
  amount numeric(14,2) not null check (amount >= 0), status text not null default 'forecast' check (status in ('forecast','confirmed','paid','reversed')),
  confirmed_at timestamptz, paid_at timestamptz, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz
);
create index commissions_period_idx on public.commissions (organization_id, branch_id, competence_date, status) where deleted_at is null;

alter table public.work_order_items add column commission_rate numeric(8,4) not null default 0;
alter table public.work_order_items add column commission_amount numeric(14,2) generated always as (round(total * commission_rate / 100, 2)) stored;

create trigger financial_categories_set_updated_at before update on public.financial_categories for each row execute function public.set_updated_at();
create trigger cost_centers_set_updated_at before update on public.cost_centers for each row execute function public.set_updated_at();
create trigger financial_accounts_set_updated_at before update on public.financial_accounts for each row execute function public.set_updated_at();
create trigger payment_methods_set_updated_at before update on public.payment_methods for each row execute function public.set_updated_at();
create trigger receivables_set_updated_at before update on public.receivables for each row execute function public.set_updated_at();
create trigger payables_set_updated_at before update on public.payables for each row execute function public.set_updated_at();
create trigger cash_sessions_set_updated_at before update on public.cash_sessions for each row execute function public.set_updated_at();
create trigger commission_rules_set_updated_at before update on public.commission_rules for each row execute function public.set_updated_at();
create trigger commissions_set_updated_at before update on public.commissions for each row execute function public.set_updated_at();
create trigger receivables_assign_number before insert on public.receivables for each row execute function public.assign_document_number('receivable');
create trigger payables_assign_number before insert on public.payables for each row execute function public.assign_document_number('payable');

create or replace function public.guard_financial_settlement()
returns trigger language plpgsql as $$
begin
  if new.paid_amount is distinct from old.paid_amount and current_setting('app.finance_settlement', true) <> 'on' then raise exception 'settlement_function_required'; end if;
  if new.status is distinct from old.status and new.status in ('paid','partial') and current_setting('app.finance_settlement', true) <> 'on' then raise exception 'settlement_function_required'; end if;
  return new;
end;
$$;
create trigger receivables_guard_settlement before update on public.receivables for each row execute function public.guard_financial_settlement();
create trigger payables_guard_settlement before update on public.payables for each row execute function public.guard_financial_settlement();

create or replace function public.settle_receivable(p_receivable_id uuid, p_amount numeric, p_account_id uuid, p_payment_method_id uuid, p_paid_at timestamptz default now(), p_notes text default null)
returns uuid security definer set search_path = public set row_security = off language plpgsql as $$
declare v_title public.receivables%rowtype; v_account public.financial_accounts%rowtype; v_id uuid; v_new_paid numeric; v_total numeric;
begin
  select * into v_title from public.receivables where id=p_receivable_id and deleted_at is null for update;
  select * into v_account from public.financial_accounts where id=p_account_id and deleted_at is null;
  if v_title.id is null or v_account.id is null or v_title.organization_id<>v_account.organization_id then raise exception 'invalid_title_or_account'; end if;
  if not public.has_permission(v_title.organization_id,v_title.branch_id,'financial.pay') then raise exception 'permission_denied'; end if;
  if p_amount<=0 or p_amount>v_title.outstanding_amount then raise exception 'invalid_payment_amount'; end if;
  v_total:=v_title.original_amount+v_title.interest_amount+v_title.fine_amount-v_title.discount_amount; v_new_paid:=v_title.paid_amount+p_amount;
  perform set_config('app.finance_settlement','on',true);
  update public.receivables set paid_amount=v_new_paid,status=case when v_new_paid>=v_total then 'paid' else 'partial' end,updated_by=auth.uid() where id=v_title.id;
  insert into public.financial_transactions (organization_id,branch_id,account_id,transaction_type,direction,amount,occurred_at,receivable_id,payment_method_id,category_id,cost_center_id,description,idempotency_key,created_by)
  values(v_title.organization_id,v_title.branch_id,p_account_id,'receivable_payment',1,p_amount,p_paid_at,v_title.id,p_payment_method_id,v_title.category_id,v_title.cost_center_id,coalesce(p_notes,'Recebimento '||v_title.number),'receivable:'||v_title.id||':'||(v_title.paid_amount+p_amount),auth.uid()) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.settle_payable(p_payable_id uuid, p_amount numeric, p_account_id uuid, p_payment_method_id uuid, p_paid_at timestamptz default now(), p_notes text default null)
returns uuid security definer set search_path = public set row_security = off language plpgsql as $$
declare v_title public.payables%rowtype; v_account public.financial_accounts%rowtype; v_id uuid; v_new_paid numeric; v_total numeric;
begin
  select * into v_title from public.payables where id=p_payable_id and deleted_at is null for update;
  select * into v_account from public.financial_accounts where id=p_account_id and deleted_at is null;
  if v_title.id is null or v_account.id is null or v_title.organization_id<>v_account.organization_id then raise exception 'invalid_title_or_account'; end if;
  if not public.has_permission(v_title.organization_id,v_title.branch_id,'financial.pay') then raise exception 'permission_denied'; end if;
  if v_title.status='pending_approval' then raise exception 'payable_requires_approval'; end if;
  if p_amount<=0 or p_amount>v_title.outstanding_amount then raise exception 'invalid_payment_amount'; end if;
  v_total:=v_title.original_amount+v_title.interest_amount+v_title.fine_amount-v_title.discount_amount; v_new_paid:=v_title.paid_amount+p_amount;
  perform set_config('app.finance_settlement','on',true);
  update public.payables set paid_amount=v_new_paid,status=case when v_new_paid>=v_total then 'paid' else 'partial' end,updated_by=auth.uid() where id=v_title.id;
  insert into public.financial_transactions (organization_id,branch_id,account_id,transaction_type,direction,amount,occurred_at,payable_id,payment_method_id,category_id,cost_center_id,description,idempotency_key,created_by)
  values(v_title.organization_id,v_title.branch_id,p_account_id,'payable_payment',-1,p_amount,p_paid_at,v_title.id,p_payment_method_id,v_title.category_id,v_title.cost_center_id,coalesce(p_notes,'Pagamento '||v_title.number),'payable:'||v_title.id||':'||(v_title.paid_amount+p_amount),auth.uid()) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.open_cash_session(p_account_id uuid,p_initial_amount numeric default 0)
returns uuid security definer set search_path=public set row_security=off language plpgsql as $$
declare v_account public.financial_accounts%rowtype; v_id uuid;
begin
 select * into v_account from public.financial_accounts where id=p_account_id and account_type='cash' and deleted_at is null;
 if v_account.id is null or not public.has_permission(v_account.organization_id,v_account.branch_id,'cash.manage') then raise exception 'permission_denied'; end if;
 insert into public.cash_sessions(organization_id,branch_id,account_id,opened_by,initial_amount,created_by,updated_by) values(v_account.organization_id,v_account.branch_id,v_account.id,auth.uid(),coalesce(p_initial_amount,0),auth.uid(),auth.uid()) returning id into v_id;
 insert into public.cash_movements(organization_id,branch_id,cash_session_id,movement_type,direction,amount,description,created_by) values(v_account.organization_id,v_account.branch_id,v_id,'opening',1,coalesce(p_initial_amount,0),'Abertura de caixa',auth.uid());
 return v_id;
end; $$;

create or replace function public.post_cash_movement(p_cash_session_id uuid,p_movement_type text,p_amount numeric,p_description text)
returns uuid security definer set search_path=public set row_security=off language plpgsql as $$
declare v_session public.cash_sessions%rowtype; v_direction smallint; v_transaction uuid; v_movement uuid;
begin
 select * into v_session from public.cash_sessions where id=p_cash_session_id and status='open' and deleted_at is null for update;
 if v_session.id is null or not public.has_permission(v_session.organization_id,v_session.branch_id,'cash.manage') then raise exception 'permission_denied'; end if;
 if p_amount<=0 then raise exception 'invalid_amount'; end if;
 v_direction:=case when p_movement_type='supply' then 1 when p_movement_type='withdrawal' then -1 else 0 end;
 if v_direction=0 then raise exception 'invalid_cash_movement'; end if;
 insert into public.financial_transactions(organization_id,branch_id,account_id,transaction_type,direction,amount,description,created_by)
 values(v_session.organization_id,v_session.branch_id,v_session.account_id,case when v_direction=1 then 'cash_supply' else 'cash_withdrawal' end,v_direction,p_amount,p_description,auth.uid()) returning id into v_transaction;
 insert into public.cash_movements(organization_id,branch_id,cash_session_id,financial_transaction_id,movement_type,direction,amount,description,created_by)
 values(v_session.organization_id,v_session.branch_id,v_session.id,v_transaction,p_movement_type,v_direction,p_amount,p_description,auth.uid()) returning id into v_movement;
 return v_movement;
end; $$;

create or replace function public.close_cash_session(p_cash_session_id uuid,p_counted_amount numeric,p_notes text default null)
returns void security definer set search_path=public set row_security=off language plpgsql as $$
declare v_session public.cash_sessions%rowtype; v_expected numeric;
begin
 select * into v_session from public.cash_sessions where id=p_cash_session_id and status='open' and deleted_at is null for update;
 if v_session.id is null or not public.has_permission(v_session.organization_id,v_session.branch_id,'cash.manage') then raise exception 'permission_denied'; end if;
 select v_session.initial_amount+coalesce(sum(direction*amount),0) into v_expected from public.cash_movements where cash_session_id=v_session.id and movement_type<>'opening';
 update public.cash_sessions set status='closed',closed_by=auth.uid(),closed_at=now(),expected_amount=v_expected,counted_amount=p_counted_amount,difference_amount=p_counted_amount-v_expected,closing_notes=p_notes,updated_by=auth.uid() where id=v_session.id;
 insert into public.cash_movements(organization_id,branch_id,cash_session_id,movement_type,direction,amount,description,created_by) values(v_session.organization_id,v_session.branch_id,v_session.id,'closing',1,p_counted_amount,'Fechamento de caixa',auth.uid());
end; $$;

create or replace function public.generate_financial_title_from_source()
returns trigger security definer set search_path=public set row_security=off language plpgsql as $$
begin
 if tg_table_name='work_orders' and new.status='delivered' and old.status is distinct from new.status and new.total>0 then
   insert into public.receivables(organization_id,branch_id,customer_id,work_order_id,number,document,description,due_date,original_amount,status,created_by,updated_by)
   select new.organization_id,new.branch_id,new.customer_id,new.id,'','OS '||new.number,'Ordem de serviço '||new.number,current_date,new.total,'open',auth.uid(),auth.uid()
   where not exists(select 1 from public.receivables where work_order_id=new.id and deleted_at is null);
 elsif tg_table_name='purchase_orders' and new.status='received' and old.status is distinct from new.status and new.total>0 then
   insert into public.payables(organization_id,branch_id,supplier_id,purchase_order_id,number,document,description,due_date,original_amount,status,created_by,updated_by)
   select new.organization_id,new.branch_id,new.supplier_id,new.id,'','PC '||new.number,'Pedido de compra '||new.number,coalesce(new.expected_at,current_date),new.total,'open',auth.uid(),auth.uid()
   where not exists(select 1 from public.payables where purchase_order_id=new.id and deleted_at is null);
 end if;
 return new;
end; $$;
create trigger work_orders_generate_receivable after update on public.work_orders for each row execute function public.generate_financial_title_from_source();
create trigger purchase_orders_generate_payable after update on public.purchase_orders for each row execute function public.generate_financial_title_from_source();

create or replace function public.create_default_financial_setup()
returns trigger security definer set search_path=public set row_security=off language plpgsql as $$
begin
 insert into public.financial_accounts(organization_id,branch_id,code,name,account_type,created_by,updated_by) values(new.organization_id,new.id,'CAIXA','Caixa principal','cash',new.created_by,new.created_by) on conflict(branch_id,code) do nothing;
 insert into public.cost_centers(organization_id,branch_id,code,name,created_by,updated_by) values(new.organization_id,new.id,'GERAL','Geral',new.created_by,new.created_by) on conflict(branch_id,code) do nothing;
 insert into public.payment_methods(organization_id,branch_id,code,name,method_type,settlement_days,created_by,updated_by) values
  (new.organization_id,new.id,'DINHEIRO','Dinheiro','cash',0,new.created_by,new.created_by),(new.organization_id,new.id,'PIX','PIX','pix',0,new.created_by,new.created_by),
  (new.organization_id,new.id,'DEBITO','Cartão de débito','debit_card',1,new.created_by,new.created_by),(new.organization_id,new.id,'CREDITO','Cartão de crédito','credit_card',30,new.created_by,new.created_by),
  (new.organization_id,new.id,'TRANSFERENCIA','Transferência bancária','bank_transfer',0,new.created_by,new.created_by),(new.organization_id,new.id,'BOLETO','Boleto','boleto',2,new.created_by,new.created_by)
 on conflict(branch_id,code) do nothing;
 return new;
end; $$;
create trigger branches_create_default_financial_setup after insert on public.branches for each row execute function public.create_default_financial_setup();
insert into public.financial_accounts(organization_id,branch_id,code,name,account_type,created_by,updated_by) select organization_id,id,'CAIXA','Caixa principal','cash',created_by,created_by from public.branches where deleted_at is null on conflict(branch_id,code) do nothing;
insert into public.cost_centers(organization_id,branch_id,code,name,created_by,updated_by) select organization_id,id,'GERAL','Geral',created_by,created_by from public.branches where deleted_at is null on conflict(branch_id,code) do nothing;
insert into public.payment_methods(organization_id,branch_id,code,name,method_type,settlement_days,created_by,updated_by)
select b.organization_id,b.id,v.code,v.name,v.method_type,v.days,b.created_by,b.created_by from public.branches b cross join (values('DINHEIRO','Dinheiro','cash',0),('PIX','PIX','pix',0),('DEBITO','Cartão de débito','debit_card',1),('CREDITO','Cartão de crédito','credit_card',30),('TRANSFERENCIA','Transferência bancária','bank_transfer',0),('BOLETO','Boleto','boleto',2)) v(code,name,method_type,days) where b.deleted_at is null on conflict(branch_id,code) do nothing;

create view public.cash_flow_daily with(security_invoker=true) as
select organization_id,branch_id,occurred_at::date as movement_date,
 sum(case when direction=1 then amount else 0 end) as inflow,sum(case when direction=-1 then amount else 0 end) as outflow,sum(direction*amount) as net
from public.financial_transactions group by organization_id,branch_id,occurred_at::date;
create view public.financial_overview with(security_invoker=true) as
select b.organization_id,b.id as branch_id,
 coalesce((select sum(outstanding_amount) from public.receivables r where r.branch_id=b.id and r.status in('open','overdue','partial') and r.deleted_at is null),0) as receivable_open,
 coalesce((select sum(outstanding_amount) from public.receivables r where r.branch_id=b.id and r.status in('open','overdue','partial') and r.due_date<current_date and r.deleted_at is null),0) as receivable_overdue,
 coalesce((select sum(outstanding_amount) from public.payables p where p.branch_id=b.id and p.status in('open','overdue','partial','approved') and p.deleted_at is null),0) as payable_open,
 coalesce((select sum(a.opening_balance) from public.financial_accounts a where a.branch_id=b.id and a.deleted_at is null),0)+coalesce((select sum(t.direction*t.amount) from public.financial_transactions t where t.branch_id=b.id),0) as account_balance
from public.branches b where b.deleted_at is null;
create view public.work_order_profitability with(security_invoker=true) as
select w.organization_id,w.branch_id,w.id as work_order_id,w.number,w.customer_id,w.vehicle_id,w.total as revenue,
 coalesce(sum(i.quantity*i.unit_cost),0) as cost,greatest(0,w.total-coalesce(sum(i.quantity*i.unit_cost),0)) as gross_profit
from public.work_orders w left join public.work_order_items i on i.work_order_id=w.id where w.deleted_at is null group by w.id;

alter table public.financial_categories enable row level security; alter table public.cost_centers enable row level security;
alter table public.financial_accounts enable row level security; alter table public.payment_methods enable row level security;
alter table public.receivables enable row level security; alter table public.payables enable row level security;
alter table public.financial_transactions enable row level security; alter table public.cash_sessions enable row level security;
alter table public.cash_movements enable row level security; alter table public.commission_rules enable row level security; alter table public.commissions enable row level security;

create policy financial_categories_select on public.financial_categories for select using(deleted_at is null and public.has_permission(organization_id,null,'financial.view'));
create policy financial_categories_manage on public.financial_categories for all using(public.has_permission(organization_id,null,'financial.manage')) with check(public.has_permission(organization_id,null,'financial.manage'));
create policy cost_centers_select on public.cost_centers for select using(deleted_at is null and public.has_permission(organization_id,branch_id,'financial.view'));
create policy cost_centers_manage on public.cost_centers for all using(public.has_permission(organization_id,branch_id,'financial.manage')) with check(public.has_permission(organization_id,branch_id,'financial.manage'));
create policy financial_accounts_select on public.financial_accounts for select using(deleted_at is null and public.has_permission(organization_id,branch_id,'financial.view'));
create policy financial_accounts_manage on public.financial_accounts for all using(public.has_permission(organization_id,branch_id,'financial.manage')) with check(public.has_permission(organization_id,branch_id,'financial.manage'));
create policy payment_methods_select on public.payment_methods for select using(deleted_at is null and public.is_branch_member(branch_id));
create policy payment_methods_manage on public.payment_methods for all using(public.has_permission(organization_id,branch_id,'financial.manage')) with check(public.has_permission(organization_id,branch_id,'financial.manage'));
create policy receivables_select on public.receivables for select using(deleted_at is null and public.has_permission(organization_id,branch_id,'financial.view'));
create policy receivables_manage on public.receivables for all using(public.has_permission(organization_id,branch_id,'financial.manage')) with check(public.has_permission(organization_id,branch_id,'financial.manage'));
create policy payables_select on public.payables for select using(deleted_at is null and public.has_permission(organization_id,branch_id,'financial.view'));
create policy payables_manage on public.payables for all using(public.has_permission(organization_id,branch_id,'financial.manage')) with check(public.has_permission(organization_id,branch_id,'financial.manage'));
create policy financial_transactions_select on public.financial_transactions for select using(public.has_permission(organization_id,branch_id,'financial.view'));
create policy cash_sessions_select on public.cash_sessions for select using(deleted_at is null and public.has_permission(organization_id,branch_id,'cash.view'));
create policy cash_movements_select on public.cash_movements for select using(public.has_permission(organization_id,branch_id,'cash.view'));
create policy commission_rules_select on public.commission_rules for select using(deleted_at is null and public.has_permission(organization_id,branch_id,'commissions.view'));
create policy commission_rules_manage on public.commission_rules for all using(public.has_permission(organization_id,branch_id,'commissions.manage')) with check(public.has_permission(organization_id,branch_id,'commissions.manage'));
create policy commissions_select on public.commissions for select using(deleted_at is null and (public.has_permission(organization_id,branch_id,'commissions.view') or beneficiary_user_id=auth.uid()));
create policy commissions_manage on public.commissions for all using(public.has_permission(organization_id,branch_id,'commissions.manage')) with check(public.has_permission(organization_id,branch_id,'commissions.manage'));

grant select,insert,update,delete on public.financial_categories,public.cost_centers,public.financial_accounts,public.payment_methods,public.receivables,public.payables,public.commission_rules,public.commissions to authenticated;
grant select on public.financial_transactions,public.cash_sessions,public.cash_movements,public.cash_flow_daily,public.financial_overview,public.work_order_profitability to authenticated;
revoke all on public.financial_categories,public.cost_centers,public.financial_accounts,public.payment_methods,public.receivables,public.payables,public.financial_transactions,public.cash_sessions,public.cash_movements,public.commission_rules,public.commissions,public.cash_flow_daily,public.financial_overview,public.work_order_profitability from anon;
revoke insert,update,delete on public.financial_transactions,public.cash_sessions,public.cash_movements from authenticated;

revoke all on function public.settle_receivable(uuid,numeric,uuid,uuid,timestamptz,text) from public,anon;
revoke all on function public.settle_payable(uuid,numeric,uuid,uuid,timestamptz,text) from public,anon;
revoke all on function public.open_cash_session(uuid,numeric) from public,anon;
revoke all on function public.post_cash_movement(uuid,text,numeric,text) from public,anon;
revoke all on function public.close_cash_session(uuid,numeric,text) from public,anon;
grant execute on function public.settle_receivable(uuid,numeric,uuid,uuid,timestamptz,text) to authenticated;
grant execute on function public.settle_payable(uuid,numeric,uuid,uuid,timestamptz,text) to authenticated;
grant execute on function public.open_cash_session(uuid,numeric) to authenticated;
grant execute on function public.post_cash_movement(uuid,text,numeric,text) to authenticated;
grant execute on function public.close_cash_session(uuid,numeric,text) to authenticated;

create trigger audit_receivables after insert or update or delete on public.receivables for each row execute function public.write_audit_log();
create trigger audit_payables after insert or update or delete on public.payables for each row execute function public.write_audit_log();
create trigger audit_financial_accounts after insert or update or delete on public.financial_accounts for each row execute function public.write_audit_log();
create trigger audit_cash_sessions after insert or update or delete on public.cash_sessions for each row execute function public.write_audit_log();
create trigger audit_commissions after insert or update or delete on public.commissions for each row execute function public.write_audit_log();

commit;
