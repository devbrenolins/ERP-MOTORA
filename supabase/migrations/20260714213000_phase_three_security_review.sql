begin;

revoke all on public.product_categories, public.products, public.product_equivalents, public.product_vehicle_applications,
  public.warehouses, public.stock_balances, public.stock_movements, public.stock_reservations, public.suppliers, public.supplier_products,
  public.purchase_requests, public.purchase_request_items, public.purchase_quotes, public.purchase_quote_items, public.purchase_orders,
  public.purchase_order_items, public.purchase_receipts, public.purchase_receipt_items, public.stock_transfers, public.stock_transfer_items,
  public.stock_counts, public.stock_count_items from anon;
revoke all on public.inventory_position from anon;

revoke insert, update, delete on public.stock_balances, public.stock_movements, public.stock_reservations,
  public.purchase_receipts, public.purchase_receipt_items from authenticated;
grant select on public.stock_balances, public.stock_movements, public.stock_reservations,
  public.purchase_receipts, public.purchase_receipt_items, public.inventory_position to authenticated;

drop policy if exists stock_reservations_update on public.stock_reservations;

revoke all on function public.reserve_stock(uuid, uuid, uuid, numeric) from public;
revoke all on function public.release_stock_reservation(uuid, text) from public;
revoke all on function public.receive_purchase_order(uuid, text) from public;
revoke all on function public.complete_stock_transfer(uuid) from public;
revoke all on function public.complete_stock_count(uuid) from public;
grant execute on function public.reserve_stock(uuid, uuid, uuid, numeric) to authenticated;
grant execute on function public.release_stock_reservation(uuid, text) to authenticated;
grant execute on function public.receive_purchase_order(uuid, text) to authenticated;
grant execute on function public.complete_stock_transfer(uuid) to authenticated;
grant execute on function public.complete_stock_count(uuid) to authenticated;

create or replace function public.guard_stock_balance_integrity()
returns trigger language plpgsql as $$
begin
  if new.on_hand < new.reserved then raise exception 'stock_is_reserved'; end if;
  if new.reserved < 0 then raise exception 'invalid_reserved_stock'; end if;
  return new;
end;
$$;
create trigger stock_balances_guard before insert or update on public.stock_balances for each row execute function public.guard_stock_balance_integrity();

create or replace function public.enforce_purchase_order_status()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status and new.status = 'approved' then
    if not public.has_permission(new.organization_id, new.branch_id, 'purchases.approve') then raise exception 'approval_permission_required'; end if;
    new.approved_by := auth.uid(); new.approved_at := coalesce(new.approved_at, now());
  end if;
  if new.status is distinct from old.status and new.status = 'received'
    and not exists (select 1 from public.purchase_receipts where purchase_order_id = new.id) then
    raise exception 'receive_through_transaction_required';
  end if;
  return new;
end;
$$;
create trigger purchase_orders_enforce_status before update on public.purchase_orders for each row execute function public.enforce_purchase_order_status();

create or replace function public.enforce_stock_workflow_completion()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status and new.status = 'completed' and new.completed_at is null then
    raise exception 'complete_through_transaction_required';
  end if;
  return new;
end;
$$;
create trigger stock_transfers_enforce_completion before update on public.stock_transfers for each row execute function public.enforce_stock_workflow_completion();
create trigger stock_counts_enforce_completion before update on public.stock_counts for each row execute function public.enforce_stock_workflow_completion();

commit;
