begin;

insert into public.permissions (code, module, action, description) values
  ('customers.delete', 'customers', 'delete', 'Arquivar clientes'),
  ('vehicles.create', 'vehicles', 'create', 'Cadastrar veículos'),
  ('vehicles.update', 'vehicles', 'update', 'Editar veículos'),
  ('vehicles.delete', 'vehicles', 'delete', 'Arquivar veículos'),
  ('appointments.view', 'appointments', 'view', 'Visualizar agenda'),
  ('appointments.create', 'appointments', 'create', 'Criar agendamentos'),
  ('appointments.update', 'appointments', 'update', 'Alterar agendamentos'),
  ('appointments.cancel', 'appointments', 'cancel', 'Cancelar agendamentos'),
  ('reception.view', 'reception', 'view', 'Visualizar recepção'),
  ('reception.create', 'reception', 'create', 'Realizar check-in'),
  ('inspections.view', 'inspections', 'view', 'Visualizar inspeções'),
  ('inspections.create', 'inspections', 'create', 'Criar inspeções'),
  ('inspections.update', 'inspections', 'update', 'Preencher inspeções'),
  ('estimates.view', 'estimates', 'view', 'Visualizar orçamentos'),
  ('estimates.create', 'estimates', 'create', 'Criar orçamentos'),
  ('estimates.update', 'estimates', 'update', 'Editar orçamentos'),
  ('estimates.approve', 'estimates', 'approve', 'Registrar aprovação'),
  ('work_orders.update', 'work_orders', 'update', 'Editar ordens de serviço'),
  ('work_orders.reopen', 'work_orders', 'reopen', 'Reabrir ordens de serviço'),
  ('work_orders.cancel', 'work_orders', 'cancel', 'Cancelar ordens de serviço')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id, created_by)
select r.id, p.id, r.created_by from public.roles r cross join public.permissions p
where r.code in ('owner', 'administrator')
  and p.module in ('customers', 'vehicles', 'appointments', 'reception', 'inspections', 'estimates', 'work_orders')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id, created_by)
select r.id, p.id, r.created_by from public.roles r cross join public.permissions p
where r.code = 'read_only' and p.action = 'view'
on conflict do nothing;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  primary_branch_id uuid not null references public.branches(id),
  customer_type text not null default 'individual' check (customer_type in ('individual', 'company')),
  name text not null check (char_length(trim(name)) >= 2),
  trade_name text, tax_id text, state_registration text, birth_date date,
  primary_phone text, whatsapp text, primary_email text, source text,
  classification text default 'standard',
  credit_limit numeric(14,2) not null default 0 check (credit_limit >= 0),
  notes text, communication_consent boolean not null default false, consent_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz
);
create unique index customers_tax_id_unique on public.customers (organization_id, tax_id) where tax_id is not null and deleted_at is null;
create index customers_search_idx on public.customers (organization_id, lower(name)) where deleted_at is null;
create index customers_phone_idx on public.customers (organization_id, primary_phone) where primary_phone is not null and deleted_at is null;

create table public.customer_contacts (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  customer_id uuid not null references public.customers(id),
  contact_type text not null check (contact_type in ('phone', 'whatsapp', 'email', 'other')),
  label text, value text not null, is_primary boolean not null default false,
  created_at timestamptz not null default now(), deleted_at timestamptz
);
create index customer_contacts_customer_idx on public.customer_contacts (customer_id) where deleted_at is null;

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  customer_id uuid not null references public.customers(id), address_type text not null default 'main',
  postal_code text, street text not null, number text, complement text, district text, city text not null, state text not null,
  is_primary boolean not null default false, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  branch_id uuid not null references public.branches(id), customer_id uuid not null references public.customers(id),
  license_plate text not null, chassis text, renavam text, brand text not null, model text not null, version text,
  manufacture_year smallint, model_year smallint, color text, fuel_type text, transmission text, engine text,
  mileage integer not null default 0 check (mileage >= 0), category text, use_type text, fleet_code text, insurer text,
  notes text, last_service_at date, next_service_at date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz
);
create unique index vehicles_plate_unique on public.vehicles (organization_id, upper(license_plate)) where deleted_at is null;
create index vehicles_customer_idx on public.vehicles (customer_id) where deleted_at is null;

create table public.vehicle_mileage_history (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  branch_id uuid not null references public.branches(id), vehicle_id uuid not null references public.vehicles(id),
  mileage integer not null check (mileage >= 0), recorded_at timestamptz not null default now(),
  source_type text not null, source_id uuid, created_by uuid references auth.users(id)
);
create index vehicle_mileage_vehicle_idx on public.vehicle_mileage_history (vehicle_id, recorded_at desc);

create table public.customer_interactions (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  branch_id uuid not null references public.branches(id), customer_id uuid references public.customers(id),
  vehicle_id uuid references public.vehicles(id),
  channel text not null check (channel in ('phone', 'whatsapp', 'in_person', 'email', 'referral', 'social', 'website', 'other')),
  subject text not null, notes text,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'new' check (status in ('new', 'in_progress', 'waiting_customer', 'scheduled', 'converted', 'lost')),
  next_contact_at timestamptz, assigned_to uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz
);

create table public.service_bays (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  branch_id uuid not null references public.branches(id), name text not null,
  resource_type text not null default 'bay' check (resource_type in ('bay', 'lift', 'equipment')),
  status text not null default 'active' check (status in ('active', 'maintenance', 'inactive')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique (branch_id, name)
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  branch_id uuid not null references public.branches(id), customer_id uuid not null references public.customers(id),
  vehicle_id uuid references public.vehicles(id), service_bay_id uuid references public.service_bays(id),
  assigned_to uuid references auth.users(id), starts_at timestamptz not null, ends_at timestamptz not null,
  service_description text not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'arrived', 'in_progress', 'completed', 'cancelled', 'no_show')),
  notes text, cancellation_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz,
  check (ends_at > starts_at)
);
create index appointments_branch_time_idx on public.appointments (branch_id, starts_at, ends_at) where deleted_at is null;

create table public.inspection_templates (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  branch_id uuid references public.branches(id), name text not null, description text, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz
);
create table public.inspection_sections (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  template_id uuid not null references public.inspection_templates(id) on delete cascade, name text not null, sort_order integer not null default 0
);
create table public.inspection_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  section_id uuid not null references public.inspection_sections(id) on delete cascade, label text not null,
  instructions text, requires_photo boolean not null default false, sort_order integer not null default 0
);
create table public.inspections (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  branch_id uuid not null references public.branches(id), template_id uuid references public.inspection_templates(id),
  customer_id uuid not null references public.customers(id), vehicle_id uuid not null references public.vehicles(id),
  work_order_id uuid, mileage integer check (mileage >= 0),
  status text not null default 'draft' check (status in ('draft', 'in_progress', 'completed', 'cancelled')),
  notes text, started_at timestamptz, completed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz
);
create table public.inspection_results (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  inspection_item_id uuid references public.inspection_items(id), item_label text not null,
  condition text not null default 'not_checked' check (condition in ('approved', 'good', 'attention', 'critical', 'not_checked', 'not_applicable')),
  notes text, recommendation text, urgency text check (urgency in ('low', 'medium', 'high', 'immediate')),
  estimated_price numeric(14,2) not null default 0, customer_approved boolean,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.estimates (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  branch_id uuid not null references public.branches(id), number text not null,
  customer_id uuid not null references public.customers(id), vehicle_id uuid not null references public.vehicles(id),
  inspection_id uuid references public.inspections(id), consultant_id uuid references auth.users(id),
  status text not null default 'draft' check (status in ('draft', 'diagnosis', 'sent', 'viewed', 'partially_approved', 'approved', 'rejected', 'expired', 'converted', 'cancelled')),
  version integer not null default 1, valid_until date, mileage integer check (mileage >= 0), expected_completion_at timestamptz,
  parts_subtotal numeric(14,2) not null default 0, services_subtotal numeric(14,2) not null default 0,
  discount_total numeric(14,2) not null default 0, tax_total numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0, notes text, terms text,
  public_token uuid not null default gen_random_uuid(), token_expires_at timestamptz,
  sent_at timestamptz, viewed_at timestamptz, approved_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz,
  unique (organization_id, branch_id, number), unique (public_token)
);
create index estimates_scope_status_idx on public.estimates (organization_id, branch_id, status) where deleted_at is null;

create table public.estimate_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  item_type text not null check (item_type in ('service', 'part', 'supply', 'outsourced')),
  description text not null, quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit_cost numeric(14,2) not null default 0, unit_price numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0, tax numeric(14,2) not null default 0, total numeric(14,2) not null default 0,
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  rejection_reason text, sort_order integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.estimate_versions (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  estimate_id uuid not null references public.estimates(id), version integer not null, snapshot jsonb not null,
  reason text, created_at timestamptz not null default now(), created_by uuid references auth.users(id), unique (estimate_id, version)
);
create table public.estimate_approvals (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  estimate_id uuid not null references public.estimates(id), approved_by_name text not null,
  decision text not null check (decision in ('approved', 'partially_approved', 'rejected')),
  notes text, ip inet, user_agent text, approved_at timestamptz not null default now()
);

create table public.work_orders (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  branch_id uuid not null references public.branches(id), number text not null,
  customer_id uuid not null references public.customers(id), vehicle_id uuid not null references public.vehicles(id),
  estimate_id uuid references public.estimates(id), appointment_id uuid references public.appointments(id),
  consultant_id uuid references auth.users(id), technician_id uuid references auth.users(id), service_bay_id uuid references public.service_bays(id),
  status text not null default 'awaiting_triage' check (status in ('awaiting_triage', 'diagnosis', 'awaiting_estimate', 'awaiting_approval', 'awaiting_parts', 'queued', 'in_progress', 'paused', 'outsourced', 'testing', 'washing', 'awaiting_payment', 'ready', 'delivered', 'cancelled')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  mileage_in integer check (mileage_in >= 0), fuel_level smallint check (fuel_level between 0 and 100),
  customer_complaint text not null, diagnosis text, internal_notes text, customer_notes text,
  vehicle_items jsonb not null default '[]'::jsonb, damage_notes jsonb not null default '[]'::jsonb, terms text,
  entry_at timestamptz not null default now(), due_at timestamptz, completed_at timestamptz, delivered_at timestamptz,
  parts_subtotal numeric(14,2) not null default 0, services_subtotal numeric(14,2) not null default 0,
  discount_total numeric(14,2) not null default 0, tax_total numeric(14,2) not null default 0, total numeric(14,2) not null default 0,
  cancellation_reason text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id), updated_by uuid references auth.users(id), deleted_at timestamptz,
  unique (organization_id, branch_id, number)
);
alter table public.inspections add constraint inspections_work_order_fk foreign key (work_order_id) references public.work_orders(id);
create index work_orders_scope_status_idx on public.work_orders (organization_id, branch_id, status) where deleted_at is null;
create index work_orders_vehicle_idx on public.work_orders (vehicle_id, entry_at desc) where deleted_at is null;

create table public.work_order_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  item_type text not null check (item_type in ('service', 'part', 'supply', 'outsourced')),
  description text not null, quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit_cost numeric(14,2) not null default 0, unit_price numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0, tax numeric(14,2) not null default 0, total numeric(14,2) not null default 0,
  estimated_minutes integer, actual_minutes integer, warranty_days integer, assigned_to uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.work_order_status_history (
  id bigint generated always as identity primary key, organization_id uuid not null references public.organizations(id),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  from_status text, to_status text not null, reason text, changed_at timestamptz not null default now(), changed_by uuid references auth.users(id)
);
create index work_order_history_idx on public.work_order_status_history (work_order_id, changed_at desc);
create table public.work_order_time_entries (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  work_order_item_id uuid references public.work_order_items(id), technician_id uuid not null references auth.users(id),
  started_at timestamptz not null, ended_at timestamptz, pause_reason text, notes text,
  created_at timestamptz not null default now(), check (ended_at is null or ended_at > started_at)
);
create unique index work_order_active_timer_unique on public.work_order_time_entries (technician_id) where ended_at is null;
create table public.work_order_comments (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  body text not null, internal boolean not null default true, created_at timestamptz not null default now(),
  created_by uuid references auth.users(id), deleted_at timestamptz
);

create or replace function public.next_document_number(p_organization_id uuid, p_branch_id uuid, p_document_type text)
returns text security definer set search_path = public set row_security = off language plpgsql as $$
declare v_number bigint; v_prefix text; v_padding smallint;
begin
  if not public.is_branch_member(p_branch_id) then raise exception 'branch_access_denied'; end if;
  update public.document_sequences set next_number = next_number + 1, updated_at = now()
    where organization_id = p_organization_id and branch_id = p_branch_id and document_type = p_document_type
    returning next_number - 1, prefix, padding into v_number, v_prefix, v_padding;
  if not found then
    insert into public.document_sequences (organization_id, branch_id, document_type, next_number)
    values (p_organization_id, p_branch_id, p_document_type, 2)
    returning 1, prefix, padding into v_number, v_prefix, v_padding;
  end if;
  return v_prefix || lpad(v_number::text, v_padding, '0');
end;
$$;

create or replace function public.assign_document_number()
returns trigger language plpgsql as $$
begin
  if new.number is null or trim(new.number) = '' then
    new.number := public.next_document_number(new.organization_id, new.branch_id, tg_argv[0]);
  end if;
  return new;
end;
$$;
create trigger estimates_assign_number before insert on public.estimates for each row execute function public.assign_document_number('estimate');
create trigger work_orders_assign_number before insert on public.work_orders for each row execute function public.assign_document_number('work_order');

create or replace function public.calculate_line_total()
returns trigger language plpgsql as $$
begin
  new.total := round((new.quantity * new.unit_price) - new.discount + new.tax, 2);
  if new.total < 0 then raise exception 'negative_line_total'; end if;
  return new;
end;
$$;
create trigger estimate_items_calculate before insert or update on public.estimate_items for each row execute function public.calculate_line_total();
create trigger work_order_items_calculate before insert or update on public.work_order_items for each row execute function public.calculate_line_total();

create or replace function public.recalculate_estimate_totals()
returns trigger security definer set search_path = public language plpgsql as $$
declare v_id uuid := coalesce(new.estimate_id, old.estimate_id);
begin
  update public.estimates e set
    parts_subtotal = coalesce((select sum(total) from public.estimate_items where estimate_id = v_id and item_type in ('part','supply')), 0),
    services_subtotal = coalesce((select sum(total) from public.estimate_items where estimate_id = v_id and item_type in ('service','outsourced')), 0),
    discount_total = coalesce((select sum(discount) from public.estimate_items where estimate_id = v_id), 0),
    tax_total = coalesce((select sum(tax) from public.estimate_items where estimate_id = v_id), 0),
    total = coalesce((select sum(total) from public.estimate_items where estimate_id = v_id), 0), updated_at = now()
  where e.id = v_id;
  return coalesce(new, old);
end;
$$;
create trigger estimate_items_recalculate after insert or update or delete on public.estimate_items for each row execute function public.recalculate_estimate_totals();

create or replace function public.recalculate_work_order_totals()
returns trigger security definer set search_path = public language plpgsql as $$
declare v_id uuid := coalesce(new.work_order_id, old.work_order_id);
begin
  update public.work_orders w set
    parts_subtotal = coalesce((select sum(total) from public.work_order_items where work_order_id = v_id and item_type in ('part','supply')), 0),
    services_subtotal = coalesce((select sum(total) from public.work_order_items where work_order_id = v_id and item_type in ('service','outsourced')), 0),
    discount_total = coalesce((select sum(discount) from public.work_order_items where work_order_id = v_id), 0),
    tax_total = coalesce((select sum(tax) from public.work_order_items where work_order_id = v_id), 0),
    total = coalesce((select sum(total) from public.work_order_items where work_order_id = v_id), 0), updated_at = now()
  where w.id = v_id;
  return coalesce(new, old);
end;
$$;
create trigger work_order_items_recalculate after insert or update or delete on public.work_order_items for each row execute function public.recalculate_work_order_totals();

create or replace function public.track_work_order_status()
returns trigger security definer set search_path = public language plpgsql as $$
begin
  if old.status is distinct from new.status then
    if old.status = 'delivered' and not public.has_permission(new.organization_id, new.branch_id, 'work_orders.reopen') then
      raise exception 'reopen_permission_required';
    end if;
    if new.status = 'cancelled' and coalesce(trim(new.cancellation_reason), '') = '' then
      raise exception 'cancellation_reason_required';
    end if;
    insert into public.work_order_status_history (organization_id, work_order_id, from_status, to_status, reason, changed_by)
    values (new.organization_id, new.id, old.status, new.status, new.cancellation_reason, auth.uid());
  end if;
  return new;
end;
$$;
create trigger work_orders_track_status after update of status on public.work_orders for each row execute function public.track_work_order_status();

create or replace function public.record_vehicle_mileage()
returns trigger security definer set search_path = public language plpgsql as $$
begin
  if new.mileage_in is not null then
    if new.mileage_in < coalesce((select mileage from public.vehicles where id = new.vehicle_id), 0) then
      raise exception 'mileage_cannot_decrease';
    end if;
    update public.vehicles set mileage = new.mileage_in, updated_at = now(), updated_by = auth.uid() where id = new.vehicle_id;
    insert into public.vehicle_mileage_history (organization_id, branch_id, vehicle_id, mileage, source_type, source_id, created_by)
    values (new.organization_id, new.branch_id, new.vehicle_id, new.mileage_in, 'work_order', new.id, auth.uid());
  end if;
  return new;
end;
$$;
create trigger work_orders_record_mileage after insert on public.work_orders for each row execute function public.record_vehicle_mileage();

create or replace function public.convert_estimate_to_work_order(p_estimate_id uuid)
returns uuid security definer set search_path = public set row_security = off language plpgsql as $$
declare v_estimate public.estimates; v_work_order uuid;
begin
  select * into v_estimate from public.estimates where id = p_estimate_id and deleted_at is null for update;
  if not found then raise exception 'estimate_not_found'; end if;
  if v_estimate.status not in ('approved', 'partially_approved') then raise exception 'estimate_not_approved'; end if;
  if not public.has_permission(v_estimate.organization_id, v_estimate.branch_id, 'work_orders.create') then raise exception 'permission_denied'; end if;
  insert into public.work_orders (organization_id, branch_id, number, customer_id, vehicle_id, estimate_id, consultant_id, status, customer_complaint, created_by, updated_by)
  values (v_estimate.organization_id, v_estimate.branch_id, '', v_estimate.customer_id, v_estimate.vehicle_id,
    v_estimate.id, v_estimate.consultant_id, 'queued', coalesce(v_estimate.notes, 'Serviços aprovados no orçamento ' || v_estimate.number), auth.uid(), auth.uid())
  returning id into v_work_order;
  insert into public.work_order_items (organization_id, work_order_id, item_type, description, quantity, unit_cost, unit_price, discount, tax)
  select organization_id, v_work_order, item_type, description, quantity, unit_cost, unit_price, discount, tax
  from public.estimate_items where estimate_id = p_estimate_id and approval_status = 'approved';
  update public.estimates set status = 'converted', updated_at = now(), updated_by = auth.uid() where id = p_estimate_id;
  return v_work_order;
end;
$$;
grant execute on function public.convert_estimate_to_work_order(uuid) to authenticated;

create trigger customers_set_updated_at before update on public.customers for each row execute function public.set_updated_at();
create trigger addresses_set_updated_at before update on public.customer_addresses for each row execute function public.set_updated_at();
create trigger vehicles_set_updated_at before update on public.vehicles for each row execute function public.set_updated_at();
create trigger interactions_set_updated_at before update on public.customer_interactions for each row execute function public.set_updated_at();
create trigger service_bays_set_updated_at before update on public.service_bays for each row execute function public.set_updated_at();
create trigger appointments_set_updated_at before update on public.appointments for each row execute function public.set_updated_at();
create trigger inspection_templates_set_updated_at before update on public.inspection_templates for each row execute function public.set_updated_at();
create trigger inspections_set_updated_at before update on public.inspections for each row execute function public.set_updated_at();
create trigger inspection_results_set_updated_at before update on public.inspection_results for each row execute function public.set_updated_at();
create trigger estimates_set_updated_at before update on public.estimates for each row execute function public.set_updated_at();
create trigger estimate_items_set_updated_at before update on public.estimate_items for each row execute function public.set_updated_at();
create trigger work_orders_set_updated_at before update on public.work_orders for each row execute function public.set_updated_at();
create trigger work_order_items_set_updated_at before update on public.work_order_items for each row execute function public.set_updated_at();

alter table public.customers enable row level security;
alter table public.customer_contacts enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.vehicles enable row level security;
alter table public.vehicle_mileage_history enable row level security;
alter table public.customer_interactions enable row level security;
alter table public.service_bays enable row level security;
alter table public.appointments enable row level security;
alter table public.inspection_templates enable row level security;
alter table public.inspection_sections enable row level security;
alter table public.inspection_items enable row level security;
alter table public.inspections enable row level security;
alter table public.inspection_results enable row level security;
alter table public.estimates enable row level security;
alter table public.estimate_items enable row level security;
alter table public.estimate_versions enable row level security;
alter table public.estimate_approvals enable row level security;
alter table public.work_orders enable row level security;
alter table public.work_order_items enable row level security;
alter table public.work_order_status_history enable row level security;
alter table public.work_order_time_entries enable row level security;
alter table public.work_order_comments enable row level security;

create policy customers_select on public.customers for select using (deleted_at is null and public.has_permission(organization_id, primary_branch_id, 'customers.view'));
create policy customers_insert on public.customers for insert with check (public.has_permission(organization_id, primary_branch_id, 'customers.create'));
create policy customers_update on public.customers for update using (public.has_permission(organization_id, primary_branch_id, 'customers.update')) with check (public.has_permission(organization_id, primary_branch_id, 'customers.update'));
create policy vehicles_select on public.vehicles for select using (deleted_at is null and public.has_permission(organization_id, branch_id, 'vehicles.view'));
create policy vehicles_insert on public.vehicles for insert with check (public.has_permission(organization_id, branch_id, 'vehicles.create'));
create policy vehicles_update on public.vehicles for update using (public.has_permission(organization_id, branch_id, 'vehicles.update')) with check (public.has_permission(organization_id, branch_id, 'vehicles.update'));
create policy interactions_select on public.customer_interactions for select using (deleted_at is null and public.has_permission(organization_id, branch_id, 'customers.view'));
create policy interactions_manage on public.customer_interactions for all using (public.has_permission(organization_id, branch_id, 'customers.update')) with check (public.has_permission(organization_id, branch_id, 'customers.update'));
create policy service_bays_select on public.service_bays for select using (deleted_at is null and public.is_branch_member(branch_id));
create policy appointments_select on public.appointments for select using (deleted_at is null and public.has_permission(organization_id, branch_id, 'appointments.view'));
create policy appointments_insert on public.appointments for insert with check (public.has_permission(organization_id, branch_id, 'appointments.create'));
create policy appointments_update on public.appointments for update using (public.has_permission(organization_id, branch_id, 'appointments.update')) with check (public.has_permission(organization_id, branch_id, 'appointments.update'));
create policy inspection_templates_select on public.inspection_templates for select using (deleted_at is null and public.is_organization_member(organization_id));
create policy inspections_select on public.inspections for select using (deleted_at is null and public.has_permission(organization_id, branch_id, 'inspections.view'));
create policy inspections_insert on public.inspections for insert with check (public.has_permission(organization_id, branch_id, 'inspections.create'));
create policy inspections_update on public.inspections for update using (public.has_permission(organization_id, branch_id, 'inspections.update')) with check (public.has_permission(organization_id, branch_id, 'inspections.update'));
create policy estimates_select on public.estimates for select using (deleted_at is null and public.has_permission(organization_id, branch_id, 'estimates.view'));
create policy estimates_insert on public.estimates for insert with check (public.has_permission(organization_id, branch_id, 'estimates.create'));
create policy estimates_update on public.estimates for update using (public.has_permission(organization_id, branch_id, 'estimates.update')) with check (public.has_permission(organization_id, branch_id, 'estimates.update'));
create policy work_orders_select on public.work_orders for select using (deleted_at is null and public.has_permission(organization_id, branch_id, 'work_orders.view'));
create policy work_orders_insert on public.work_orders for insert with check (public.has_permission(organization_id, branch_id, 'work_orders.create'));
create policy work_orders_update on public.work_orders for update using (public.has_permission(organization_id, branch_id, 'work_orders.update')) with check (public.has_permission(organization_id, branch_id, 'work_orders.update'));

create policy customer_contacts_access on public.customer_contacts for all
  using (exists (select 1 from public.customers c where c.id = customer_id and public.has_permission(c.organization_id, c.primary_branch_id, 'customers.view')))
  with check (exists (select 1 from public.customers c where c.id = customer_id and public.has_permission(c.organization_id, c.primary_branch_id, 'customers.update')));
create policy customer_addresses_access on public.customer_addresses for all
  using (exists (select 1 from public.customers c where c.id = customer_id and public.has_permission(c.organization_id, c.primary_branch_id, 'customers.view')))
  with check (exists (select 1 from public.customers c where c.id = customer_id and public.has_permission(c.organization_id, c.primary_branch_id, 'customers.update')));
create policy mileage_access on public.vehicle_mileage_history for select
  using (exists (select 1 from public.vehicles v where v.id = vehicle_id and public.has_permission(v.organization_id, v.branch_id, 'vehicles.view')));
create policy inspection_sections_access on public.inspection_sections for all
  using (exists (select 1 from public.inspection_templates t where t.id = template_id and public.is_organization_member(t.organization_id)))
  with check (exists (select 1 from public.inspection_templates t where t.id = template_id and public.has_permission(t.organization_id, t.branch_id, 'inspections.update')));
create policy inspection_items_access on public.inspection_items for all
  using (exists (select 1 from public.inspection_sections s join public.inspection_templates t on t.id = s.template_id where s.id = section_id and public.is_organization_member(t.organization_id)))
  with check (exists (select 1 from public.inspection_sections s join public.inspection_templates t on t.id = s.template_id where s.id = section_id and public.has_permission(t.organization_id, t.branch_id, 'inspections.update')));
create policy inspection_results_access on public.inspection_results for all
  using (exists (select 1 from public.inspections i where i.id = inspection_id and public.has_permission(i.organization_id, i.branch_id, 'inspections.view')))
  with check (exists (select 1 from public.inspections i where i.id = inspection_id and public.has_permission(i.organization_id, i.branch_id, 'inspections.update')));
create policy estimate_items_access on public.estimate_items for all
  using (exists (select 1 from public.estimates e where e.id = estimate_id and public.has_permission(e.organization_id, e.branch_id, 'estimates.view')))
  with check (exists (select 1 from public.estimates e where e.id = estimate_id and public.has_permission(e.organization_id, e.branch_id, 'estimates.update')));
create policy estimate_versions_access on public.estimate_versions for select
  using (exists (select 1 from public.estimates e where e.id = estimate_id and public.has_permission(e.organization_id, e.branch_id, 'estimates.view')));
create policy estimate_approvals_access on public.estimate_approvals for select
  using (exists (select 1 from public.estimates e where e.id = estimate_id and public.has_permission(e.organization_id, e.branch_id, 'estimates.view')));
create policy work_order_items_access on public.work_order_items for all
  using (exists (select 1 from public.work_orders w where w.id = work_order_id and public.has_permission(w.organization_id, w.branch_id, 'work_orders.view')))
  with check (exists (select 1 from public.work_orders w where w.id = work_order_id and public.has_permission(w.organization_id, w.branch_id, 'work_orders.update')));
create policy work_order_history_access on public.work_order_status_history for select
  using (exists (select 1 from public.work_orders w where w.id = work_order_id and public.has_permission(w.organization_id, w.branch_id, 'work_orders.view')));
create policy work_order_time_access on public.work_order_time_entries for all
  using (exists (select 1 from public.work_orders w where w.id = work_order_id and public.has_permission(w.organization_id, w.branch_id, 'work_orders.view')))
  with check (exists (select 1 from public.work_orders w where w.id = work_order_id and public.has_permission(w.organization_id, w.branch_id, 'work_orders.update')));
create policy work_order_comments_access on public.work_order_comments for all
  using (exists (select 1 from public.work_orders w where w.id = work_order_id and public.has_permission(w.organization_id, w.branch_id, 'work_orders.view')))
  with check (exists (select 1 from public.work_orders w where w.id = work_order_id and public.has_permission(w.organization_id, w.branch_id, 'work_orders.update')));

create trigger audit_customers after insert or update or delete on public.customers for each row execute function public.write_audit_log();
create trigger audit_vehicles after insert or update or delete on public.vehicles for each row execute function public.write_audit_log();
create trigger audit_appointments after insert or update or delete on public.appointments for each row execute function public.write_audit_log();
create trigger audit_inspections after insert or update or delete on public.inspections for each row execute function public.write_audit_log();
create trigger audit_estimates after insert or update or delete on public.estimates for each row execute function public.write_audit_log();
create trigger audit_work_orders after insert or update or delete on public.work_orders for each row execute function public.write_audit_log();

commit;
