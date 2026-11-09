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
