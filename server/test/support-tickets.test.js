import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepositories } from '../src/repos/memory.js';

test('support ticket repositories isolate organizations, creators and internal notes', async () => {
  const repos=createRepositories();
  const ticket=await repos.supportTickets.create('org-a','user-a',{subject:'Failed payment',category:'payment_failure',priority:'normal'});
  await repos.supportTickets.addMessage('org-a',ticket.id,'user-a','Customer visible',false);
  await repos.supportTickets.addMessage('org-a',ticket.id,'staff-a','Internal investigation',true);
  assert.equal(await repos.supportTickets.get('org-b',ticket.id),null);
  assert.equal((await repos.supportTickets.list('org-a','user-b',false,{limit:20,offset:0})).length,0);
  assert.deepEqual((await repos.supportTickets.messages('org-a',ticket.id,false)).map(x=>x.body),['Customer visible']);
  assert.equal((await repos.supportTickets.messages('org-a',ticket.id,true)).length,2);
});

test('ticket numbers increment within each organization',async()=>{
 const repos=createRepositories();const a=await repos.supportTickets.create('org-a','user-a',{subject:'First',category:'other'});const b=await repos.supportTickets.create('org-a','user-a',{subject:'Second',category:'refund'});const c=await repos.supportTickets.create('org-b','user-b',{subject:'Other workspace',category:'account'});assert.deepEqual([a.ticket_number,b.ticket_number,c.ticket_number],[1,2,1]);
});

test('ticket number migration keeps counter private and organization scoped',async()=>{
 const {readFileSync}=await import('node:fs');const sql=readFileSync(new URL('../../supabase/migrations/0029_support_ticket_email.sql',import.meta.url),'utf8');
 assert.match(sql,/support_ticket_counters\s*\(\s*org_id uuid primary key/i);assert.match(sql,/alter table public\.support_ticket_counters enable row level security/i);assert.match(sql,/support_ticket_counters\.org_id and m\.user_id=auth\.uid\(\)/i);assert.match(sql,/revoke all on public\.support_ticket_counters from public,anon,authenticated/i);assert.match(sql,/grant execute on function public\.allocate_support_ticket_number\(uuid\) to service_role/i);
});
