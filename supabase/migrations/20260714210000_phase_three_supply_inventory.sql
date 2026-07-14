begin;

insert into public.permissions (code, module, action, description) values
  ('products.view', 'products', 'view', 'Visualizar produtos e aplicações'),
  ('products.create', 'products', 'create', 'Cadastrar produtos'),
  ('products.update', 'products', 'update', 'Editar produtos'),
  ('suppliers.view', 'suppliers', 'view', 'Visualizar fornecedores'),
  ('suppliers.create', 'suppliers', 'create', 'Cadastrar fornecedores'),
  ('suppliers.update', 'suppliers', 'update', 'Editar fornecedores'),
  ('purchases.view', 'purchases', 'view', 'Visualizar compras e cotações'),
  ('purchases.create', 'purchases', 'create', 'Criar solicitações e pedidos de compra'),
  ('purchases.approve', 'purchases', 'approve', 'Aprovar pedidos de compra'),
  ('purchases.receive', 'purchases', 'receive', 'Receber mercadorias'),
  ('inventory.count', 'inventory', 'count', 'Executar inventários'),
  ('inventory.transfer', 'inventory', 'transfer', 'Transferir estoque entre depósitos'),
  ('inventory.reserve', 'inventory', 'reserve', 'Reservar estoque para ordens de serviço'),
  ('inventory.allow_negative', 'inventory', 'allow_negative', 'Autorizar saldo negativo quando configurado')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id, created_by)
select r.id, p.id, r.created_by from public.roles r cross join public.permissions p
where r.code = 'owner' and p.module in ('products', 'suppliers', 'purchases', 'inventory')
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id, created_by)
select r.id, p.id, r.created_by from public.roles r cross join public.permissions p
where r.code = 'administrator' and p.module in ('products', 'suppliers', 'purchases', 'inventory')
  and p.code <> 'inventory.allow_negative'
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id, created_by)
select r.id, p.id, r.created_by from public.roles r cross join public.permissions p
where r.code = 'read_only' and p.action = 'view' and p.module in ('products', 'suppliers', 'purchases', 'inventory')
on conflict do nothing;

create table public.product_categories (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  parent_id uuid references public.product_categories(id), name text not null, description text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz
);
create unique index product_categories_name_uidx on public.product_categories (organization_id, lower(name)) where deleted_at is null;

create table public.products (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  branch_id uuid not null references public.branches(id), category_id uuid references public.product_categories(id),
  sku text not null, barcode text, name text not null, description text, brand text, manufacturer_code text,
  unit text not null default 'UN', product_type text not null default 'part' check (product_type in ('part','supply','fluid','tire','accessory','other')),
  cost_price numeric(14,4) not null default 0 check (cost_price >= 0), sale_price numeric(14,2) not null default 0 check (sale_price >= 0),
  minimum_stock numeric(14,3) not null default 0, maximum_stock numeric(14,3), reorder_point numeric(14,3) not null default 0,
  lead_time_days integer not null default 0 check (lead_time_days >= 0), track_stock boolean not null default true,
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz
);
create unique index products_sku_uidx on public.products (organization_id, upper(sku)) where deleted_at is null;
create unique index products_barcode_uidx on public.products (organization_id, barcode) where barcode is not null and deleted_at is null;
create index products_search_idx on public.products (organization_id, name) where deleted_at is null;

create table public.product_equivalents (
  product_id uuid not null references public.products(id) on delete cascade,
  equivalent_product_id uuid not null references public.products(id) on delete cascade,
  notes text, created_at timestamptz not null default now(), created_by uuid references auth.users(id),
  primary key (product_id, equivalent_product_id), check (product_id <> equivalent_product_id)
);
create table public.product_vehicle_applications (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  product_id uuid not null references public.products(id) on delete cascade, brand text not null, model text not null,
  version text, year_from integer, year_to integer, engine text, notes text, created_at timestamptz not null default now(),
  created_by uuid references auth.users(id), check (year_to is null or year_from is null or year_to >= year_from)
);

create table public.warehouses (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  branch_id uuid not null references public.branches(id), code text not null, name text not null, address text,
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz,
  unique (branch_id, code)
);

create table public.stock_balances (
  organization_id uuid not null references public.organizations(id), branch_id uuid not null references public.branches(id),
  warehouse_id uuid not null references public.warehouses(id), product_id uuid not null references public.products(id),
  on_hand numeric(14,3) not null default 0, reserved numeric(14,3) not null default 0 check (reserved >= 0),
  average_cost numeric(14,4) not null default 0 check (average_cost >= 0), updated_at timestamptz not null default now(),
  primary key (warehouse_id, product_id)
);
create index stock_balances_product_idx on public.stock_balances (organization_id, product_id);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  branch_id uuid not null references public.branches(id), warehouse_id uuid not null references public.warehouses(id),
  product_id uuid not null references public.products(id), movement_type text not null check (movement_type in
    ('purchase_receipt','work_order_consumption','customer_return','supplier_return','adjustment_in','adjustment_out','loss','damage','transfer_in','transfer_out','inventory_in','inventory_out')),
  direction smallint not null check (direction in (-1, 1)), quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,4), balance_before numeric(14,3) not null, balance_after numeric(14,3) not null,
  reference_type text, reference_id uuid, notes text, idempotency_key text,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id)
);
create index stock_movements_ledger_idx on public.stock_movements (organization_id, warehouse_id, product_id, created_at desc);
create unique index stock_movements_idempotency_uidx on public.stock_movements (organization_id, idempotency_key) where idempotency_key is not null;

create table public.stock_reservations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  branch_id uuid not null references public.branches(id), warehouse_id uuid not null references public.warehouses(id),
  product_id uuid not null references public.products(id), work_order_id uuid references public.work_orders(id),
  quantity numeric(14,3) not null check (quantity > 0), status text not null default 'active' check (status in ('active','consumed','released','cancelled')),
  reserved_at timestamptz not null default now(), released_at timestamptz, created_by uuid references auth.users(id), updated_by uuid references auth.users(id)
);
create index stock_reservations_work_order_idx on public.stock_reservations (work_order_id, status);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  branch_id uuid not null references public.branches(id), supplier_type text not null default 'company' check (supplier_type in ('individual','company')),
  legal_name text not null, trade_name text, tax_id text, state_registration text, contact_name text,
  phone text, whatsapp text, email text, address text, payment_terms text, delivery_days integer not null default 0,
  rating numeric(3,2) check (rating between 0 and 5), notes text, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz
);
create unique index suppliers_tax_id_uidx on public.suppliers (organization_id, tax_id) where tax_id is not null and deleted_at is null;

create table public.supplier_products (
  supplier_id uuid not null references public.suppliers(id) on delete cascade, product_id uuid not null references public.products(id) on delete cascade,
  supplier_code text, last_cost numeric(14,4), minimum_quantity numeric(14,3) not null default 1,
  lead_time_days integer not null default 0, preferred boolean not null default false, updated_at timestamptz not null default now(),
  primary key (supplier_id, product_id)
);

create table public.purchase_requests (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  branch_id uuid not null references public.branches(id), number text not null default '', status text not null default 'draft' check (status in ('draft','submitted','approved','quoted','ordered','cancelled')),
  needed_by date, reason text, requested_by uuid references auth.users(id), approved_by uuid references auth.users(id), approved_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz,
  unique (organization_id, branch_id, number)
);
create table public.purchase_request_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  request_id uuid not null references public.purchase_requests(id) on delete cascade, product_id uuid not null references public.products(id),
  quantity numeric(14,3) not null check (quantity > 0), notes text, created_at timestamptz not null default now(), created_by uuid references auth.users(id)
);

create table public.purchase_quotes (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  branch_id uuid not null references public.branches(id), request_id uuid references public.purchase_requests(id), supplier_id uuid not null references public.suppliers(id),
  status text not null default 'requested' check (status in ('requested','received','selected','rejected','expired')),
  quoted_at timestamptz, valid_until date, freight numeric(14,2) not null default 0, discount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz
);
create table public.purchase_quote_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), quote_id uuid not null references public.purchase_quotes(id) on delete cascade,
  product_id uuid not null references public.products(id), quantity numeric(14,3) not null check (quantity > 0), unit_cost numeric(14,4) not null check (unit_cost >= 0),
  total numeric(14,2) not null default 0, availability_days integer, created_at timestamptz not null default now()
);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  branch_id uuid not null references public.branches(id), warehouse_id uuid not null references public.warehouses(id),
  supplier_id uuid not null references public.suppliers(id), request_id uuid references public.purchase_requests(id), quote_id uuid references public.purchase_quotes(id),
  number text not null default '', status text not null default 'draft' check (status in ('draft','pending_approval','approved','sent','partial','received','cancelled')),
  expected_at date, payment_terms text, freight numeric(14,2) not null default 0, discount numeric(14,2) not null default 0,
  items_total numeric(14,2) not null default 0, total numeric(14,2) not null default 0, notes text,
  approved_by uuid references auth.users(id), approved_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz,
  unique (organization_id, branch_id, number)
);
create index purchase_orders_status_idx on public.purchase_orders (organization_id, branch_id, status) where deleted_at is null;
create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade, product_id uuid not null references public.products(id),
  quantity numeric(14,3) not null check (quantity > 0), received_quantity numeric(14,3) not null default 0 check (received_quantity >= 0),
  unit_cost numeric(14,4) not null check (unit_cost >= 0), discount numeric(14,2) not null default 0, tax numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.purchase_receipts (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  branch_id uuid not null references public.branches(id), purchase_order_id uuid not null references public.purchase_orders(id), warehouse_id uuid not null references public.warehouses(id),
  supplier_invoice text, received_at timestamptz not null default now(), notes text, created_at timestamptz not null default now(), created_by uuid references auth.users(id)
);
create table public.purchase_receipt_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  receipt_id uuid not null references public.purchase_receipts(id) on delete cascade, purchase_order_item_id uuid not null references public.purchase_order_items(id),
  product_id uuid not null references public.products(id), quantity numeric(14,3) not null check (quantity > 0), unit_cost numeric(14,4) not null,
  created_at timestamptz not null default now()
);

create table public.stock_transfers (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  branch_id uuid not null references public.branches(id), source_warehouse_id uuid not null references public.warehouses(id), destination_warehouse_id uuid not null references public.warehouses(id),
  number text not null default '', status text not null default 'draft' check (status in ('draft','in_transit','completed','cancelled')),
  requested_at timestamptz not null default now(), completed_at timestamptz, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz,
  unique (organization_id, branch_id, number), check (source_warehouse_id <> destination_warehouse_id)
);
create table public.stock_transfer_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), transfer_id uuid not null references public.stock_transfers(id) on delete cascade,
  product_id uuid not null references public.products(id), quantity numeric(14,3) not null check (quantity > 0), created_at timestamptz not null default now()
);

create table public.stock_counts (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  branch_id uuid not null references public.branches(id), warehouse_id uuid not null references public.warehouses(id), number text not null default '',
  status text not null default 'draft' check (status in ('draft','counting','review','completed','cancelled')),
  started_at timestamptz, completed_at timestamptz, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz,
  unique (organization_id, branch_id, number)
);
create table public.stock_count_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), count_id uuid not null references public.stock_counts(id) on delete cascade,
  product_id uuid not null references public.products(id), expected_quantity numeric(14,3) not null default 0, counted_quantity numeric(14,3),
  difference numeric(14,3) generated always as (coalesce(counted_quantity, expected_quantity) - expected_quantity) stored,
  notes text, counted_at timestamptz, counted_by uuid references auth.users(id), unique (count_id, product_id)
);

alter table public.work_order_items add column product_id uuid references public.products(id);
alter table public.work_order_items add column warehouse_id uuid references public.warehouses(id);
alter table public.work_order_items add column reserved_quantity numeric(14,3) not null default 0;
alter table public.work_order_items add column consumed_quantity numeric(14,3) not null default 0;

create trigger products_set_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger categories_set_updated_at before update on public.product_categories for each row execute function public.set_updated_at();
create trigger warehouses_set_updated_at before update on public.warehouses for each row execute function public.set_updated_at();
create trigger suppliers_set_updated_at before update on public.suppliers for each row execute function public.set_updated_at();
create trigger purchase_requests_set_updated_at before update on public.purchase_requests for each row execute function public.set_updated_at();
create trigger purchase_quotes_set_updated_at before update on public.purchase_quotes for each row execute function public.set_updated_at();
create trigger purchase_orders_set_updated_at before update on public.purchase_orders for each row execute function public.set_updated_at();
create trigger purchase_order_items_set_updated_at before update on public.purchase_order_items for each row execute function public.set_updated_at();
create trigger transfers_set_updated_at before update on public.stock_transfers for each row execute function public.set_updated_at();
create trigger counts_set_updated_at before update on public.stock_counts for each row execute function public.set_updated_at();

create trigger purchase_requests_assign_number before insert on public.purchase_requests for each row execute function public.assign_document_number('purchase_request');
create trigger purchase_orders_assign_number before insert on public.purchase_orders for each row execute function public.assign_document_number('purchase_order');
create trigger stock_transfers_assign_number before insert on public.stock_transfers for each row execute function public.assign_document_number('stock_transfer');
create trigger stock_counts_assign_number before insert on public.stock_counts for each row execute function public.assign_document_number('stock_count');

create or replace function public.calculate_purchase_line_total()
returns trigger language plpgsql as $$
begin
  new.total := round((new.quantity * new.unit_cost) - new.discount + new.tax, 2);
  if new.total < 0 then raise exception 'negative_line_total'; end if;
  return new;
end;
$$;
create trigger purchase_order_items_calculate before insert or update on public.purchase_order_items for each row execute function public.calculate_purchase_line_total();

create or replace function public.recalculate_purchase_order_totals()
returns trigger security definer set search_path = public set row_security = off language plpgsql as $$
declare v_id uuid := coalesce(new.purchase_order_id, old.purchase_order_id);
begin
  update public.purchase_orders set
    items_total = coalesce((select sum(total) from public.purchase_order_items where purchase_order_id = v_id), 0),
    total = coalesce((select sum(total) from public.purchase_order_items where purchase_order_id = v_id), 0) + freight - discount,
    updated_at = now() where id = v_id;
  return coalesce(new, old);
end;
$$;
create trigger purchase_order_items_recalculate after insert or update or delete on public.purchase_order_items for each row execute function public.recalculate_purchase_order_totals();

create or replace function public.create_default_warehouse()
returns trigger security definer set search_path = public set row_security = off language plpgsql as $$
begin
  insert into public.warehouses (organization_id, branch_id, code, name, created_by, updated_by)
  values (new.organization_id, new.id, 'PRINCIPAL', 'Estoque principal', new.created_by, new.created_by)
  on conflict (branch_id, code) do nothing;
  return new;
end;
$$;
create trigger branches_create_default_warehouse after insert on public.branches for each row execute function public.create_default_warehouse();
insert into public.warehouses (organization_id, branch_id, code, name, created_by, updated_by)
select organization_id, id, 'PRINCIPAL', 'Estoque principal', created_by, created_by from public.branches where deleted_at is null
on conflict (branch_id, code) do nothing;

create or replace function public.post_stock_movement(
  p_product_id uuid, p_warehouse_id uuid, p_movement_type text, p_quantity numeric,
  p_unit_cost numeric default null, p_reference_type text default null, p_reference_id uuid default null,
  p_notes text default null, p_idempotency_key text default null
)
returns uuid security definer set search_path = public set row_security = off language plpgsql as $$
declare
  v_product public.products%rowtype; v_warehouse public.warehouses%rowtype; v_balance public.stock_balances%rowtype;
  v_direction smallint; v_after numeric(14,3); v_average numeric(14,4); v_allow_negative boolean := false; v_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'quantity_must_be_positive'; end if;
  select * into v_product from public.products where id = p_product_id and deleted_at is null;
  select * into v_warehouse from public.warehouses where id = p_warehouse_id and deleted_at is null;
  if v_product.id is null or v_warehouse.id is null or v_product.organization_id <> v_warehouse.organization_id then raise exception 'invalid_product_or_warehouse'; end if;
  if not public.has_permission(v_product.organization_id, v_warehouse.branch_id, 'inventory.move') then raise exception 'permission_denied'; end if;
  v_direction := case when p_movement_type in ('purchase_receipt','customer_return','adjustment_in','transfer_in','inventory_in') then 1
    when p_movement_type in ('work_order_consumption','supplier_return','adjustment_out','loss','damage','transfer_out','inventory_out') then -1 else 0 end;
  if v_direction = 0 then raise exception 'invalid_movement_type'; end if;

  if p_idempotency_key is not null then
    select id into v_id from public.stock_movements where organization_id = v_product.organization_id and idempotency_key = p_idempotency_key;
    if v_id is not null then return v_id; end if;
  end if;
  insert into public.stock_balances (organization_id, branch_id, warehouse_id, product_id)
  values (v_product.organization_id, v_warehouse.branch_id, p_warehouse_id, p_product_id) on conflict do nothing;
  select * into v_balance from public.stock_balances where warehouse_id = p_warehouse_id and product_id = p_product_id for update;
  v_after := v_balance.on_hand + (p_quantity * v_direction);
  select coalesce((value ->> 'enabled')::boolean, false) into v_allow_negative
    from public.application_settings where organization_id = v_product.organization_id and key = 'allow_negative_stock'
      and (branch_id = v_warehouse.branch_id or branch_id is null) order by branch_id nulls last limit 1;
  if v_after < 0 and not (coalesce(v_allow_negative, false) and public.has_permission(v_product.organization_id, v_warehouse.branch_id, 'inventory.allow_negative')) then
    raise exception 'insufficient_stock';
  end if;
  v_average := v_balance.average_cost;
  if v_direction = 1 and p_unit_cost is not null and v_after > 0 then
    v_average := round(greatest(0, ((greatest(v_balance.on_hand, 0) * v_balance.average_cost) + (p_quantity * p_unit_cost)) / v_after), 4);
  end if;
  update public.stock_balances set on_hand = v_after, average_cost = v_average, updated_at = now()
    where warehouse_id = p_warehouse_id and product_id = p_product_id;
  insert into public.stock_movements (organization_id, branch_id, warehouse_id, product_id, movement_type, direction, quantity,
    unit_cost, balance_before, balance_after, reference_type, reference_id, notes, idempotency_key, created_by)
  values (v_product.organization_id, v_warehouse.branch_id, p_warehouse_id, p_product_id, p_movement_type, v_direction, p_quantity,
    p_unit_cost, v_balance.on_hand, v_after, p_reference_type, p_reference_id, p_notes, p_idempotency_key, auth.uid()) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.post_stock_movement(uuid, uuid, text, numeric, numeric, text, uuid, text, text) from public;
grant execute on function public.post_stock_movement(uuid, uuid, text, numeric, numeric, text, uuid, text, text) to authenticated;

create or replace function public.reserve_stock(p_work_order_id uuid, p_product_id uuid, p_warehouse_id uuid, p_quantity numeric)
returns uuid security definer set search_path = public set row_security = off language plpgsql as $$
declare v_order public.work_orders%rowtype; v_balance public.stock_balances%rowtype; v_id uuid;
begin
  select * into v_order from public.work_orders where id = p_work_order_id and deleted_at is null;
  if v_order.id is null or not public.has_permission(v_order.organization_id, v_order.branch_id, 'inventory.reserve') then raise exception 'permission_denied'; end if;
  if p_quantity <= 0 then raise exception 'quantity_must_be_positive'; end if;
  select * into v_balance from public.stock_balances where warehouse_id = p_warehouse_id and product_id = p_product_id for update;
  if v_balance.warehouse_id is null or v_balance.on_hand - v_balance.reserved < p_quantity then raise exception 'insufficient_available_stock'; end if;
  update public.stock_balances set reserved = reserved + p_quantity, updated_at = now() where warehouse_id = p_warehouse_id and product_id = p_product_id;
  insert into public.stock_reservations (organization_id, branch_id, warehouse_id, product_id, work_order_id, quantity, created_by, updated_by)
  values (v_order.organization_id, v_order.branch_id, p_warehouse_id, p_product_id, p_work_order_id, p_quantity, auth.uid(), auth.uid()) returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.reserve_stock(uuid, uuid, uuid, numeric) to authenticated;

create or replace function public.release_stock_reservation(p_reservation_id uuid, p_status text default 'released')
returns void security definer set search_path = public set row_security = off language plpgsql as $$
declare v_res public.stock_reservations%rowtype;
begin
  select * into v_res from public.stock_reservations where id = p_reservation_id for update;
  if v_res.id is null or v_res.status <> 'active' then raise exception 'reservation_not_active'; end if;
  if not public.has_permission(v_res.organization_id, v_res.branch_id, 'inventory.reserve') then raise exception 'permission_denied'; end if;
  update public.stock_balances set reserved = greatest(0, reserved - v_res.quantity), updated_at = now()
    where warehouse_id = v_res.warehouse_id and product_id = v_res.product_id;
  update public.stock_reservations set status = p_status, released_at = now(), updated_by = auth.uid() where id = p_reservation_id;
end;
$$;
grant execute on function public.release_stock_reservation(uuid, text) to authenticated;

create or replace function public.receive_purchase_order(p_purchase_order_id uuid, p_supplier_invoice text default null)
returns uuid security definer set search_path = public set row_security = off language plpgsql as $$
declare v_order public.purchase_orders%rowtype; v_item record; v_receipt uuid; v_quantity numeric;
begin
  select * into v_order from public.purchase_orders where id = p_purchase_order_id and deleted_at is null for update;
  if v_order.id is null or not public.has_permission(v_order.organization_id, v_order.branch_id, 'purchases.receive') then raise exception 'permission_denied'; end if;
  if v_order.status not in ('approved','sent','partial') then raise exception 'purchase_order_not_receivable'; end if;
  insert into public.purchase_receipts (organization_id, branch_id, purchase_order_id, warehouse_id, supplier_invoice, created_by)
  values (v_order.organization_id, v_order.branch_id, v_order.id, v_order.warehouse_id, p_supplier_invoice, auth.uid()) returning id into v_receipt;
  for v_item in select * from public.purchase_order_items where purchase_order_id = v_order.id for update loop
    v_quantity := v_item.quantity - v_item.received_quantity;
    if v_quantity > 0 then
      insert into public.purchase_receipt_items (organization_id, receipt_id, purchase_order_item_id, product_id, quantity, unit_cost)
      values (v_order.organization_id, v_receipt, v_item.id, v_item.product_id, v_quantity, v_item.unit_cost);
      perform public.post_stock_movement(v_item.product_id, v_order.warehouse_id, 'purchase_receipt', v_quantity, v_item.unit_cost, 'purchase_receipt', v_receipt, 'Recebimento do pedido ' || v_order.number, 'receipt:' || v_receipt || ':' || v_item.id);
      update public.purchase_order_items set received_quantity = quantity where id = v_item.id;
    end if;
  end loop;
  update public.purchase_orders set status = 'received', updated_at = now(), updated_by = auth.uid() where id = v_order.id;
  return v_receipt;
end;
$$;
grant execute on function public.receive_purchase_order(uuid, text) to authenticated;

create or replace function public.complete_stock_transfer(p_transfer_id uuid)
returns void security definer set search_path = public set row_security = off language plpgsql as $$
declare v_transfer public.stock_transfers%rowtype; v_item record;
begin
  select * into v_transfer from public.stock_transfers where id = p_transfer_id and deleted_at is null for update;
  if v_transfer.id is null or not public.has_permission(v_transfer.organization_id, v_transfer.branch_id, 'inventory.transfer') then raise exception 'permission_denied'; end if;
  if v_transfer.status not in ('draft','in_transit') then raise exception 'transfer_not_completable'; end if;
  for v_item in select * from public.stock_transfer_items where transfer_id = v_transfer.id loop
    perform public.post_stock_movement(v_item.product_id, v_transfer.source_warehouse_id, 'transfer_out', v_item.quantity, null, 'stock_transfer', v_transfer.id, 'Transferência ' || v_transfer.number, 'transfer-out:' || v_transfer.id || ':' || v_item.id);
    perform public.post_stock_movement(v_item.product_id, v_transfer.destination_warehouse_id, 'transfer_in', v_item.quantity, null, 'stock_transfer', v_transfer.id, 'Transferência ' || v_transfer.number, 'transfer-in:' || v_transfer.id || ':' || v_item.id);
  end loop;
  update public.stock_transfers set status = 'completed', completed_at = now(), updated_by = auth.uid() where id = v_transfer.id;
end;
$$;
grant execute on function public.complete_stock_transfer(uuid) to authenticated;

create or replace function public.complete_stock_count(p_count_id uuid)
returns void security definer set search_path = public set row_security = off language plpgsql as $$
declare v_count public.stock_counts%rowtype; v_item record;
begin
  select * into v_count from public.stock_counts where id = p_count_id and deleted_at is null for update;
  if v_count.id is null or not public.has_permission(v_count.organization_id, v_count.branch_id, 'inventory.count') then raise exception 'permission_denied'; end if;
  if exists (select 1 from public.stock_count_items where count_id = v_count.id and counted_quantity is null) then raise exception 'count_has_pending_items'; end if;
  for v_item in select * from public.stock_count_items where count_id = v_count.id loop
    if v_item.difference > 0 then
      perform public.post_stock_movement(v_item.product_id, v_count.warehouse_id, 'inventory_in', v_item.difference, null, 'stock_count', v_count.id, 'Ajuste do inventário ' || v_count.number, 'count:' || v_count.id || ':' || v_item.id);
    elsif v_item.difference < 0 then
      perform public.post_stock_movement(v_item.product_id, v_count.warehouse_id, 'inventory_out', abs(v_item.difference), null, 'stock_count', v_count.id, 'Ajuste do inventário ' || v_count.number, 'count:' || v_count.id || ':' || v_item.id);
    end if;
  end loop;
  update public.stock_counts set status = 'completed', completed_at = now(), updated_by = auth.uid() where id = v_count.id;
end;
$$;
grant execute on function public.complete_stock_count(uuid) to authenticated;

create view public.inventory_position with (security_invoker = true) as
select b.organization_id, b.branch_id, b.warehouse_id, w.name as warehouse_name, b.product_id, p.sku, p.barcode, p.name as product_name,
  p.unit, b.on_hand, b.reserved, b.on_hand - b.reserved as available, b.average_cost,
  round(b.on_hand * b.average_cost, 2) as stock_value, p.minimum_stock, p.maximum_stock, p.reorder_point,
  greatest(0, coalesce(p.maximum_stock, p.reorder_point) - (b.on_hand - b.reserved)) as suggested_purchase, b.updated_at
from public.stock_balances b join public.products p on p.id = b.product_id join public.warehouses w on w.id = b.warehouse_id
where p.deleted_at is null and w.deleted_at is null;

alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.product_equivalents enable row level security;
alter table public.product_vehicle_applications enable row level security;
alter table public.warehouses enable row level security;
alter table public.stock_balances enable row level security;
alter table public.stock_movements enable row level security;
alter table public.stock_reservations enable row level security;
alter table public.suppliers enable row level security;
alter table public.supplier_products enable row level security;
alter table public.purchase_requests enable row level security;
alter table public.purchase_request_items enable row level security;
alter table public.purchase_quotes enable row level security;
alter table public.purchase_quote_items enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.purchase_receipts enable row level security;
alter table public.purchase_receipt_items enable row level security;
alter table public.stock_transfers enable row level security;
alter table public.stock_transfer_items enable row level security;
alter table public.stock_counts enable row level security;
alter table public.stock_count_items enable row level security;

create policy product_categories_select on public.product_categories for select using (deleted_at is null and public.has_permission(organization_id, null, 'products.view'));
create policy product_categories_manage on public.product_categories for all using (public.has_permission(organization_id, null, 'products.update')) with check (public.has_permission(organization_id, null, 'products.update'));
create policy products_select on public.products for select using (deleted_at is null and public.has_permission(organization_id, branch_id, 'products.view'));
create policy products_insert on public.products for insert with check (public.has_permission(organization_id, branch_id, 'products.create'));
create policy products_update on public.products for update using (public.has_permission(organization_id, branch_id, 'products.update')) with check (public.has_permission(organization_id, branch_id, 'products.update'));
create policy product_equivalents_select on public.product_equivalents for select using (exists (select 1 from public.products p where p.id = product_id and public.has_permission(p.organization_id, p.branch_id, 'products.view')));
create policy product_equivalents_manage on public.product_equivalents for all using (exists (select 1 from public.products p where p.id = product_id and public.has_permission(p.organization_id, p.branch_id, 'products.update'))) with check (exists (select 1 from public.products p where p.id = product_id and public.has_permission(p.organization_id, p.branch_id, 'products.update')));
create policy product_applications_select on public.product_vehicle_applications for select using (public.has_permission(organization_id, null, 'products.view'));
create policy product_applications_manage on public.product_vehicle_applications for all using (public.has_permission(organization_id, null, 'products.update')) with check (public.has_permission(organization_id, null, 'products.update'));
create policy warehouses_select on public.warehouses for select using (deleted_at is null and public.has_permission(organization_id, branch_id, 'inventory.view'));
create policy warehouses_manage on public.warehouses for all using (public.has_permission(organization_id, branch_id, 'inventory.move')) with check (public.has_permission(organization_id, branch_id, 'inventory.move'));
create policy stock_balances_select on public.stock_balances for select using (public.has_permission(organization_id, branch_id, 'inventory.view'));
create policy stock_movements_select on public.stock_movements for select using (public.has_permission(organization_id, branch_id, 'inventory.view'));
create policy stock_reservations_select on public.stock_reservations for select using (public.has_permission(organization_id, branch_id, 'inventory.view'));
create policy stock_reservations_update on public.stock_reservations for update using (public.has_permission(organization_id, branch_id, 'inventory.reserve')) with check (public.has_permission(organization_id, branch_id, 'inventory.reserve'));
create policy suppliers_select on public.suppliers for select using (deleted_at is null and public.has_permission(organization_id, branch_id, 'suppliers.view'));
create policy suppliers_insert on public.suppliers for insert with check (public.has_permission(organization_id, branch_id, 'suppliers.create'));
create policy suppliers_update on public.suppliers for update using (public.has_permission(organization_id, branch_id, 'suppliers.update')) with check (public.has_permission(organization_id, branch_id, 'suppliers.update'));
create policy supplier_products_select on public.supplier_products for select using (exists (select 1 from public.suppliers s where s.id = supplier_id and public.has_permission(s.organization_id, s.branch_id, 'suppliers.view')));
create policy supplier_products_manage on public.supplier_products for all using (exists (select 1 from public.suppliers s where s.id = supplier_id and public.has_permission(s.organization_id, s.branch_id, 'suppliers.update'))) with check (exists (select 1 from public.suppliers s where s.id = supplier_id and public.has_permission(s.organization_id, s.branch_id, 'suppliers.update')));
create policy purchase_requests_select on public.purchase_requests for select using (deleted_at is null and public.has_permission(organization_id, branch_id, 'purchases.view'));
create policy purchase_requests_manage on public.purchase_requests for all using (public.has_permission(organization_id, branch_id, 'purchases.create')) with check (public.has_permission(organization_id, branch_id, 'purchases.create'));
create policy purchase_quotes_select on public.purchase_quotes for select using (deleted_at is null and public.has_permission(organization_id, branch_id, 'purchases.view'));
create policy purchase_quotes_manage on public.purchase_quotes for all using (public.has_permission(organization_id, branch_id, 'purchases.create')) with check (public.has_permission(organization_id, branch_id, 'purchases.create'));
create policy purchase_orders_select on public.purchase_orders for select using (deleted_at is null and public.has_permission(organization_id, branch_id, 'purchases.view'));
create policy purchase_orders_manage on public.purchase_orders for all using (public.has_permission(organization_id, branch_id, 'purchases.create')) with check (public.has_permission(organization_id, branch_id, 'purchases.create'));
create policy purchase_receipts_select on public.purchase_receipts for select using (public.has_permission(organization_id, branch_id, 'purchases.view'));
create policy stock_transfers_select on public.stock_transfers for select using (deleted_at is null and public.has_permission(organization_id, branch_id, 'inventory.view'));
create policy stock_transfers_manage on public.stock_transfers for all using (public.has_permission(organization_id, branch_id, 'inventory.transfer')) with check (public.has_permission(organization_id, branch_id, 'inventory.transfer'));
create policy stock_counts_select on public.stock_counts for select using (deleted_at is null and public.has_permission(organization_id, branch_id, 'inventory.view'));
create policy stock_counts_manage on public.stock_counts for all using (public.has_permission(organization_id, branch_id, 'inventory.count')) with check (public.has_permission(organization_id, branch_id, 'inventory.count'));

create policy purchase_request_items_access on public.purchase_request_items for all using (exists (select 1 from public.purchase_requests r where r.id = request_id and public.has_permission(r.organization_id, r.branch_id, 'purchases.view'))) with check (exists (select 1 from public.purchase_requests r where r.id = request_id and public.has_permission(r.organization_id, r.branch_id, 'purchases.create')));
create policy purchase_quote_items_access on public.purchase_quote_items for all using (exists (select 1 from public.purchase_quotes q where q.id = quote_id and public.has_permission(q.organization_id, q.branch_id, 'purchases.view'))) with check (exists (select 1 from public.purchase_quotes q where q.id = quote_id and public.has_permission(q.organization_id, q.branch_id, 'purchases.create')));
create policy purchase_order_items_access on public.purchase_order_items for all using (exists (select 1 from public.purchase_orders o where o.id = purchase_order_id and public.has_permission(o.organization_id, o.branch_id, 'purchases.view'))) with check (exists (select 1 from public.purchase_orders o where o.id = purchase_order_id and public.has_permission(o.organization_id, o.branch_id, 'purchases.create')));
create policy purchase_receipt_items_select on public.purchase_receipt_items for select using (exists (select 1 from public.purchase_receipts r where r.id = receipt_id and public.has_permission(r.organization_id, r.branch_id, 'purchases.view')));
create policy stock_transfer_items_access on public.stock_transfer_items for all using (exists (select 1 from public.stock_transfers t where t.id = transfer_id and public.has_permission(t.organization_id, t.branch_id, 'inventory.view'))) with check (exists (select 1 from public.stock_transfers t where t.id = transfer_id and public.has_permission(t.organization_id, t.branch_id, 'inventory.transfer')));
create policy stock_count_items_access on public.stock_count_items for all using (exists (select 1 from public.stock_counts c where c.id = count_id and public.has_permission(c.organization_id, c.branch_id, 'inventory.view'))) with check (exists (select 1 from public.stock_counts c where c.id = count_id and public.has_permission(c.organization_id, c.branch_id, 'inventory.count')));

grant select, insert, update, delete on public.product_categories, public.products, public.product_equivalents, public.product_vehicle_applications,
  public.warehouses, public.stock_reservations, public.suppliers, public.supplier_products, public.purchase_requests, public.purchase_request_items,
  public.purchase_quotes, public.purchase_quote_items, public.purchase_orders, public.purchase_order_items, public.stock_transfers, public.stock_transfer_items,
  public.stock_counts, public.stock_count_items to authenticated;
grant select on public.stock_balances, public.stock_movements, public.purchase_receipts, public.purchase_receipt_items, public.inventory_position to authenticated;

create trigger audit_products after insert or update or delete on public.products for each row execute function public.write_audit_log();
create trigger audit_warehouses after insert or update or delete on public.warehouses for each row execute function public.write_audit_log();
create trigger audit_suppliers after insert or update or delete on public.suppliers for each row execute function public.write_audit_log();
create trigger audit_purchase_orders after insert or update or delete on public.purchase_orders for each row execute function public.write_audit_log();
create trigger audit_stock_transfers after insert or update or delete on public.stock_transfers for each row execute function public.write_audit_log();
create trigger audit_stock_counts after insert or update or delete on public.stock_counts for each row execute function public.write_audit_log();

commit;
