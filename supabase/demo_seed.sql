begin;

-- Execute somente em um projeto Supabase exclusivo para demonstração.
-- O primeiro usuário já cadastrado torna-se proprietário do ambiente de exemplo.
do $$
declare
 v_user uuid;v_result jsonb;v_org uuid;v_main uuid;v_second uuid;v_customer uuid;v_vehicle uuid;v_product uuid;v_warehouse uuid;
begin
 select id into v_user from auth.users order by created_at limit 1;
 if v_user is null then raise exception 'Crie primeiro um usuário de demonstração no Supabase Auth';end if;
 perform set_config('request.jwt.claim.sub',v_user::text,true);
 select id into v_org from public.organizations where tax_id='00000000000001' and deleted_at is null;
 if v_org is null then
  v_result:=public.complete_onboarding('Oficina Modelo','Oficina Modelo Demonstração Ltda.','00000000000001','Matriz','MATRIZ','America/Bahia');
  v_org:=(v_result->>'organization_id')::uuid;v_main:=(v_result->>'branch_id')::uuid;
 else select id into v_main from public.branches where organization_id=v_org and code='MATRIZ' and deleted_at is null limit 1;end if;

 insert into public.branches(organization_id,name,code,timezone,created_by,updated_by) values(v_org,'Unidade Norte','NORTE','America/Bahia',v_user,v_user) on conflict(organization_id,code) do update set name=excluded.name returning id into v_second;
 insert into public.branch_users(organization_id,branch_id,user_id,status) values(v_org,v_second,v_user,'active') on conflict(branch_id,user_id) do update set status='active';
 insert into public.document_sequences(organization_id,branch_id,document_type) values(v_org,v_second,'work_order'),(v_org,v_second,'estimate') on conflict do nothing;

 select id into v_customer from public.customers where organization_id=v_org and tax_id='00000000002' and deleted_at is null;
 if v_customer is null then insert into public.customers(organization_id,primary_branch_id,name,tax_id,primary_phone,whatsapp,primary_email,communication_consent,consent_at,created_by,updated_by) values(v_org,v_main,'Cliente Demonstração','00000000002','71999990000','71999990000','cliente@example.com',true,now(),v_user,v_user) returning id into v_customer;end if;
 select id into v_vehicle from public.vehicles where organization_id=v_org and upper(license_plate)='DEM0A01' and deleted_at is null;
 if v_vehicle is null then insert into public.vehicles(organization_id,branch_id,customer_id,license_plate,brand,model,model_year,color,mileage,created_by,updated_by) values(v_org,v_main,v_customer,'DEM0A01','Toyota','Corolla',2022,'Prata',42500,v_user,v_user) returning id into v_vehicle;end if;

 select id into v_product from public.products where organization_id=v_org and upper(sku)='DEMO-001' and deleted_at is null;
 if v_product is null then insert into public.products(organization_id,branch_id,sku,name,brand,product_type,cost_price,sale_price,minimum_stock,reorder_point,created_by,updated_by) values(v_org,v_main,'DEMO-001','Filtro de óleo','Modelo','part',18.50,39.90,5,8,v_user,v_user) returning id into v_product;end if;
 insert into public.warehouses(organization_id,branch_id,code,name,created_by,updated_by) values(v_org,v_main,'PRINCIPAL','Estoque principal',v_user,v_user) on conflict(branch_id,code) do update set name=excluded.name returning id into v_warehouse;
 insert into public.stock_balances(organization_id,branch_id,warehouse_id,product_id,on_hand,reserved,average_cost) values(v_org,v_main,v_warehouse,v_product,20,0,18.50) on conflict(warehouse_id,product_id) do nothing;
 if not exists(select 1 from public.suppliers where organization_id=v_org and tax_id='00000000000003' and deleted_at is null) then insert into public.suppliers(organization_id,branch_id,legal_name,trade_name,tax_id,phone,email,delivery_days,rating,created_by,updated_by) values(v_org,v_main,'Autopeças Demonstração Ltda.','Autopeças Demo','00000000000003','7133330000','fornecedor@example.com',2,4.8,v_user,v_user);end if;
 if not exists(select 1 from public.appointments where organization_id=v_org and customer_id=v_customer and service_description='Revisão demonstrativa' and deleted_at is null) then insert into public.appointments(organization_id,branch_id,customer_id,vehicle_id,starts_at,ends_at,service_description,status,created_by,updated_by) values(v_org,v_main,v_customer,v_vehicle,date_trunc('day',now())+interval '1 day 09:00',date_trunc('day',now())+interval '1 day 10:00','Revisão demonstrativa','confirmed',v_user,v_user);end if;
end;
$$;

commit;
