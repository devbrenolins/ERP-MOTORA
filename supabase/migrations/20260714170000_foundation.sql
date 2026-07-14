begin;

create extension if not exists pgcrypto;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) >= 2),
  legal_name text not null,
  tax_id text not null check (tax_id ~ '^[0-9]{11,14}$'),
  status text not null default 'active' check (status in ('active', 'suspended', 'inactive')),
  logo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  unique (tax_id)
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  code text not null check (code ~ '^[A-Z0-9_-]{2,10}$'),
  timezone text not null default 'America/Sao_Paulo',
  status text not null default 'active' check (status in ('active', 'inactive')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  unique (organization_id, code)
);
create index branches_organization_idx on public.branches (organization_id) where deleted_at is null;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  avatar_path text,
  last_organization_id uuid references public.organizations(id),
  last_branch_id uuid references public.branches(id),
  last_access_at timestamptz,
  blocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_users (
  organization_id uuid not null references public.organizations(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('invited', 'active', 'blocked', 'inactive')),
  invited_by uuid references auth.users(id),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_users_user_idx on public.organization_users (user_id, organization_id) where status = 'active';

create table public.branch_users (
  organization_id uuid not null references public.organizations(id),
  branch_id uuid not null references public.branches(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'blocked', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (branch_id, user_id),
  foreign key (organization_id, user_id) references public.organization_users(organization_id, user_id)
);
create index branch_users_user_idx on public.branch_users (user_id, branch_id) where status = 'active';

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  code text not null,
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  unique (organization_id, code)
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  module text not null,
  action text not null,
  description text not null,
  created_at timestamptz not null default now(),
  unique (module, action)
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  primary key (role_id, permission_id)
);

create table public.user_roles (
  organization_id uuid not null references public.organizations(id),
  branch_id uuid references public.branches(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique nulls not distinct (organization_id, branch_id, user_id, role_id)
);
create index user_roles_lookup_idx on public.user_roles (user_id, organization_id, branch_id);

create table public.application_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  branch_id uuid references public.branches(id),
  key text not null,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique nulls not distinct (organization_id, branch_id, key)
);

create table public.document_sequences (
  organization_id uuid not null references public.organizations(id),
  branch_id uuid not null references public.branches(id),
  document_type text not null,
  prefix text not null default '',
  next_number bigint not null default 1 check (next_number > 0),
  padding smallint not null default 6 check (padding between 1 and 12),
  updated_at timestamptz not null default now(),
  primary key (branch_id, document_type)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id),
  branch_id uuid references public.branches(id),
  actor_id uuid references auth.users(id),
  occurred_at timestamptz not null default now(),
  entity_schema text not null,
  entity_table text not null,
  entity_id text,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  ip inet,
  user_agent text,
  request_id text
);
create index audit_logs_scope_time_idx on public.audit_logs (organization_id, occurred_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_table, entity_id, occurred_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger organizations_set_updated_at before update on public.organizations for each row execute function public.set_updated_at();
create trigger branches_set_updated_at before update on public.branches for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger organization_users_set_updated_at before update on public.organization_users for each row execute function public.set_updated_at();
create trigger branch_users_set_updated_at before update on public.branch_users for each row execute function public.set_updated_at();
create trigger roles_set_updated_at before update on public.roles for each row execute function public.set_updated_at();
create trigger settings_set_updated_at before update on public.application_settings for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger security definer set search_path = public language plpgsql as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.is_organization_member(p_organization_id uuid)
returns boolean stable security definer set search_path = public set row_security = off language sql as $$
  select exists (
    select 1 from public.organization_users ou
    join public.profiles p on p.id = ou.user_id
    where ou.organization_id = p_organization_id
      and ou.user_id = auth.uid()
      and ou.status = 'active'
      and p.blocked_at is null
  );
$$;

create or replace function public.is_branch_member(p_branch_id uuid)
returns boolean stable security definer set search_path = public set row_security = off language sql as $$
  select exists (
    select 1 from public.branch_users bu
    where bu.branch_id = p_branch_id and bu.user_id = auth.uid() and bu.status = 'active'
  );
$$;

create or replace function public.has_permission(p_organization_id uuid, p_branch_id uuid, p_permission text)
returns boolean stable security definer set search_path = public set row_security = off language sql as $$
  select public.is_organization_member(p_organization_id) and exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id and r.deleted_at is null
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.user_id = auth.uid()
      and ur.organization_id = p_organization_id
      and (ur.branch_id is null or ur.branch_id = p_branch_id)
      and p.code = p_permission
  );
$$;

create or replace function public.write_audit_log()
returns trigger security definer set search_path = public set row_security = off language plpgsql as $$
declare
  previous jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  current jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  source jsonb := coalesce(current, previous);
  v_organization_id uuid := nullif(source ->> 'organization_id', '')::uuid;
  v_request_headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
begin
  if v_organization_id is null and tg_table_name = 'organizations' then
    v_organization_id := nullif(source ->> 'id', '')::uuid;
  elsif v_organization_id is null and tg_table_name = 'role_permissions' then
    select organization_id into v_organization_id from public.roles where id = nullif(source ->> 'role_id', '')::uuid;
  end if;
  insert into public.audit_logs (
    organization_id, branch_id, actor_id, entity_schema, entity_table,
    entity_id, action, old_data, new_data, request_id
  ) values (
    v_organization_id,
    nullif(source ->> 'branch_id', '')::uuid,
    auth.uid(), tg_table_schema, tg_table_name,
    coalesce(source ->> 'id', source ->> 'user_id'), lower(tg_op), previous, current,
    v_request_headers ->> 'x-request-id'
  );
  return coalesce(new, old);
exception when others then
  raise warning 'audit failure on %.%: %', tg_table_schema, tg_table_name, sqlerrm;
  return coalesce(new, old);
end;
$$;

insert into public.permissions (code, module, action, description) values
  ('dashboard.view', 'dashboard', 'view', 'Visualizar indicadores'),
  ('organizations.manage', 'organizations', 'manage', 'Administrar dados da empresa'),
  ('branches.view', 'branches', 'view', 'Visualizar filiais'),
  ('branches.manage', 'branches', 'manage', 'Administrar filiais'),
  ('users.view', 'users', 'view', 'Visualizar usuários'),
  ('users.invite', 'users', 'invite', 'Convidar usuários'),
  ('users.manage', 'users', 'manage', 'Bloquear e administrar usuários'),
  ('roles.view', 'roles', 'view', 'Visualizar perfis de acesso'),
  ('roles.manage', 'roles', 'manage', 'Administrar perfis e permissões'),
  ('audit.view', 'audit', 'view', 'Consultar auditoria'),
  ('settings.view', 'settings', 'view', 'Visualizar configurações'),
  ('settings.manage', 'settings', 'manage', 'Alterar configurações'),
  ('customers.view', 'customers', 'view', 'Visualizar clientes'),
  ('customers.create', 'customers', 'create', 'Cadastrar clientes'),
  ('customers.update', 'customers', 'update', 'Editar clientes'),
  ('vehicles.view', 'vehicles', 'view', 'Visualizar veículos'),
  ('work_orders.view', 'work_orders', 'view', 'Visualizar ordens de serviço'),
  ('work_orders.create', 'work_orders', 'create', 'Criar ordens de serviço'),
  ('inventory.view', 'inventory', 'view', 'Visualizar estoque'),
  ('inventory.move', 'inventory', 'move', 'Movimentar estoque'),
  ('financial.view', 'financial', 'view', 'Visualizar financeiro'),
  ('financial.manage', 'financial', 'manage', 'Administrar financeiro')
on conflict (code) do update set description = excluded.description;

create or replace function public.complete_onboarding(
  p_organization_name text,
  p_legal_name text,
  p_tax_id text,
  p_branch_name text,
  p_branch_code text,
  p_timezone text default 'America/Sao_Paulo'
)
returns jsonb security definer set search_path = public set row_security = off language plpgsql as $$
declare
  v_user uuid := auth.uid();
  v_organization uuid;
  v_branch uuid;
  v_owner_role uuid;
  v_admin_role uuid;
  v_readonly_role uuid;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if char_length(trim(p_organization_name)) < 2 then raise exception 'invalid_organization_name'; end if;
  if regexp_replace(p_tax_id, '\D', '', 'g') !~ '^[0-9]{11,14}$' then raise exception 'invalid_tax_id'; end if;

  insert into public.organizations (name, legal_name, tax_id, created_by, updated_by)
  values (trim(p_organization_name), trim(p_legal_name), regexp_replace(p_tax_id, '\D', '', 'g'), v_user, v_user)
  returning id into v_organization;

  insert into public.branches (organization_id, name, code, timezone, created_by, updated_by)
  values (v_organization, trim(p_branch_name), upper(trim(p_branch_code)), p_timezone, v_user, v_user)
  returning id into v_branch;

  insert into public.organization_users (organization_id, user_id, status, joined_at)
  values (v_organization, v_user, 'active', now());
  insert into public.branch_users (organization_id, branch_id, user_id, status)
  values (v_organization, v_branch, v_user, 'active');

  insert into public.roles (organization_id, code, name, description, is_system, created_by, updated_by)
  values (v_organization, 'owner', 'Proprietário', 'Acesso integral e indelegável do proprietário.', true, v_user, v_user)
  returning id into v_owner_role;
  insert into public.roles (organization_id, code, name, description, is_system, created_by, updated_by)
  values (v_organization, 'administrator', 'Administrador', 'Administra operação, equipe e configurações.', true, v_user, v_user)
  returning id into v_admin_role;
  insert into public.roles (organization_id, code, name, description, is_system, created_by, updated_by)
  values (v_organization, 'read_only', 'Somente leitura', 'Consulta dados autorizados sem alterar registros.', true, v_user, v_user)
  returning id into v_readonly_role;

  insert into public.role_permissions (role_id, permission_id, created_by)
  select v_owner_role, id, v_user from public.permissions;
  insert into public.role_permissions (role_id, permission_id, created_by)
  select v_admin_role, id, v_user from public.permissions where code <> 'organizations.manage';
  insert into public.role_permissions (role_id, permission_id, created_by)
  select v_readonly_role, id, v_user from public.permissions where action = 'view';

  insert into public.user_roles (organization_id, branch_id, user_id, role_id, created_by)
  values (v_organization, null, v_user, v_owner_role, v_user);
  update public.profiles set last_organization_id = v_organization, last_branch_id = v_branch where id = v_user;

  insert into public.document_sequences (organization_id, branch_id, document_type)
  values (v_organization, v_branch, 'work_order'), (v_organization, v_branch, 'estimate');

  return jsonb_build_object('organization_id', v_organization, 'branch_id', v_branch);
end;
$$;
revoke all on function public.complete_onboarding(text, text, text, text, text, text) from public;
grant execute on function public.complete_onboarding(text, text, text, text, text, text) to authenticated;

alter table public.organizations enable row level security;
alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_users enable row level security;
alter table public.branch_users enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.application_settings enable row level security;
alter table public.document_sequences enable row level security;
alter table public.audit_logs enable row level security;

create policy organizations_select on public.organizations for select using (deleted_at is null and public.is_organization_member(id));
create policy organizations_update on public.organizations for update using (public.has_permission(id, null, 'organizations.manage')) with check (public.has_permission(id, null, 'organizations.manage'));
create policy branches_select on public.branches for select using (deleted_at is null and public.is_organization_member(organization_id));
create policy branches_manage on public.branches for all using (public.has_permission(organization_id, id, 'branches.manage')) with check (public.has_permission(organization_id, id, 'branches.manage'));
create policy profiles_select_self on public.profiles for select using (id = auth.uid());
create policy profiles_update_self on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy organization_users_select on public.organization_users for select using (public.is_organization_member(organization_id));
create policy organization_users_manage on public.organization_users for all using (public.has_permission(organization_id, null, 'users.manage')) with check (public.has_permission(organization_id, null, 'users.manage'));
create policy branch_users_select on public.branch_users for select using (public.is_organization_member(organization_id));
create policy branch_users_manage on public.branch_users for all using (public.has_permission(organization_id, branch_id, 'users.manage')) with check (public.has_permission(organization_id, branch_id, 'users.manage'));
create policy roles_select on public.roles for select using (deleted_at is null and public.is_organization_member(organization_id));
create policy roles_manage on public.roles for all using (public.has_permission(organization_id, null, 'roles.manage')) with check (public.has_permission(organization_id, null, 'roles.manage'));
create policy permissions_select on public.permissions for select to authenticated using (true);
create policy role_permissions_select on public.role_permissions for select using (exists (select 1 from public.roles r where r.id = role_id and public.is_organization_member(r.organization_id)));
create policy role_permissions_manage on public.role_permissions for all using (exists (select 1 from public.roles r where r.id = role_id and public.has_permission(r.organization_id, null, 'roles.manage'))) with check (exists (select 1 from public.roles r where r.id = role_id and public.has_permission(r.organization_id, null, 'roles.manage')));
create policy user_roles_select on public.user_roles for select using (public.is_organization_member(organization_id));
create policy user_roles_manage on public.user_roles for all using (public.has_permission(organization_id, branch_id, 'roles.manage')) with check (public.has_permission(organization_id, branch_id, 'roles.manage'));
create policy settings_select on public.application_settings for select using (public.has_permission(organization_id, branch_id, 'settings.view'));
create policy settings_manage on public.application_settings for all using (public.has_permission(organization_id, branch_id, 'settings.manage')) with check (public.has_permission(organization_id, branch_id, 'settings.manage'));
create policy sequences_select on public.document_sequences for select using (public.is_branch_member(branch_id));
create policy audit_select on public.audit_logs for select using (public.has_permission(organization_id, branch_id, 'audit.view'));

create trigger audit_organizations after insert or update or delete on public.organizations for each row execute function public.write_audit_log();
create trigger audit_branches after insert or update or delete on public.branches for each row execute function public.write_audit_log();
create trigger audit_organization_users after insert or update or delete on public.organization_users for each row execute function public.write_audit_log();
create trigger audit_branch_users after insert or update or delete on public.branch_users for each row execute function public.write_audit_log();
create trigger audit_roles after insert or update or delete on public.roles for each row execute function public.write_audit_log();
create trigger audit_role_permissions after insert or update or delete on public.role_permissions for each row execute function public.write_audit_log();
create trigger audit_user_roles after insert or update or delete on public.user_roles for each row execute function public.write_audit_log();
create trigger audit_settings after insert or update or delete on public.application_settings for each row execute function public.write_audit_log();

revoke insert, update, delete on public.audit_logs from anon, authenticated;

commit;
