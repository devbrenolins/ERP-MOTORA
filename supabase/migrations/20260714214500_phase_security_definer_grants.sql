begin;

do $$
declare v_function regprocedure;
begin
  for v_function in
    select p.oid::regprocedure
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke all on function %s from public', v_function);
    execute format('revoke all on function %s from anon', v_function);
  end loop;
end;
$$;

grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.is_branch_member(uuid) to authenticated;
grant execute on function public.has_permission(uuid, uuid, text) to authenticated;
grant execute on function public.complete_onboarding(text, text, text, text, text, text) to authenticated;
grant execute on function public.convert_estimate_to_work_order(uuid) to authenticated;
grant execute on function public.post_stock_movement(uuid, uuid, text, numeric, numeric, text, uuid, text, text) to authenticated;
grant execute on function public.reserve_stock(uuid, uuid, uuid, numeric) to authenticated;
grant execute on function public.release_stock_reservation(uuid, text) to authenticated;
grant execute on function public.receive_purchase_order(uuid, text) to authenticated;
grant execute on function public.complete_stock_transfer(uuid) to authenticated;
grant execute on function public.complete_stock_count(uuid) to authenticated;

commit;
