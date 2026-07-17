begin;

-- validate_completion_scope() serve notifications e privacy_requests, mas só
-- privacy_requests tem a coluna customer_id. O teste de tg_table_name estava na
-- mesma expressão da referência a new.customer_id, e o PL/pgSQL resolve o campo
-- contra o rowtype do NEW antes de avaliar a condição — então todo insert em
-- notifications falhava com 42703 em vez de curto-circuitar. Aninhar o teste faz
-- o campo ser resolvido apenas quando a tabela realmente o possui.
create or replace function public.validate_completion_scope()
returns trigger security definer set search_path=public set row_security=off language plpgsql as $$
begin
 if new.branch_id is not null and not exists(select 1 from public.branches b where b.id=new.branch_id and b.organization_id=new.organization_id and b.deleted_at is null) then
  raise exception 'branch_scope_mismatch';
 end if;
 if tg_table_name='privacy_requests' then
  if not exists(select 1 from public.customers c where c.id=new.customer_id and c.organization_id=new.organization_id) then
   raise exception 'customer_scope_mismatch';
  end if;
 end if;
 return new;
end;
$$;

commit;
