begin;

-- RLS does not protect TRUNCATE, REFERENCES or TRIGGER. Application roles never need them.
do $$ declare v_table regclass; begin
 for v_table in select c.oid::regclass from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') loop
  execute format('revoke truncate,references,trigger on table %s from anon,authenticated',v_table);
 end loop;
end $$;

create or replace function public.validate_application_setting()
returns trigger language plpgsql as $$
declare v_number numeric;
begin
 if new.key='allow_negative_stock' and jsonb_typeof(new.value->'value')<>'boolean' then raise exception 'invalid_allow_negative_stock'; end if;
 if new.key='stock_issue_event' and coalesce(new.value->>'value','') not in ('work_order_start','work_order_finish','delivery') then raise exception 'invalid_stock_issue_event'; end if;
 if new.key in ('default_warranty_days','portal_token_hours','high_discount_limit') then
  begin v_number:=(new.value->>'value')::numeric; exception when others then raise exception 'invalid_numeric_setting'; end;
  if new.key='default_warranty_days' and (v_number<0 or v_number>3650 or trunc(v_number)<>v_number) then raise exception 'invalid_default_warranty_days'; end if;
  if new.key='portal_token_hours' and (v_number<1 or v_number>720 or trunc(v_number)<>v_number) then raise exception 'invalid_portal_token_hours'; end if;
  if new.key='high_discount_limit' and (v_number<0 or v_number>100) then raise exception 'invalid_high_discount_limit'; end if;
 end if;
 return new;
end;
$$;
create trigger application_settings_validate before insert or update on public.application_settings for each row execute function public.validate_application_setting();

create or replace function public.post_stock_movement(
  p_product_id uuid,p_warehouse_id uuid,p_movement_type text,p_quantity numeric,
  p_unit_cost numeric default null,p_reference_type text default null,p_reference_id uuid default null,
  p_notes text default null,p_idempotency_key text default null
)
returns uuid security definer set search_path=public set row_security=off language plpgsql as $$
declare
 v_product public.products%rowtype;v_warehouse public.warehouses%rowtype;v_balance public.stock_balances%rowtype;
 v_direction smallint;v_after numeric(14,3);v_average numeric(14,4);v_allow_negative boolean:=false;v_id uuid;
begin
 if auth.uid() is null then raise exception 'authentication_required'; end if;
 if p_quantity is null or p_quantity<=0 then raise exception 'quantity_must_be_positive'; end if;
 select * into v_product from public.products where id=p_product_id and deleted_at is null;
 select * into v_warehouse from public.warehouses where id=p_warehouse_id and deleted_at is null;
 if v_product.id is null or v_warehouse.id is null or v_product.organization_id<>v_warehouse.organization_id or v_product.branch_id<>v_warehouse.branch_id then raise exception 'invalid_product_or_warehouse'; end if;
 if not public.has_permission(v_product.organization_id,v_warehouse.branch_id,'inventory.move') then raise exception 'permission_denied'; end if;
 v_direction:=case when p_movement_type in ('purchase_receipt','customer_return','adjustment_in','transfer_in','inventory_in') then 1 when p_movement_type in ('work_order_consumption','supplier_return','adjustment_out','loss','damage','transfer_out','inventory_out') then -1 else 0 end;
 if v_direction=0 then raise exception 'invalid_movement_type'; end if;
 if p_idempotency_key is not null then select id into v_id from public.stock_movements where organization_id=v_product.organization_id and idempotency_key=p_idempotency_key;if v_id is not null then return v_id;end if;end if;
 insert into public.stock_balances(organization_id,branch_id,warehouse_id,product_id) values(v_product.organization_id,v_warehouse.branch_id,p_warehouse_id,p_product_id) on conflict do nothing;
 select * into v_balance from public.stock_balances where warehouse_id=p_warehouse_id and product_id=p_product_id for update;
 v_after:=v_balance.on_hand+(p_quantity*v_direction);
 select coalesce((coalesce(value->>'value',value->>'enabled'))::boolean,false) into v_allow_negative from public.application_settings
  where organization_id=v_product.organization_id and key='allow_negative_stock' and (branch_id=v_warehouse.branch_id or branch_id is null)
  order by (branch_id=v_warehouse.branch_id) desc limit 1;
 if v_after<0 and not(coalesce(v_allow_negative,false) and public.has_permission(v_product.organization_id,v_warehouse.branch_id,'inventory.allow_negative')) then raise exception 'insufficient_stock';end if;
 v_average:=v_balance.average_cost;
 if v_direction=1 and p_unit_cost is not null and v_after>0 then v_average:=round(greatest(0,((greatest(v_balance.on_hand,0)*v_balance.average_cost)+(p_quantity*p_unit_cost))/v_after),4);end if;
 update public.stock_balances set on_hand=v_after,average_cost=v_average,updated_at=now() where warehouse_id=p_warehouse_id and product_id=p_product_id;
 insert into public.stock_movements(organization_id,branch_id,warehouse_id,product_id,movement_type,direction,quantity,unit_cost,balance_before,balance_after,reference_type,reference_id,notes,idempotency_key,created_by)
 values(v_product.organization_id,v_warehouse.branch_id,p_warehouse_id,p_product_id,p_movement_type,v_direction,p_quantity,p_unit_cost,v_balance.on_hand,v_after,p_reference_type,p_reference_id,p_notes,p_idempotency_key,auth.uid()) returning id into v_id;
 return v_id;
end;
$$;

create or replace function public.apply_default_warranty_days()
returns trigger security definer set search_path=public set row_security=off language plpgsql as $$
declare v_order public.work_orders%rowtype;v_days integer;
begin
 if new.warranty_days is not null then return new;end if;
 select * into v_order from public.work_orders where id=new.work_order_id;
 select (value->>'value')::integer into v_days from public.application_settings where organization_id=v_order.organization_id and key='default_warranty_days' and (branch_id=v_order.branch_id or branch_id is null) order by (branch_id=v_order.branch_id) desc limit 1;
 new.warranty_days:=coalesce(v_days,90);return new;
end;
$$;
create trigger work_order_items_default_warranty before insert on public.work_order_items for each row execute function public.apply_default_warranty_days();

create or replace function public.enforce_high_discount_reason()
returns trigger security definer set search_path=public set row_security=off language plpgsql as $$
declare v_limit numeric:=10;v_base numeric;v_reason text;
begin
 select (value->>'value')::numeric into v_limit from public.application_settings where organization_id=new.organization_id and key='high_discount_limit' and (branch_id=new.branch_id or branch_id is null) order by (branch_id=new.branch_id) desc limit 1;
 v_limit:=coalesce(v_limit,10);v_base:=coalesce(new.parts_subtotal,0)+coalesce(new.services_subtotal,0);
 v_reason:=case when tg_table_name='estimates' then to_jsonb(new)->>'notes' else to_jsonb(new)->>'internal_notes' end;
 if v_base>0 and new.discount_total*100/v_base>=v_limit and char_length(trim(coalesce(v_reason,'')))<10 then raise exception 'high_discount_reason_required';end if;
 return new;
end;
$$;
create trigger estimates_discount_reason before insert or update on public.estimates for each row when(new.status not in ('draft','diagnosis')) execute function public.enforce_high_discount_reason();
create trigger work_orders_discount_reason before insert or update on public.work_orders for each row when(new.status in ('ready','delivered')) execute function public.enforce_high_discount_reason();

create or replace function public.consume_work_order_reservations()
returns trigger security definer set search_path=public set row_security=off language plpgsql as $$
declare v_event text:='work_order_finish';v_should_consume boolean:=false;v_res record;v_before numeric;
begin
 if new.status is not distinct from old.status then return new;end if;
 if new.status='cancelled' then
  for v_res in select * from public.stock_reservations where work_order_id=new.id and status='active' for update loop
   update public.stock_balances set reserved=greatest(0,reserved-v_res.quantity),updated_at=now() where warehouse_id=v_res.warehouse_id and product_id=v_res.product_id;
   update public.stock_reservations set status='cancelled',released_at=now(),updated_by=auth.uid() where id=v_res.id;
  end loop;
  return new;
 end if;
 select value->>'value' into v_event from public.application_settings where organization_id=new.organization_id and key='stock_issue_event' and (branch_id=new.branch_id or branch_id is null) order by (branch_id=new.branch_id) desc limit 1;
 v_event:=coalesce(v_event,'work_order_finish');
 v_should_consume:=(v_event='work_order_start' and new.status='in_progress') or (v_event='work_order_finish' and new.status='ready') or (v_event='delivery' and new.status='delivered');
 if not v_should_consume then return new;end if;
 for v_res in select * from public.stock_reservations where work_order_id=new.id and status='active' for update loop
  select on_hand into v_before from public.stock_balances where warehouse_id=v_res.warehouse_id and product_id=v_res.product_id for update;
  if v_before<v_res.quantity then raise exception 'insufficient_reserved_stock';end if;
  update public.stock_balances set on_hand=on_hand-v_res.quantity,reserved=greatest(0,reserved-v_res.quantity),updated_at=now() where warehouse_id=v_res.warehouse_id and product_id=v_res.product_id;
  insert into public.stock_movements(organization_id,branch_id,warehouse_id,product_id,movement_type,direction,quantity,balance_before,balance_after,reference_type,reference_id,notes,idempotency_key,created_by)
  values(new.organization_id,new.branch_id,v_res.warehouse_id,v_res.product_id,'work_order_consumption',-1,v_res.quantity,v_before,v_before-v_res.quantity,'work_order',new.id,'Baixa automática da reserva','wo-consume:'||v_res.id,auth.uid());
  update public.stock_reservations set status='consumed',released_at=now(),updated_by=auth.uid() where id=v_res.id;
 end loop;
 return new;
end;
$$;
create trigger work_orders_consume_reservations after update on public.work_orders for each row execute function public.consume_work_order_reservations();

create or replace function public.anonymize_customer(p_customer_id uuid,p_reason text)
returns void security definer set search_path=public set row_security=off language plpgsql as $$
declare v_customer public.customers%rowtype;
begin
 select * into v_customer from public.customers where id=p_customer_id and deleted_at is null for update;
 if v_customer.id is null or not public.has_permission(v_customer.organization_id,v_customer.primary_branch_id,'privacy.anonymize') then raise exception 'permission_denied';end if;
 if char_length(trim(coalesce(p_reason,'')))<10 then raise exception 'reason_required';end if;
 if exists(select 1 from public.work_orders w where w.customer_id=p_customer_id and w.status not in ('delivered','cancelled') and w.deleted_at is null) then raise exception 'customer_has_active_work_orders';end if;
 if exists(select 1 from public.receivables r where r.customer_id=p_customer_id and r.status in ('open','overdue','partial') and r.outstanding_amount>0 and r.deleted_at is null) then raise exception 'customer_has_open_receivables';end if;
 update public.customers set name='Cliente anonimizado '||left(id::text,8),trade_name=null,tax_id=null,state_registration=null,birth_date=null,primary_phone=null,whatsapp=null,primary_email=null,source=null,notes=null,communication_consent=false,consent_at=null,updated_by=auth.uid() where id=p_customer_id;
 update public.customer_contacts set label=null,value='anonimizado',deleted_at=coalesce(deleted_at,now()) where customer_id=p_customer_id;
 update public.customer_addresses set postal_code=null,street='Anonimizado',number=null,complement=null,district=null,city='Anonimizado',state='NA',deleted_at=coalesce(deleted_at,now()) where customer_id=p_customer_id;
 update public.vehicles set license_plate='ANON'||upper(left(id::text,8)),chassis=null,renavam=null,fleet_code=null,insurer=null,notes=null,updated_by=auth.uid() where customer_id=p_customer_id and deleted_at is null;
 update public.audit_logs set old_data=null,new_data=jsonb_build_object('anonymized',true) where organization_id=v_customer.organization_id and ((entity_table='customers' and entity_id=p_customer_id::text) or (entity_table='vehicles' and entity_id in(select id::text from public.vehicles where customer_id=p_customer_id)));
 insert into public.privacy_requests(organization_id,branch_id,customer_id,request_type,status,reason,requested_by,completed_at) values(v_customer.organization_id,v_customer.primary_branch_id,p_customer_id,'anonymization','completed',trim(p_reason),auth.uid(),now());
end;
$$;

revoke all on function public.validate_application_setting() from public,anon,authenticated;
revoke all on function public.apply_default_warranty_days() from public,anon,authenticated;
revoke all on function public.enforce_high_discount_reason() from public,anon,authenticated;
revoke all on function public.consume_work_order_reservations() from public,anon,authenticated;
revoke all on function public.post_stock_movement(uuid,uuid,text,numeric,numeric,text,uuid,text,text) from public,anon;
revoke all on function public.anonymize_customer(uuid,text) from public,anon;
grant execute on function public.post_stock_movement(uuid,uuid,text,numeric,numeric,text,uuid,text,text) to authenticated;
grant execute on function public.anonymize_customer(uuid,text) to authenticated;

commit;
