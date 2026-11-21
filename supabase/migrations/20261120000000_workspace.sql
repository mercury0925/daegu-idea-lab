begin;
create table public.members (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null default 'member' check (role in ('admin','member')),
  color text not null default '#6366f1' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now()
);
alter table public.members enable row level security;
create function public.is_team_member() returns boolean language sql stable security definer
set search_path = '' as $$ select exists(select 1 from public.members where id = (select auth.uid())) $$;
create function public.is_team_admin() returns boolean language sql stable security definer
set search_path = '' as $$ select exists(select 1 from public.members where id = (select auth.uid()) and role = 'admin') $$;
revoke all on function public.is_team_member(), public.is_team_admin() from public;
grant execute on function public.is_team_member(), public.is_team_admin() to authenticated;
create policy team_directory on public.members for select to authenticated using ((select public.is_team_member()));
create policy edit_own_profile on public.members for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke all on public.members from anon, authenticated;
grant select, update(name, color) on public.members to authenticated;

create table public.records (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('idea','resource','similar','task','comment','settings')),
  title text not null check (length(trim(title)) > 0),
  data jsonb not null default '{}' check (jsonb_typeof(data) = 'object'),
  idea_id uuid references public.records(id) on delete cascade,
  author_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index records_kind on public.records(kind, created_at desc);
create index records_idea on public.records(idea_id);
create unique index project_settings_singleton on public.records(kind) where kind = 'settings';
alter table public.records enable row level security;
revoke all on public.records from anon, authenticated;
grant select, insert(kind,title,data,idea_id), update(title,data,idea_id), delete on public.records to authenticated;
create policy team_read on public.records for select to authenticated using ((select public.is_team_member()));
create policy team_insert on public.records for insert to authenticated
with check ((select public.is_team_member()) and author_id = (select auth.uid()) and (kind <> 'settings' or (select public.is_team_admin())));
create policy team_update on public.records for update to authenticated using (
  (select public.is_team_member()) and (kind <> 'comment' or author_id = (select auth.uid())) and (kind <> 'settings' or (select public.is_team_admin()))
);
create policy team_delete on public.records for delete to authenticated using (
  (select public.is_team_member()) and (kind <> 'comment' or author_id = (select auth.uid())) and (kind <> 'settings' or (select public.is_team_admin()))
);
create function public.validate_record() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.kind in ('comment','similar') and new.idea_id is null then
    raise exception 'An idea is required';
  end if;
  if new.idea_id is not null and (new.kind not in ('comment','similar','task')
     or not exists (select 1 from public.records where id = new.idea_id and kind = 'idea')) then
    raise exception 'Invalid idea reference';
  end if;
  if new.kind = 'idea' and (new.data->>'status' is null or new.data->>'status' not in ('신규 발굴','자료 조사','유사 서비스 검증','심층 검토','최종 후보','제외')) then
    raise exception 'Invalid idea status';
  end if;
  if new.kind = 'task' and (new.data->>'status' is null or new.data->>'status' not in ('할 일','진행 중','검토 필요','완료')) then
    raise exception 'Invalid task status';
  end if;
  if new.kind = 'similar' and (new.data->>'status' is null or new.data->>'status' not in ('미조사','조사 중','유사사례 발견','차별성 검토 필요','검증 통과','중복으로 제외')) then
    raise exception 'Invalid similarity status';
  end if;
  return new;
end $$;
create trigger validate_record before insert or update on public.records for each row execute function public.validate_record();
create function public.touch_record() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
create trigger record_updated before update on public.records for each row execute function public.touch_record();

create table public.idea_resources (
  idea_id uuid references public.records(id) on delete cascade,
  resource_id uuid references public.records(id) on delete cascade,
  primary key (idea_id, resource_id)
);
alter table public.idea_resources enable row level security;
revoke all on public.idea_resources from anon, authenticated;
grant select, insert, delete on public.idea_resources to authenticated;
create policy team_links on public.idea_resources for all to authenticated using ((select public.is_team_member()))
with check ((select public.is_team_member()) and exists(select 1 from public.records where id = idea_resources.idea_id and kind='idea')
  and exists(select 1 from public.records where id = idea_resources.resource_id and kind='resource'));

create table public.evaluations (
  idea_id uuid references public.records(id) on delete cascade,
  author_id uuid default auth.uid() references auth.users(id) on delete cascade,
  local_score integer not null check (local_score between 0 and 25),
  ai_score integer not null check (ai_score between 0 and 25),
  feasibility integer not null check (feasibility between 0 and 15),
  originality integer not null check (originality between 0 and 15),
  growth integer not null check (growth between 0 and 20),
  bonus integer not null check (bonus between 0 and 5),
  notes jsonb not null default '{}',
  total integer generated always as (local_score + ai_score + feasibility + originality + growth + bonus) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (idea_id, author_id)
);
alter table public.evaluations enable row level security;
revoke all on public.evaluations from anon, authenticated;
grant select, insert(idea_id,author_id,local_score,ai_score,feasibility,originality,growth,bonus,notes),
update(local_score,ai_score,feasibility,originality,growth,bonus,notes), delete on public.evaluations to authenticated;
create policy team_scores on public.evaluations for select to authenticated using ((select public.is_team_member()));
create policy own_score_insert on public.evaluations for insert to authenticated with check (
  (select public.is_team_member()) and author_id = (select auth.uid()) and exists (select 1 from public.records where id = evaluations.idea_id and kind='idea')
);
create policy own_score_update on public.evaluations for update to authenticated using ((select public.is_team_member()) and author_id = (select auth.uid()));
create policy own_score_delete on public.evaluations for delete to authenticated using ((select public.is_team_member()) and author_id = (select auth.uid()));
create trigger score_updated before update on public.evaluations for each row execute function public.touch_record();
create view public.evaluation_averages with (security_invoker = true) as
select idea_id, count(*) as participants, avg(total) as average, avg(local_score) as local_score,
avg(ai_score) as ai_score, avg(feasibility) as feasibility, avg(originality) as originality, avg(growth) as growth, avg(bonus) as bonus
from public.evaluations group by idea_id;
revoke all on public.evaluation_averages from anon, authenticated;
grant select on public.evaluation_averages to authenticated;
create policy team_notifications on realtime.messages for select to authenticated
using (extension = 'broadcast' and (select realtime.topic()) = 'team-workspace'
  and (select public.is_team_member()));
create function public.notify_workspace() returns trigger language plpgsql security definer
set search_path = '' as $$
begin
  perform realtime.send('{}'::jsonb, 'changed', 'team-workspace', true);
  return null;
end $$;
revoke all on function public.notify_workspace() from public;
create trigger records_changed after insert or update or delete on public.records
for each statement execute function public.notify_workspace();
create trigger evaluations_changed after insert or update or delete on public.evaluations
for each statement execute function public.notify_workspace();
create trigger links_changed after insert or update or delete on public.idea_resources
for each statement execute function public.notify_workspace();
create trigger members_changed after insert or update or delete on public.members
for each statement execute function public.notify_workspace();
commit;
