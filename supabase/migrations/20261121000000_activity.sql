begin;

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete cascade,
  item_id uuid not null,
  item_kind text not null check (item_kind in ('idea','resource','similar','task','comment','settings','evaluation')),
  item_title text not null,
  operation text not null check (operation in ('INSERT','UPDATE','DELETE')),
  created_at timestamptz not null default now()
);

create index activity_recent on public.activity_logs(created_at desc);
alter table public.activity_logs enable row level security;
revoke all on public.activity_logs from anon, authenticated;
grant select on public.activity_logs to authenticated;
create policy team_activity on public.activity_logs for select to authenticated
using ((select public.is_team_member()));

create function public.log_activity() returns trigger language plpgsql security definer
set search_path = '' as $$
declare
  item jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  actor uuid := auth.uid();
begin
  if actor is null then
    return null;
  end if;
  if tg_table_name = 'evaluations' then
    insert into public.activity_logs(actor_id,item_id,item_kind,item_title,operation)
    select actor,id,'evaluation',title,tg_op
    from public.records where id = (item->>'idea_id')::uuid;
  else
    insert into public.activity_logs(actor_id,item_id,item_kind,item_title,operation)
    values (actor,(item->>'id')::uuid,item->>'kind',item->>'title',tg_op);
  end if;
  return null;
end $$;
revoke all on function public.log_activity() from public;

create trigger log_records after insert or update or delete on public.records
for each row execute function public.log_activity();
create trigger log_evaluations after insert or update or delete on public.evaluations
for each row execute function public.log_activity();

commit;
