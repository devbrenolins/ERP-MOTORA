begin;

-- Functional profiles required by the delivery specification, plus two
-- operational profiles requested for go-live (administrative and super admin).
create or replace function public.seed_functional_roles()
returns trigger
security definer
set search_path = public
set row_security = off
language plpgsql
as $$
begin
  insert into public.roles
    (organization_id, code, name, description, is_system, created_by, updated_by)
  values
    (new.id, 'manager', 'Gerente', 'Gestão operacional, equipe e indicadores da unidade.', true, new.created_by, new.created_by),
    (new.id, 'administrative', 'Administrativo', 'Atendimento, cadastros, documentos e rotinas administrativas.', true, new.created_by, new.created_by),
    (new.id, 'service_advisor', 'Consultor de atendimento', 'Recepção, inspeção, orçamento e acompanhamento do cliente.', true, new.created_by, new.created_by),
    (new.id, 'mechanic', 'Mecânico', 'Execução de serviços, inspeções e atualização da ordem.', true, new.created_by, new.created_by),
    (new.id, 'stockkeeper', 'Estoquista', 'Produtos, reservas, contagens e movimentos de estoque.', true, new.created_by, new.created_by),
    (new.id, 'buyer', 'Comprador', 'Fornecedores, pedidos de compra e recebimentos.', true, new.created_by, new.created_by),
    (new.id, 'financial', 'Financeiro', 'Contas, pagamentos, comissões e relatórios financeiros.', true, new.created_by, new.created_by),
    (new.id, 'cashier', 'Caixa', 'Abertura, movimentos e fechamento de caixa.', true, new.created_by, new.created_by),
    (new.id, 'salesperson', 'Vendedor', 'Clientes, orçamentos, CRM e relacionamento comercial.', true, new.created_by, new.created_by),
    (new.id, 'auditor', 'Auditor', 'Consulta de dados, relatórios e trilha de auditoria.', true, new.created_by, new.created_by),
    (new.id, 'super_admin', 'Dev Admin', 'Acesso técnico integral do programador para testes e administração.', true, new.created_by, new.created_by)
  on conflict (organization_id, code) do nothing;

  insert into public.role_permissions (role_id, permission_id, created_by)
  select r.id, p.id, new.created_by
  from public.roles r
  cross join public.permissions p
  where r.organization_id = new.id
    and r.code in ('manager','administrative','service_advisor','mechanic','stockkeeper','buyer','financial','cashier','salesperson','auditor','super_admin')
    and (
      (r.code = 'manager' and p.code not in (
        'organizations.manage','roles.manage','privacy.anonymize','integrations.manage',
        'inventory.allow_negative','cash.reopen','financial.reverse','work_orders.reopen'
      ))
      or (r.code = 'super_admin')
      or (r.code = 'administrative'
        and p.module in ('dashboard','customers','vehicles','appointments','reception','estimates','work_orders','financial','cash','commissions','reports','crm','warranties','fleets','portal','bi','notifications')
        and p.action in ('view','create','update','export'))
      or (r.code = 'service_advisor'
        and p.module in ('dashboard','customers','vehicles','appointments','reception','inspections','estimates','work_orders','crm','warranties','portal','notifications')
        and p.action in ('view','create','update','approve','cancel'))
      or (r.code = 'mechanic' and p.code in (
        'dashboard.view','work_orders.view','work_orders.update','inspections.view',
        'inspections.create','inspections.update','inventory.view','notifications.view'
      ))
      or (r.code = 'stockkeeper'
        and p.module in ('products','suppliers','purchases','inventory','notifications')
        and p.code <> 'inventory.allow_negative')
      or (r.code = 'buyer'
        and p.module in ('products','suppliers','purchases','inventory','reports','notifications')
        and p.action in ('view','create','update','approve','receive','count','export'))
      or (r.code = 'financial'
        and (p.module in ('dashboard','financial','cash','commissions','reports','bi','notifications') or p.code = 'customers.view')
        and p.code not in ('cash.reopen','financial.reverse'))
      or (r.code = 'cashier' and p.code in (
        'dashboard.view','cash.view','cash.manage','financial.view','financial.pay',
        'customers.view','work_orders.view','reports.view','notifications.view'
      ))
      or (r.code = 'salesperson'
        and p.module in ('dashboard','customers','vehicles','appointments','estimates','crm','fleets','portal','notifications')
        and p.action in ('view','create','update','manage','approve'))
      or (r.code = 'auditor'
        and (p.action in ('view','export') or p.code in ('audit.view','privacy.view','privacy.export')))
    )
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function public.seed_functional_roles() from public, anon, authenticated;

drop trigger if exists organizations_seed_functional_roles on public.organizations;
create trigger organizations_seed_functional_roles
after insert on public.organizations
for each row execute function public.seed_functional_roles();

-- Backfill organizations created before this go-live migration.
insert into public.roles
  (organization_id, code, name, description, is_system, created_by, updated_by)
select o.id, seed.code, seed.name, seed.description, true, o.created_by, o.updated_by
from public.organizations o
cross join (values
  ('manager', 'Gerente', 'Gestão operacional, equipe e indicadores da unidade.'),
  ('administrative', 'Administrativo', 'Atendimento, cadastros, documentos e rotinas administrativas.'),
  ('service_advisor', 'Consultor de atendimento', 'Recepção, inspeção, orçamento e acompanhamento do cliente.'),
  ('mechanic', 'Mecânico', 'Execução de serviços, inspeções e atualização da ordem.'),
  ('stockkeeper', 'Estoquista', 'Produtos, reservas, contagens e movimentos de estoque.'),
  ('buyer', 'Comprador', 'Fornecedores, pedidos de compra e recebimentos.'),
  ('financial', 'Financeiro', 'Contas, pagamentos, comissões e relatórios financeiros.'),
  ('cashier', 'Caixa', 'Abertura, movimentos e fechamento de caixa.'),
  ('salesperson', 'Vendedor', 'Clientes, orçamentos, CRM e relacionamento comercial.'),
  ('auditor', 'Auditor', 'Consulta de dados, relatórios e trilha de auditoria.'),
  ('super_admin', 'Dev Admin', 'Acesso técnico integral do programador para testes e administração.')
) as seed(code, name, description)
where o.deleted_at is null
on conflict (organization_id, code) do nothing;

-- Reuse the trigger's permission matrix for pre-existing organizations by
-- inserting only the still-missing grants with an equivalent set expression.
insert into public.role_permissions (role_id, permission_id, created_by)
select r.id, p.id, r.created_by
from public.roles r
cross join public.permissions p
where r.code in ('manager','administrative','service_advisor','mechanic','stockkeeper','buyer','financial','cashier','salesperson','auditor','super_admin')
  and (
    (r.code = 'manager' and p.code not in ('organizations.manage','roles.manage','privacy.anonymize','integrations.manage','inventory.allow_negative','cash.reopen','financial.reverse','work_orders.reopen'))
    or (r.code = 'super_admin')
    or (r.code = 'administrative' and p.module in ('dashboard','customers','vehicles','appointments','reception','estimates','work_orders','financial','cash','commissions','reports','crm','warranties','fleets','portal','bi','notifications') and p.action in ('view','create','update','export'))
    or (r.code = 'service_advisor' and p.module in ('dashboard','customers','vehicles','appointments','reception','inspections','estimates','work_orders','crm','warranties','portal','notifications') and p.action in ('view','create','update','approve','cancel'))
    or (r.code = 'mechanic' and p.code in ('dashboard.view','work_orders.view','work_orders.update','inspections.view','inspections.create','inspections.update','inventory.view','notifications.view'))
    or (r.code = 'stockkeeper' and p.module in ('products','suppliers','purchases','inventory','notifications') and p.code <> 'inventory.allow_negative')
    or (r.code = 'buyer' and p.module in ('products','suppliers','purchases','inventory','reports','notifications') and p.action in ('view','create','update','approve','receive','count','export'))
    or (r.code = 'financial' and (p.module in ('dashboard','financial','cash','commissions','reports','bi','notifications') or p.code = 'customers.view') and p.code not in ('cash.reopen','financial.reverse'))
    or (r.code = 'cashier' and p.code in ('dashboard.view','cash.view','cash.manage','financial.view','financial.pay','customers.view','work_orders.view','reports.view','notifications.view'))
    or (r.code = 'salesperson' and p.module in ('dashboard','customers','vehicles','appointments','estimates','crm','fleets','portal','notifications') and p.action in ('view','create','update','manage','approve'))
    or (r.code = 'auditor' and (p.action in ('view','export') or p.code in ('audit.view','privacy.view','privacy.export')))
  )
on conflict do nothing;

-- Only the super administrator and owner may own the permission that creates
-- and changes roles. This strips the legacy grant from administrator.
delete from public.role_permissions rp
using public.roles r, public.permissions p
where rp.role_id = r.id
  and rp.permission_id = p.id
  and p.code = 'roles.manage'
  and r.code not in ('super_admin', 'owner');

create or replace function public.enforce_exclusive_role_management()
returns trigger
security definer
set search_path = public
set row_security = off
language plpgsql
as $$
declare
  v_permission text;
  v_role text;
begin
  select code into v_permission from public.permissions where id = new.permission_id;
  select code into v_role from public.roles where id = new.role_id;
  if v_permission = 'roles.manage' and v_role not in ('super_admin', 'owner') then
    return null;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_exclusive_role_management() from public, anon, authenticated;
drop trigger if exists role_permissions_exclusive_management on public.role_permissions;
create trigger role_permissions_exclusive_management
before insert or update on public.role_permissions
for each row execute function public.enforce_exclusive_role_management();

-- Owner is displayed as Superadmin in the product terminology.
update public.roles
set name = 'Superadmin',
    description = 'Dono da empresa com acesso integral de negócio e gestão de cargos.',
    updated_at = now()
where code = 'owner';

create or replace function public.normalize_elevated_role_names()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.code = 'owner' then
    new.name := 'Superadmin';
    new.description := 'Dono da empresa com acesso integral de negócio e gestão de cargos.';
  elsif new.code = 'super_admin' then
    new.name := 'Dev Admin';
    new.description := 'Acesso técnico integral do programador para testes e administração.';
  end if;
  return new;
end;
$$;

revoke all on function public.normalize_elevated_role_names() from public, anon, authenticated;
drop trigger if exists roles_normalize_elevated_names on public.roles;
create trigger roles_normalize_elevated_names
before insert or update on public.roles
for each row execute function public.normalize_elevated_role_names();

create or replace function public.create_custom_role(
  p_name text,
  p_description text,
  p_permission_codes text[]
)
returns uuid
security definer
set search_path = public
set row_security = off
language plpgsql
as $$
declare
  v_user uuid := auth.uid();
  v_organization uuid;
  v_role uuid;
  v_code text;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select last_organization_id into v_organization from public.profiles where id = v_user;
  if v_organization is null or not public.has_permission(v_organization, null, 'roles.manage') then
    raise exception 'permission_denied';
  end if;
  if char_length(trim(coalesce(p_name, ''))) < 3 then raise exception 'invalid_role_name'; end if;
  if coalesce(array_length(p_permission_codes, 1), 0) = 0 then raise exception 'permissions_required'; end if;

  v_code := 'custom_' || left(md5(gen_random_uuid()::text), 12);
  insert into public.roles (organization_id, code, name, description, is_system, created_by, updated_by)
  values (v_organization, v_code, trim(p_name), nullif(trim(coalesce(p_description, '')), ''), false, v_user, v_user)
  returning id into v_role;

  insert into public.role_permissions (role_id, permission_id, created_by)
  select v_role, p.id, v_user
  from public.permissions p
  where p.code = any(p_permission_codes)
    and p.code <> 'roles.manage'
  on conflict do nothing;

  if not exists (select 1 from public.role_permissions where role_id = v_role) then
    raise exception 'permissions_required';
  end if;
  return v_role;
end;
$$;

revoke all on function public.create_custom_role(text, text, text[]) from public, anon;
grant execute on function public.create_custom_role(text, text, text[]) to authenticated;

commit;
