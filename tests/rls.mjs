import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const ids = [1, 2, 3, 4, 5].map(n => '00000000-0000-0000-0000-00000000000' + n)
await db.exec(`
  create schema auth;
  create role authenticated;
  create role anon;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon;
  create schema realtime;
  create table realtime.messages(extension text);
  alter table realtime.messages enable row level security;
  create function realtime.topic() returns text language sql as $$ select 'team-workspace'::text $$;
  create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$ select $$;
  grant usage on schema realtime to authenticated;
  grant select on realtime.messages to authenticated;
  insert into realtime.messages values ('broadcast');
`)
await db.exec(await readFile(new URL('../supabase/migrations/20261120000000_workspace.sql', import.meta.url),'utf8'))
await db.exec(await readFile(new URL('../supabase/migrations/20261121000000_activity.sql', import.meta.url),'utf8'))
for (const [index, id] of ids.entries()) {
  await db.query('insert into auth.users values ($1)',[id])
  if (index < 4) await db.query('insert into members(id,name,role) values ($1,$2,$3)',[id,'팀원 ' + index,index === 0 ? 'admin' : 'member'])
}
async function switchUser(id, role = 'authenticated') {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id])
  await db.exec('set role ' + role)
}
await switchUser('', 'anon')
await assert.rejects(db.query('select * from records'),/permission denied/)
await switchUser(ids[4])
assert.equal((await db.query('select * from members')).rows.length,0)
assert.equal((await db.query('select * from activity_logs')).rows.length,0)
assert.equal((await db.query('select * from realtime.messages')).rows.length,0)
await assert.rejects(db.query("insert into records(kind,title,data) values ('idea','차단','{\"status\":\"신규 발굴\"}')"),/row-level security/)
await switchUser(ids[0])
assert.equal((await db.query('select * from realtime.messages')).rows.length,1)
const { rows:[idea] } = await db.query("insert into records(kind,title,data) values ('idea','대구 아이디어','{\"status\":\"최종 후보\"}') returning id")
await db.query("insert into records(kind,title) values ('settings','설정')")
for (const [index,id] of ids.slice(0,4).entries()) {
  await switchUser(id)
  assert.equal((await db.query('select * from records where kind=$1',['idea'])).rows.length,1)
  await db.query('insert into evaluations (idea_id,local_score,ai_score,feasibility,originality,growth,bonus) values ($1,$2,25,15,15,20,5)',[idea.id,index+10])
}
const {rows:[result]} = await db.query('select participants,average from evaluation_averages')
assert.equal(Number(result.participants),4)
assert.equal(Number(result.average),91.5)
assert.equal((await db.query('update evaluations set bonus=0 where author_id=$1 returning *',[ids[0]])).rows.length,0)
await assert.rejects(db.query('update members set role=$1 where id=$2',['admin',ids[3]]),/permission denied/)
assert.equal((await db.query("update records set data='{}' where kind='settings' returning *")).rows.length,0)
await db.query('update members set name=$1 where id=$2',['변경된 이름',ids[3]])
const {rows:[resource]} = await db.query("insert into records(kind,title) values ('resource','공공 데이터') returning id")
await db.query('insert into idea_resources values($1,$2)',[idea.id,resource.id])
await db.query("insert into records(kind,title,data,idea_id) values ('similar','기존 서비스','{\"status\":\"검증 통과\"}',$1)",[idea.id])
const {rows:[comment]} = await db.query("insert into records(kind,title,idea_id) values ('comment','내용',$1) returning id",[idea.id])
await switchUser(ids[0])
assert.equal((await db.query('select * from realtime.messages')).rows.length,1)
assert.equal((await db.query('select * from idea_resources')).rows.length,1)
assert.equal((await db.query('delete from records where id=$1 returning *',[comment.id])).rows.length,0)
assert.equal((await db.query('select * from activity_logs where item_kind=$1',['evaluation'])).rows.length,4)
await assert.rejects(db.query('delete from activity_logs'),/permission denied/)
await db.close()
console.log('PASS: migration, anonymous denial, allowlist, sharing, resource associations, scoring and write permissions')
