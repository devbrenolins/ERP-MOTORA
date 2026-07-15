begin;

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

alter table public.platform_admins enable row level security;
revoke all on table public.platform_admins from public, anon, authenticated;

insert into public.platform_admins (user_id, created_by)
select distinct ur.user_id, ur.created_by
from public.user_roles ur
join public.roles r on r.id = ur.role_id
where r.code = 'super_admin'
on conflict (user_id) do nothing;

create or replace function public.provision_customer_organization(
  p_actor uuid,
  p_owner_user uuid,
  p_organization_name text,
  p_legal_name text,
  p_tax_id text,
  p_branch_name text,
  p_branch_code text,
  p_timezone text default 'America/Bahia'
)
returns jsonb
security definer
set search_path = public
set row_security = off
language plpgsql
as $$
declare
  v_organization uuid;
  v_branch uuid;
  v_owner_role uuid;
  v_admin_role uuid;
  v_readonly_role uuid;
  v_dev_role uuid;
  v_tax_id text := regexp_replace(coalesce(p_tax_id, ''), '\D', '', 'g');
begin
  if p_actor is null or not exists (select 1 from public.platform_admins where user_id = p_actor) then
    raise exception 'permission_denied';
  end if;
  if not exists (select 1 from auth.users where id = p_owner_user) then raise exception 'owner_not_found'; end if;
  if char_length(trim(coalesce(p_organization_name, ''))) < 2 then raise exception 'invalid_organization_name'; end if;
  if v_tax_id !~ '^[0-9]{11,14}$' then raise exception 'invalid_tax_id'; end if;
  if upper(trim(coalesce(p_branch_code, ''))) !~ '^[A-Z0-9_-]{2,10}$' then raise exception 'invalid_branch_code'; end if;

  insert into public.organizations (name, legal_name, tax_id, created_by, updated_by)
  values (trim(p_organization_name), trim(p_legal_name), v_tax_id, p_actor, p_actor)
  returning id into v_organization;

  insert into public.branches (organization_id, name, code, timezone, created_by, updated_by)
  values (v_organization, trim(p_branch_name), upper(trim(p_branch_code)), coalesce(nullif(trim(p_timezone), ''), 'America/Bahia'), p_actor, p_actor)
  returning id into v_branch;

  insert into public.roles (organization_id, code, name, description, is_system, created_by, updated_by)
  values
    (v_organization, 'owner', 'Superadmin', 'Dono da empresa com acesso integral de negócio e gestão de cargos.', true, p_actor, p_actor),
    (v_organization, 'administrator', 'Administrador', 'Administra operação, equipe e configurações.', true, p_actor, p_actor),
    (v_organization, 'read_only', 'Somente leitura', 'Consulta dados autorizados sem alterar registros.', true, p_actor, p_actor)
  on conflict (organization_id, code) do nothing;

  select id into v_owner_role from public.roles where organization_id = v_organization and code = 'owner';
  select id into v_admin_role from public.roles where organization_id = v_organization and code = 'administrator';
  select id into v_readonly_role from public.roles where organization_id = v_organization and code = 'read_only';
  select id into v_dev_role from public.roles where organization_id = v_organization and code = 'super_admin';
  if v_owner_role is null or v_dev_role is null then raise exception 'roles_not_seeded'; end if;

  insert into public.role_permissions (role_id, permission_id, created_by)
  select v_owner_role, id, p_actor from public.permissions on conflict do nothing;
  insert into public.role_permissions (role_id, permission_id, created_by)
  select v_admin_role, id, p_actor from public.permissions
  where code not in ('organizations.manage', 'roles.manage') on conflict do nothing;
  insert into public.role_permissions (role_id, permission_id, created_by)
  select v_readonly_role, id, p_actor from public.permissions where action = 'view' on conflict do nothing;

  insert into public.organization_users (organization_id, user_id, status, invited_by, joined_at)
  values
    (v_organization, p_owner_user, 'active', p_actor, now()),
    (v_organization, p_actor, 'active', p_actor, now())
  on conflict (organization_id, user_id) do update set status = 'active', joined_at = coalesce(public.organization_users.joined_at, now());

  insert into public.branch_users (organization_id, branch_id, user_id, status)
  values
    (v_organization, v_branch, p_owner_user, 'active'),
    (v_organization, v_branch, p_actor, 'active')
  on conflict (branch_id, user_id) do update set status = 'active';

  insert into public.user_roles (organization_id, branch_id, user_id, role_id, created_by)
  values
    (v_organization, null, p_owner_user, v_owner_role, p_actor),
    (v_organization, null, p_actor, v_dev_role, p_actor)
  on conflict do nothing;

  update public.profiles
  set last_organization_id = v_organization,
      last_branch_id = v_branch,
      updated_at = now()
  where id = p_owner_user;

  insert into public.document_sequences (organization_id, branch_id, document_type)
  values (v_organization, v_branch, 'work_order'), (v_organization, v_branch, 'estimate')
  on conflict do nothing;

  return jsonb_build_object('id', v_organization, 'branchId', v_branch, 'ownerUserId', p_owner_user);
end;
$$;

create or replace function public.provision_organization_user(
  p_actor uuid,
  p_organization uuid,
  p_user uuid,
  p_branch uuid,
  p_role uuid
)
returns void
security definer
set search_path = public
set row_security = off
language plpgsql
as $$
declare
  v_actor_is_platform boolean;
  v_target_role_code text;
begin
  v_actor_is_platform := exists (select 1 from public.platform_admins where user_id = p_actor);
  if not v_actor_is_platform and not exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.organization_users ou on ou.organization_id = ur.organization_id and ou.user_id = ur.user_id
    where ur.user_id = p_actor
      and ur.organization_id = p_organization
      and r.code in ('owner', 'super_admin')
      and r.deleted_at is null
      and ou.status = 'active'
  ) then raise exception 'permission_denied'; end if;

  select code into v_target_role_code
  from public.roles
  where id = p_role and organization_id = p_organization and deleted_at is null;
  if v_target_role_code is null then raise exception 'invalid_role'; end if;
  if v_target_role_code = 'super_admin' and not v_actor_is_platform then raise exception 'permission_denied'; end if;
  if not exists (select 1 from public.branches where id = p_branch and organization_id = p_organization and status = 'active' and deleted_at is null) then
    raise exception 'invalid_branch';
  end if;
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'user_not_found'; end if;

  insert into public.organization_users (organization_id, user_id, status, invited_by, joined_at)
  values (p_organization, p_user, 'active', p_actor, now())
  on conflict (organization_id, user_id) do update set status = 'active';

  insert into public.branch_users (organization_id, branch_id, user_id, status)
  values (p_organization, p_branch, p_user, 'active')
  on conflict (branch_id, user_id) do update set status = 'active';

  insert into public.user_roles (organization_id, branch_id, user_id, role_id, created_by)
  values (p_organization, p_branch, p_user, p_role, p_actor)
  on conflict do nothing;

  update public.profiles
  set last_organization_id = coalesce(last_organization_id, p_organization),
      last_branch_id = coalesce(last_branch_id, p_branch),
      updated_at = now()
  where id = p_user;
end;
$$;

revoke all on function public.provision_customer_organization(uuid,uuid,text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.provision_organization_user(uuid,uuid,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.provision_customer_organization(uuid,uuid,text,text,text,text,text,text) to service_role;
grant execute on function public.provision_organization_user(uuid,uuid,uuid,uuid,uuid) to service_role;

commit;
