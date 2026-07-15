begin;

-- Preserve the application's effective authenticated privileges, remove inherited
-- PUBLIC access, then restore only ordinary data privileges explicitly.
create temporary table auth_table_privilege_snapshot(table_ref regclass,privilege text) on commit drop;
insert into auth_table_privilege_snapshot(table_ref,privilege)
select c.oid::regclass,p.privilege
from pg_class c join pg_namespace n on n.oid=c.relnamespace
cross join(values('SELECT'),('INSERT'),('UPDATE'),('DELETE')) p(privilege)
where n.nspname='public' and c.relkind in('r','p') and has_table_privilege('authenticated',c.oid,p.privilege);

create temporary table auth_view_privilege_snapshot(table_ref regclass) on commit drop;
insert into auth_view_privilege_snapshot(table_ref)
select c.oid::regclass from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in('v','m','f') and has_table_privilege('authenticated',c.oid,'SELECT');

create temporary table auth_column_privilege_snapshot(table_name text,column_name text,privilege text) on commit drop;
insert into auth_column_privilege_snapshot(table_name,column_name,privilege)
select table_name,column_name,privilege_type from information_schema.column_privileges
where table_schema='public' and grantee='authenticated' and privilege_type in('SELECT','INSERT','UPDATE');

create temporary table auth_sequence_privilege_snapshot(sequence_ref regclass,privilege text) on commit drop;
insert into auth_sequence_privilege_snapshot(sequence_ref,privilege)
select c.oid::regclass,p.privilege from pg_class c join pg_namespace n on n.oid=c.relnamespace
cross join(values('USAGE'),('SELECT'),('UPDATE')) p(privilege)
where n.nspname='public' and c.relkind='S' and has_sequence_privilege('authenticated',c.oid,p.privilege);

do $$ declare v_relation regclass;begin
 for v_relation in select c.oid::regclass from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p','v','m','f') loop
  execute format('revoke all on table %s from public,anon,authenticated',v_relation);
 end loop;
end $$;

do $$ declare v_row record;begin
 for v_row in select * from auth_table_privilege_snapshot loop execute format('grant %s on table %s to authenticated',v_row.privilege,v_row.table_ref);end loop;
 for v_row in select * from auth_view_privilege_snapshot loop execute format('grant select on table %s to authenticated',v_row.table_ref);end loop;
 for v_row in select * from auth_column_privilege_snapshot loop execute format('grant %s(%I) on table public.%I to authenticated',v_row.privilege,v_row.column_name,v_row.table_name);end loop;
end $$;

do $$ declare v_sequence regclass;v_row record;begin
 for v_sequence in select c.oid::regclass from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='S' loop execute format('revoke all on sequence %s from public,anon,authenticated',v_sequence);end loop;
 for v_row in select * from auth_sequence_privilege_snapshot loop execute format('grant %s on sequence %s to authenticated',v_row.privilege,v_row.sequence_ref);end loop;
end $$;

commit;
