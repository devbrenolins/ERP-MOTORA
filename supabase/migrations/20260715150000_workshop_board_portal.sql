begin;

-- =============================================================================
-- Painel da oficina (quadro estilo planilha) + Portal do cliente ampliado
-- Timeline permanente, fotos, anexos, notificações por status e acesso por
-- CPF + placa ou código do atendimento.
-- =============================================================================

-- Rótulos em português para os status de OS (usados na timeline e nas mensagens).
create or replace function public.work_order_status_label(p_status text)
returns text immutable language sql as $$
  select case p_status
    when 'awaiting_triage' then 'Aguardando triagem'
    when 'diagnosis' then 'Em diagnóstico'
    when 'awaiting_estimate' then 'Aguardando orçamento'
    when 'awaiting_approval' then 'Aguardando aprovação'
    when 'awaiting_parts' then 'Aguardando peças'
    when 'queued' then 'Na fila'
    when 'in_progress' then 'Em manutenção'
    when 'paused' then 'Serviço pausado'
    when 'outsourced' then 'Serviço terceirizado'
    when 'testing' then 'Em teste'
    when 'washing' then 'Em lavagem'
    when 'awaiting_payment' then 'Aguardando pagamento'
    when 'ready' then 'Pronto para retirada'
    when 'delivered' then 'Entregue'
    when 'cancelled' then 'Cancelado'
    else coalesce(p_status, '—')
  end;
$$;

-- Timeline permanente da ordem de serviço (nunca sofre update/delete).
create table public.work_order_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  event_type text not null check (event_type in ('received', 'status_change', 'note', 'photo', 'attachment', 'customer_notified', 'warranty', 'custom')),
  description text not null check (char_length(trim(description)) >= 2),
  metadata jsonb not null default '{}'::jsonb,
  visible_to_customer boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index work_order_events_order_idx on public.work_order_events (work_order_id, created_at desc);
create index work_order_events_scope_idx on public.work_order_events (organization_id, created_at desc);

-- Fotos do veículo por etapa (entrada, antes, durante, depois, entrega).
create table public.work_order_photos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  stage text not null default 'intake' check (stage in ('intake', 'before', 'during', 'after', 'delivery')),
  storage_path text not null,
  caption text,
  visible_to_customer boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  deleted_at timestamptz
);
create index work_order_photos_order_idx on public.work_order_photos (work_order_id, created_at desc) where deleted_at is null;

-- Arquivos anexados (PDF da OS, nota fiscal, laudos e documentos).
create table public.work_order_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  kind text not null default 'document' check (kind in ('service_order_pdf', 'invoice_pdf', 'estimate_pdf', 'document', 'image', 'other')),
  file_name text not null,
  storage_path text not null,
  mime_type text,
  visible_to_customer boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  deleted_at timestamptz
);
create index work_order_attachments_order_idx on public.work_order_attachments (work_order_id, created_at desc) where deleted_at is null;

-- Preferências de notificação automática por filial (o administrador escolhe os canais).
create table public.notification_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  branch_id uuid not null references public.branches(id),
  whatsapp_enabled boolean not null default false,
  sms_enabled boolean not null default false,
  email_enabled boolean not null default false,
  notify_statuses text[] not null default array['awaiting_approval', 'awaiting_parts', 'in_progress', 'ready', 'delivered'],
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  unique (organization_id, branch_id)
);

-- Fila de envio para o cliente (estrutura pronta para WhatsApp, SMS e e-mail).
create table public.customer_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  branch_id uuid not null references public.branches(id),
  work_order_id uuid references public.work_orders(id) on delete set null,
  customer_id uuid not null references public.customers(id),
  channel text not null check (channel in ('whatsapp', 'sms', 'email')),
  recipient text not null,
  subject text,
  message text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'cancelled')),
  error text,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index customer_notifications_queue_idx on public.customer_notifications (organization_id, branch_id, status, scheduled_at);
create index customer_notifications_order_idx on public.customer_notifications (work_order_id, created_at desc);

-- Validação de escopo (mesma organização) para as novas tabelas.
create or replace function public.validate_workshop_scope()
returns trigger security definer set search_path = public set row_security = off language plpgsql as $$
begin
  if not exists (select 1 from public.work_orders w where w.id = new.work_order_id and w.organization_id = new.organization_id) then
    raise exception 'work_order_scope_mismatch';
  end if;
  return new;
end;
$$;
create trigger work_order_events_validate_scope before insert on public.work_order_events for each row execute function public.validate_workshop_scope();
create trigger work_order_photos_validate_scope before insert or update on public.work_order_photos for each row execute function public.validate_workshop_scope();
create trigger work_order_attachments_validate_scope before insert or update on public.work_order_attachments for each row execute function public.validate_workshop_scope();

create or replace function public.validate_notification_scope()
returns trigger security definer set search_path = public set row_security = off language plpgsql as $$
begin
  if not exists (select 1 from public.branches b where b.id = new.branch_id and b.organization_id = new.organization_id and b.deleted_at is null) then
    raise exception 'branch_scope_mismatch';
  end if;
  if tg_table_name = 'customer_notifications' and not exists (select 1 from public.customers c where c.id = new.customer_id and c.organization_id = new.organization_id) then
    raise exception 'customer_scope_mismatch';
  end if;
  return new;
end;
$$;
create trigger notification_settings_validate_scope before insert or update on public.notification_settings for each row execute function public.validate_notification_scope();
create trigger customer_notifications_validate_scope before insert or update on public.customer_notifications for each row execute function public.validate_notification_scope();

create trigger notification_settings_set_updated_at before update on public.notification_settings for each row execute function public.set_updated_at();

-- Timeline automática + fila de notificações a cada mudança de status.
create or replace function public.log_work_order_activity()
returns trigger security definer set search_path = public set row_security = off language plpgsql as $$
declare
  v_settings public.notification_settings%rowtype;
  v_customer public.customers%rowtype;
  v_plate text;
  v_label text;
  v_message text;
begin
  if tg_op = 'INSERT' then
    insert into public.work_order_events (organization_id, work_order_id, event_type, description, metadata, visible_to_customer, created_by)
    values (new.organization_id, new.id, 'received', 'Veículo recebido na oficina', jsonb_build_object('status', new.status), true, coalesce(auth.uid(), new.created_by));
    return new;
  end if;

  if new.status is distinct from old.status then
    v_label := public.work_order_status_label(new.status);
    insert into public.work_order_events (organization_id, work_order_id, event_type, description, metadata, visible_to_customer, created_by)
    values (new.organization_id, new.id, 'status_change', v_label, jsonb_build_object('from', old.status, 'to', new.status), true, auth.uid());

    select * into v_settings from public.notification_settings
    where organization_id = new.organization_id and branch_id = new.branch_id;
    if v_settings.id is not null and new.status = any (v_settings.notify_statuses) then
      select * into v_customer from public.customers where id = new.customer_id;
      select license_plate into v_plate from public.vehicles where id = new.vehicle_id;
      v_message := 'Olá ' || coalesce(v_customer.name, 'cliente') || '! Atualização do veículo ' || coalesce(v_plate, '') || ' (OS ' || new.number || '): ' || v_label || '.';
      if v_settings.whatsapp_enabled and coalesce(v_customer.whatsapp, v_customer.primary_phone) is not null then
        insert into public.customer_notifications (organization_id, branch_id, work_order_id, customer_id, channel, recipient, subject, message)
        values (new.organization_id, new.branch_id, new.id, new.customer_id, 'whatsapp', coalesce(v_customer.whatsapp, v_customer.primary_phone), 'Atualização da OS ' || new.number, v_message);
      end if;
      if v_settings.sms_enabled and v_customer.primary_phone is not null then
        insert into public.customer_notifications (organization_id, branch_id, work_order_id, customer_id, channel, recipient, subject, message)
        values (new.organization_id, new.branch_id, new.id, new.customer_id, 'sms', v_customer.primary_phone, 'Atualização da OS ' || new.number, v_message);
      end if;
      if v_settings.email_enabled and v_customer.primary_email is not null then
        insert into public.customer_notifications (organization_id, branch_id, work_order_id, customer_id, channel, recipient, subject, message)
        values (new.organization_id, new.branch_id, new.id, new.customer_id, 'email', v_customer.primary_email, 'Atualização da OS ' || new.number, v_message);
      end if;
      insert into public.work_order_events (organization_id, work_order_id, event_type, description, metadata, visible_to_customer, created_by)
      values (new.organization_id, new.id, 'customer_notified', 'Cliente avisado sobre: ' || v_label, jsonb_build_object('status', new.status), false, auth.uid());
    end if;
  end if;
  return new;
end;
$$;
create trigger work_orders_log_insert after insert on public.work_orders for each row execute function public.log_work_order_activity();
create trigger work_orders_log_status after update of status on public.work_orders for each row execute function public.log_work_order_activity();

-- Indicadores do painel (respeita RLS das ordens de serviço).
create view public.workshop_board_metrics with (security_invoker = true) as
select
  w.organization_id,
  w.branch_id,
  count(*) filter (where w.status not in ('delivered', 'cancelled')) as vehicles_in_shop,
  count(*) filter (where w.status = 'awaiting_parts') as awaiting_parts,
  count(*) filter (where w.status in ('in_progress', 'paused', 'outsourced', 'testing', 'washing')) as in_maintenance,
  count(*) filter (where w.completed_at::date = current_date) as finished_today,
  count(*) filter (where w.status = 'delivered' and w.delivered_at::date = current_date) as delivered_today,
  count(*) filter (where w.due_at < now() and w.status not in ('ready', 'delivered', 'cancelled')) as overdue,
  coalesce(sum(w.total) filter (where w.status not in ('delivered', 'cancelled')), 0) as open_value,
  coalesce(sum(w.total) filter (where w.status = 'delivered' and date_trunc('month', w.delivered_at) = date_trunc('month', now())), 0) as month_revenue
from public.work_orders w
where w.deleted_at is null
group by w.organization_id, w.branch_id;

-- Acesso do cliente por CPF/CNPJ + placa ou código do atendimento + placa.
create or replace function public.portal_login(p_tax_id text default null, p_license_plate text default null, p_order_number text default null)
returns text security definer set search_path = public, extensions set row_security = off language plpgsql as $$
declare
  v_plate text;
  v_tax text;
  v_vehicle public.vehicles%rowtype;
  v_order_id uuid;
  v_token text;
begin
  v_plate := upper(regexp_replace(coalesce(p_license_plate, ''), '[^A-Za-z0-9]', '', 'g'));
  v_tax := regexp_replace(coalesce(p_tax_id, ''), '\D', '', 'g');
  if length(v_plate) < 6 then raise exception 'invalid_credentials'; end if;
  if v_tax = '' and coalesce(trim(p_order_number), '') = '' then raise exception 'invalid_credentials'; end if;

  select v.* into v_vehicle from public.vehicles v
  join public.customers c on c.id = v.customer_id and c.deleted_at is null
  where upper(regexp_replace(v.license_plate, '[^A-Za-z0-9]', '', 'g')) = v_plate
    and v.deleted_at is null
    and (v_tax = '' or regexp_replace(coalesce(c.tax_id, ''), '\D', '', 'g') = v_tax)
  limit 1;
  if v_vehicle.id is null then raise exception 'invalid_credentials'; end if;

  if coalesce(trim(p_order_number), '') <> '' then
    select w.id into v_order_id from public.work_orders w
    where w.vehicle_id = v_vehicle.id and w.deleted_at is null
      and upper(trim(w.number)) = upper(trim(p_order_number));
    if v_order_id is null then raise exception 'invalid_credentials'; end if;
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.portal_access_tokens (organization_id, branch_id, customer_id, work_order_id, token_hash, expires_at)
  values (v_vehicle.organization_id, v_vehicle.branch_id, v_vehicle.customer_id, v_order_id, encode(digest(v_token, 'sha256'), 'hex'), now() + interval '24 hours');
  return v_token;
end;
$$;

-- Portal ampliado: timeline, fotos, anexos, itens, garantias e progresso.
create or replace function public.get_customer_portal(p_token text)
returns jsonb security definer set search_path = public, extensions set row_security = off language plpgsql as $$
declare v_access public.portal_access_tokens%rowtype; v_result jsonb;
begin
  if p_token is null or length(p_token) < 40 then raise exception 'invalid_token'; end if;
  select * into v_access from public.portal_access_tokens where token_hash = encode(digest(p_token, 'sha256'), 'hex') and revoked_at is null and expires_at > now() for update;
  if v_access.id is null then raise exception 'invalid_or_expired_token'; end if;
  update public.portal_access_tokens set last_used_at = now() where id = v_access.id;
  select jsonb_build_object(
    'customer', jsonb_build_object('name', c.name),
    'expires_at', v_access.expires_at,
    'vehicles', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'plate', v.license_plate, 'brand', v.brand, 'model', v.model, 'color', v.color, 'mileage', v.mileage)) from public.vehicles v where v.customer_id = c.id and v.deleted_at is null), '[]'::jsonb),
    'work_orders', coalesce((select jsonb_agg(jsonb_build_object(
      'id', w.id, 'number', w.number, 'status', w.status, 'status_label', public.work_order_status_label(w.status),
      'complaint', w.customer_complaint, 'diagnosis', w.diagnosis, 'customer_notes', w.customer_notes,
      'entry_at', w.entry_at, 'due_at', w.due_at, 'completed_at', w.completed_at, 'delivered_at', w.delivered_at,
      'parts_subtotal', w.parts_subtotal, 'services_subtotal', w.services_subtotal, 'discount_total', w.discount_total, 'total', w.total,
      'vehicle_id', w.vehicle_id,
      'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'type', i.item_type, 'description', i.description, 'quantity', i.quantity, 'total', i.total, 'warranty_days', i.warranty_days) order by i.created_at), '[]'::jsonb) from public.work_order_items i where i.work_order_id = w.id),
      'events', (select coalesce(jsonb_agg(jsonb_build_object('id', ev.id, 'type', ev.event_type, 'description', ev.description, 'created_at', ev.created_at) order by ev.created_at), '[]'::jsonb) from public.work_order_events ev where ev.work_order_id = w.id and ev.visible_to_customer),
      'photos', (select coalesce(jsonb_agg(jsonb_build_object('id', ph.id, 'stage', ph.stage, 'path', ph.storage_path, 'caption', ph.caption) order by ph.created_at), '[]'::jsonb) from public.work_order_photos ph where ph.work_order_id = w.id and ph.visible_to_customer and ph.deleted_at is null),
      'attachments', (select coalesce(jsonb_agg(jsonb_build_object('id', att.id, 'kind', att.kind, 'file_name', att.file_name, 'path', att.storage_path) order by att.created_at), '[]'::jsonb) from public.work_order_attachments att where att.work_order_id = w.id and att.visible_to_customer and att.deleted_at is null),
      'warranties', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'description', g.description, 'starts_at', g.starts_at, 'expires_at', g.expires_at, 'status', g.status)), '[]'::jsonb) from public.warranties g where g.work_order_id = w.id and g.deleted_at is null)
    ) order by w.entry_at desc) from public.work_orders w where w.customer_id = c.id and w.deleted_at is null and (v_access.work_order_id is null or w.id = v_access.work_order_id)), '[]'::jsonb),
    'estimates', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'number', e.number, 'status', e.status, 'valid_until', e.valid_until, 'total', e.total, 'approved_at', e.approved_at, 'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'description', i.description, 'quantity', i.quantity, 'total', i.total, 'approval_status', i.approval_status) order by i.sort_order), '[]'::jsonb) from public.estimate_items i where i.estimate_id = e.id))) from public.estimates e where e.customer_id = c.id and e.deleted_at is null and (v_access.work_order_id is null or exists (select 1 from public.work_orders w where w.id = v_access.work_order_id and w.estimate_id = e.id))), '[]'::jsonb),
    'warranties', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'description', g.description, 'type', g.warranty_type, 'starts_at', g.starts_at, 'expires_at', g.expires_at, 'status', g.status) order by g.expires_at desc) from public.warranties g where g.customer_id = c.id and g.deleted_at is null), '[]'::jsonb)
  ) into v_result from public.customers c where c.id = v_access.customer_id;
  return v_result;
end;
$$;

-- Diretório da equipe: nomes dos usuários da organização do solicitante,
-- usado no painel para exibir mecânico responsável e autores da timeline.
create or replace function public.get_team_directory(p_organization_id uuid)
returns table (user_id uuid, full_name text)
stable security definer set search_path = public set row_security = off language sql as $$
  select ou.user_id, coalesce(p.full_name, 'Equipe')
  from public.organization_users ou
  left join public.profiles p on p.id = ou.user_id
  where ou.organization_id = p_organization_id
    and ou.status = 'active'
    and public.is_organization_member(p_organization_id);
$$;
grant execute on function public.get_team_directory(uuid) to authenticated;

-- Row Level Security ---------------------------------------------------------
alter table public.work_order_events enable row level security;
alter table public.work_order_photos enable row level security;
alter table public.work_order_attachments enable row level security;
alter table public.notification_settings enable row level security;
alter table public.customer_notifications enable row level security;

create policy work_order_events_select on public.work_order_events for select
  using (exists (select 1 from public.work_orders w where w.id = work_order_id and public.has_permission(w.organization_id, w.branch_id, 'work_orders.view')));
create policy work_order_events_insert on public.work_order_events for insert
  with check (exists (select 1 from public.work_orders w where w.id = work_order_id and public.has_permission(w.organization_id, w.branch_id, 'work_orders.update')));

create policy work_order_photos_select on public.work_order_photos for select
  using (deleted_at is null and exists (select 1 from public.work_orders w where w.id = work_order_id and public.has_permission(w.organization_id, w.branch_id, 'work_orders.view')));
create policy work_order_photos_manage on public.work_order_photos for all
  using (exists (select 1 from public.work_orders w where w.id = work_order_id and public.has_permission(w.organization_id, w.branch_id, 'work_orders.update')))
  with check (exists (select 1 from public.work_orders w where w.id = work_order_id and public.has_permission(w.organization_id, w.branch_id, 'work_orders.update')));

create policy work_order_attachments_select on public.work_order_attachments for select
  using (deleted_at is null and exists (select 1 from public.work_orders w where w.id = work_order_id and public.has_permission(w.organization_id, w.branch_id, 'work_orders.view')));
create policy work_order_attachments_manage on public.work_order_attachments for all
  using (exists (select 1 from public.work_orders w where w.id = work_order_id and public.has_permission(w.organization_id, w.branch_id, 'work_orders.update')))
  with check (exists (select 1 from public.work_orders w where w.id = work_order_id and public.has_permission(w.organization_id, w.branch_id, 'work_orders.update')));

create policy notification_settings_select on public.notification_settings for select
  using (public.has_permission(organization_id, branch_id, 'work_orders.view'));
create policy notification_settings_manage on public.notification_settings for all
  using (public.has_permission(organization_id, branch_id, 'notifications.manage'))
  with check (public.has_permission(organization_id, branch_id, 'notifications.manage'));

create policy customer_notifications_select on public.customer_notifications for select
  using (public.has_permission(organization_id, branch_id, 'work_orders.view'));
create policy customer_notifications_manage on public.customer_notifications for update
  using (public.has_permission(organization_id, branch_id, 'notifications.manage'))
  with check (public.has_permission(organization_id, branch_id, 'notifications.manage'));

-- A timeline é imutável para usuários: sem update/delete.
revoke update, delete on public.work_order_events from authenticated;
revoke insert on public.customer_notifications from authenticated;
revoke delete on public.work_order_photos from authenticated;
revoke delete on public.work_order_attachments from authenticated;
revoke delete on public.notification_settings from authenticated;
revoke delete on public.customer_notifications from authenticated;

grant execute on function public.portal_login(text, text, text) to anon, authenticated;
grant execute on function public.get_customer_portal(text) to anon, authenticated;
grant execute on function public.work_order_status_label(text) to anon, authenticated;

-- Tempo real: painel da oficina acompanha mudanças sem recarregar a página.
do $$
begin
  alter publication supabase_realtime add table public.work_orders;
exception when duplicate_object or undefined_object then null;
end;
$$;
do $$
begin
  alter publication supabase_realtime add table public.work_order_events;
exception when duplicate_object or undefined_object then null;
end;
$$;

-- Bucket de mídia das ordens (fotos e anexos). Leitura pública por URL não
-- adivinhável; escrita restrita a usuários autenticados da oficina.
do $$
begin
  insert into storage.buckets (id, name, public) values ('work-order-media', 'work-order-media', true)
  on conflict (id) do nothing;
  begin
    create policy work_order_media_read on storage.objects for select using (bucket_id = 'work-order-media');
    create policy work_order_media_write on storage.objects for insert to authenticated with check (bucket_id = 'work-order-media');
  exception when duplicate_object then null;
  end;
exception when undefined_table or insufficient_privilege then null;
end;
$$;

commit;
