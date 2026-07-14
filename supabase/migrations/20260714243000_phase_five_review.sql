begin;

create or replace function public.validate_phase_five_scope()
returns trigger security definer set search_path=public set row_security=off language plpgsql as $$
begin
 if tg_table_name='customer_segment_members' then
  if not exists(select 1 from public.customer_segments s where s.id=new.segment_id and s.organization_id=new.organization_id and s.deleted_at is null) then raise exception 'segment_scope_mismatch'; end if;
  if not exists(select 1 from public.customers c where c.id=new.customer_id and c.organization_id=new.organization_id and c.deleted_at is null) then raise exception 'customer_scope_mismatch'; end if;
  return new;
 end if;
 if tg_table_name='customer_segments' then return new; end if;
 if new.branch_id is not null and not exists(select 1 from public.branches b where b.id=new.branch_id and b.organization_id=new.organization_id and b.deleted_at is null) then raise exception 'branch_scope_mismatch'; end if;
 if tg_table_name='warranties' then
  if not exists(select 1 from public.customers c where c.id=new.customer_id and c.organization_id=new.organization_id and c.deleted_at is null) then raise exception 'customer_scope_mismatch'; end if;
  if not exists(select 1 from public.vehicles v where v.id=new.vehicle_id and v.organization_id=new.organization_id and v.branch_id=new.branch_id and v.customer_id=new.customer_id and v.deleted_at is null) then raise exception 'vehicle_scope_mismatch'; end if;
  if new.work_order_id is not null and not exists(select 1 from public.work_orders w where w.id=new.work_order_id and w.organization_id=new.organization_id and w.branch_id=new.branch_id and w.customer_id=new.customer_id and w.vehicle_id=new.vehicle_id and w.deleted_at is null) then raise exception 'work_order_scope_mismatch'; end if;
  if new.work_order_item_id is not null and not exists(select 1 from public.work_order_items i join public.work_orders w on w.id=i.work_order_id where i.id=new.work_order_item_id and i.organization_id=new.organization_id and w.branch_id=new.branch_id and w.customer_id=new.customer_id and w.vehicle_id=new.vehicle_id) then raise exception 'work_order_item_scope_mismatch'; end if;
 elsif tg_table_name='warranty_claims' then
  if not exists(select 1 from public.warranties g where g.id=new.warranty_id and g.organization_id=new.organization_id and g.branch_id=new.branch_id and g.customer_id=new.customer_id and g.vehicle_id=new.vehicle_id and g.deleted_at is null) then raise exception 'warranty_scope_mismatch'; end if;
  if new.original_work_order_id is not null and not exists(select 1 from public.work_orders w where w.id=new.original_work_order_id and w.organization_id=new.organization_id and w.branch_id=new.branch_id and w.customer_id=new.customer_id and w.vehicle_id=new.vehicle_id and w.deleted_at is null) then raise exception 'original_order_scope_mismatch'; end if;
  if new.return_work_order_id is not null and not exists(select 1 from public.work_orders w where w.id=new.return_work_order_id and w.organization_id=new.organization_id and w.branch_id=new.branch_id and w.warranty_claim_id=new.id and w.deleted_at is null) then raise exception 'return_order_scope_mismatch'; end if;
 elsif tg_table_name='fleet_contracts' then
  if not exists(select 1 from public.customers c where c.id=new.customer_id and c.organization_id=new.organization_id and c.customer_type='company' and c.deleted_at is null) then raise exception 'fleet_customer_scope_mismatch'; end if;
 elsif tg_table_name='fleet_drivers' then
  if not exists(select 1 from public.fleet_contracts f where f.id=new.contract_id and f.organization_id=new.organization_id and f.branch_id=new.branch_id and f.deleted_at is null) then raise exception 'fleet_contract_scope_mismatch'; end if;
 elsif tg_table_name='fleet_vehicles' then
  if not exists(select 1 from public.fleet_contracts f where f.id=new.contract_id and f.organization_id=new.organization_id and f.branch_id=new.branch_id and f.deleted_at is null) then raise exception 'fleet_contract_scope_mismatch'; end if;
  if not exists(select 1 from public.vehicles v where v.id=new.vehicle_id and v.organization_id=new.organization_id and v.branch_id=new.branch_id and v.deleted_at is null) then raise exception 'fleet_vehicle_scope_mismatch'; end if;
  if new.default_driver_id is not null and not exists(select 1 from public.fleet_drivers d where d.id=new.default_driver_id and d.contract_id=new.contract_id and d.deleted_at is null) then raise exception 'fleet_driver_scope_mismatch'; end if;
  if new.cost_center_id is not null and not exists(select 1 from public.cost_centers c where c.id=new.cost_center_id and c.organization_id=new.organization_id and c.branch_id=new.branch_id and c.deleted_at is null) then raise exception 'cost_center_scope_mismatch'; end if;
 elsif tg_table_name='message_templates' then
  null;
 elsif tg_table_name='automation_rules' then
  if new.template_id is not null and not exists(select 1 from public.message_templates t where t.id=new.template_id and t.organization_id=new.organization_id and (t.branch_id is null or t.branch_id=new.branch_id) and t.deleted_at is null and t.active) then raise exception 'template_scope_mismatch'; end if;
 elsif tg_table_name='automation_jobs' then
  if not exists(select 1 from public.automation_rules r where r.id=new.rule_id and r.organization_id=new.organization_id and r.branch_id=new.branch_id and r.deleted_at is null) then raise exception 'automation_rule_scope_mismatch'; end if;
  if not exists(select 1 from public.customers c where c.id=new.customer_id and c.organization_id=new.organization_id and c.deleted_at is null) then raise exception 'customer_scope_mismatch'; end if;
  if new.vehicle_id is not null and not exists(select 1 from public.vehicles v where v.id=new.vehicle_id and v.organization_id=new.organization_id and v.branch_id=new.branch_id and v.customer_id=new.customer_id and v.deleted_at is null) then raise exception 'vehicle_scope_mismatch'; end if;
  if new.warranty_id is not null and not exists(select 1 from public.warranties g where g.id=new.warranty_id and g.organization_id=new.organization_id and g.branch_id=new.branch_id and g.customer_id=new.customer_id and g.deleted_at is null) then raise exception 'warranty_scope_mismatch'; end if;
 elsif tg_table_name='customer_feedback' then
  if not exists(select 1 from public.customers c where c.id=new.customer_id and c.organization_id=new.organization_id and c.deleted_at is null) then raise exception 'customer_scope_mismatch'; end if;
  if new.work_order_id is not null and not exists(select 1 from public.work_orders w where w.id=new.work_order_id and w.organization_id=new.organization_id and w.branch_id=new.branch_id and w.customer_id=new.customer_id and w.deleted_at is null) then raise exception 'work_order_scope_mismatch'; end if;
 elsif tg_table_name='portal_access_tokens' then
  if not exists(select 1 from public.customers c where c.id=new.customer_id and c.organization_id=new.organization_id and c.deleted_at is null) then raise exception 'customer_scope_mismatch'; end if;
  if new.work_order_id is not null and not exists(select 1 from public.work_orders w where w.id=new.work_order_id and w.organization_id=new.organization_id and w.branch_id=new.branch_id and w.customer_id=new.customer_id and w.deleted_at is null) then raise exception 'work_order_scope_mismatch'; end if;
 elsif tg_table_name='integration_connections' then
  null;
 elsif tg_table_name='integration_events' and new.connection_id is not null then
  if not exists(select 1 from public.integration_connections c where c.id=new.connection_id and c.organization_id=new.organization_id and (c.branch_id is null or c.branch_id=new.branch_id) and c.deleted_at is null) then raise exception 'integration_scope_mismatch'; end if;
 end if;
 return new;
end;
$$;

do $$ declare v_table text; begin
 foreach v_table in array array['customer_segments','customer_segment_members','warranties','warranty_claims','fleet_contracts','fleet_drivers','fleet_vehicles','message_templates','automation_rules','automation_jobs','customer_feedback','portal_access_tokens','integration_connections','integration_events'] loop
  execute format('create trigger %I_validate_scope before insert or update on public.%I for each row execute function public.validate_phase_five_scope()',v_table,v_table);
 end loop;
end $$;

create or replace function public.guard_warranty_claim_status()
returns trigger language plpgsql as $$
begin
 if tg_op='INSERT' then
  if new.status<>'requested' then raise exception 'claim_must_start_requested'; end if;
 else
  if new.status is distinct from old.status then
   if new.status in ('approved','rejected') and current_setting('app.warranty_approval',true)<>'on' then raise exception 'approval_function_required'; end if;
   if new.status='in_progress' and old.status<>'approved' then raise exception 'claim_must_be_approved'; end if;
   if new.status='completed' and old.status<>'in_progress' then raise exception 'claim_must_be_in_progress'; end if;
   if old.status in ('completed','rejected','cancelled') then raise exception 'terminal_claim_is_locked'; end if;
  end if;
 end if;
 return new;
end;
$$;
drop trigger warranty_claims_guard_status on public.warranty_claims;
create trigger warranty_claims_guard_status before insert or update on public.warranty_claims for each row execute function public.guard_warranty_claim_status();

create or replace function public.approve_warranty_claim(p_claim_id uuid,p_approved boolean,p_opinion text default null)
returns uuid security definer set search_path=public set row_security=off language plpgsql as $$
declare v_claim public.warranty_claims%rowtype; v_warranty public.warranties%rowtype; v_order uuid; v_mileage integer;
begin
 select * into v_claim from public.warranty_claims where id=p_claim_id and deleted_at is null for update;
 if v_claim.id is null or v_claim.status not in ('requested','analysis') then raise exception 'invalid_claim_status'; end if;
 if not public.has_permission(v_claim.organization_id,v_claim.branch_id,'warranties.approve') then raise exception 'permission_denied'; end if;
 select * into v_warranty from public.warranties where id=v_claim.warranty_id and deleted_at is null for update;
 select mileage into v_mileage from public.vehicles where id=v_claim.vehicle_id;
 if v_warranty.id is null or v_warranty.status not in ('active','claimed') or v_warranty.expires_at<current_date or (v_warranty.mileage_limit is not null and v_mileage>v_warranty.mileage_limit) then raise exception 'warranty_not_eligible'; end if;
 perform set_config('app.warranty_approval','on',true);
 if p_approved then
  insert into public.work_orders(organization_id,branch_id,number,customer_id,vehicle_id,status,priority,customer_complaint,diagnosis,internal_notes,total,warranty_claim_id,created_by,updated_by)
  values(v_claim.organization_id,v_claim.branch_id,'',v_claim.customer_id,v_claim.vehicle_id,'awaiting_triage','high','Retorno em garantia: '||v_claim.reason,v_claim.diagnosis,p_opinion,0,v_claim.id,auth.uid(),auth.uid()) returning id into v_order;
  update public.warranty_claims set status='approved',return_work_order_id=v_order,approved_by=auth.uid(),approved_at=now(),technical_opinion=p_opinion,updated_by=auth.uid() where id=v_claim.id;
  update public.warranties set status='claimed',updated_by=auth.uid() where id=v_claim.warranty_id;
 else
  update public.warranty_claims set status='rejected',approved_by=auth.uid(),approved_at=now(),technical_opinion=p_opinion,updated_by=auth.uid() where id=v_claim.id;
 end if;
 return v_order;
end;
$$;

revoke update on public.portal_access_tokens from authenticated;
grant update(revoked_at) on public.portal_access_tokens to authenticated;
revoke insert,update on public.integration_connections from authenticated;
grant insert(organization_id,branch_id,provider,name,status,endpoint_url,settings,created_by,updated_by) on public.integration_connections to authenticated;
grant update(provider,name,status,endpoint_url,settings,updated_by,deleted_at) on public.integration_connections to authenticated;

do $$ declare v_function regprocedure; begin
 for v_function in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef loop
  execute format('revoke all on function %s from public',v_function);
  execute format('revoke all on function %s from anon',v_function);
 end loop;
end $$;
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
grant execute on function public.approve_warranty_claim(uuid,boolean,text) to authenticated;
grant execute on function public.create_portal_access(uuid,uuid,integer) to authenticated;
grant execute on function public.run_automation_cycle(uuid) to authenticated;
grant execute on function public.get_customer_portal(text) to anon,authenticated;
grant execute on function public.portal_respond_estimate(text,uuid,text,text) to anon,authenticated;
grant execute on function public.portal_submit_rating(text,uuid,smallint,text) to anon,authenticated;

revoke all on function public.validate_phase_five_scope() from public,anon,authenticated;
revoke all on function public.guard_warranty_claim_status() from public,anon,authenticated;

commit;
