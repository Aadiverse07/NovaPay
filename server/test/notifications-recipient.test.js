import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createRepositories } from '../src/repos/memory.js';

const org='a0000000-0000-4000-8000-000000000001',creator='b0000000-0000-4000-8000-000000000002',staff='c0000000-0000-4000-8000-000000000003';
const config={PORT:3000,STATIC_DIR:process.cwd(),hasSupabase:true,hasPayPal:false,hasAI:false};
async function withServer(app,fn){const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));try{await fn(`http://127.0.0.1:${server.address().port}`)}finally{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))}}

test('ticket and security notifications are recipient scoped, replies notify the other party, and internal notes do not',async()=>{
 const repos=createRepositories();repos.supportTickets.staffRecipients=async()=>[staff];const identities=new Map([['creator-token',{id:creator,role:'viewer'}],['staff-token',{id:staff,role:'support'}]]);
 const identity={async verifyToken(token){return identities.get(token)||null},async membership(userId,orgId){return orgId===org?(userId===creator?{role:'viewer'}:userId===staff?{role:'support'}:null):null}};
 const app=createApp({config,identity,repos});
 await withServer(app,async base=>{
   const call=(token,path,options={})=>fetch(base+path,{...options,headers:{authorization:`Bearer ${token}`,'x-org-id':org,...(options.body?{'content-type':'application/json'}:{})}});
   const created=await call('creator-token','/api/support/tickets',{method:'POST',body:JSON.stringify({subject:'Payment failed',category:'payment_failure',body:'Please investigate.'})});assert.equal(created.status,201);const ticket=(await created.json()).ticket;
   let own=await call('creator-token','/api/notifications');assert.equal((await own.json()).notifications.length,0);
   let queue=await call('staff-token','/api/notifications');assert.equal((await queue.json()).notifications.length,1);
   await call('creator-token',`/api/support/tickets/${ticket.id}/messages`,{method:'POST',body:JSON.stringify({body:'A customer follow-up.'})});
   let staffNotifications=(await(await call('staff-token','/api/notifications')).json()).notifications;assert.equal(staffNotifications.length,2);
   await call('staff-token',`/api/support/tickets/${ticket.id}/messages`,{method:'POST',body:JSON.stringify({body:'Private note.',internalNote:true})});
   own=await call('creator-token','/api/notifications');assert.equal((await own.json()).notifications.length,0);
   await call('staff-token',`/api/support/tickets/${ticket.id}/messages`,{method:'POST',body:JSON.stringify({body:'We are reviewing this.'})});
   own=await call('creator-token','/api/notifications');assert.equal((await own.json()).notifications.length,1);
   const security=repos.notifications.addSecurity(org,creator,'LOGIN-1',{level:'high',score:80,reasons:['New device.']});
   assert.equal((await repos.notifications.list(org,staff)).some(row=>row.id===security.id),false);
   assert.equal((await repos.notifications.list(org,creator)).some(row=>row.id===security.id),true);
   const hidden=await call('creator-token',`/api/notifications/${staffNotifications[0].id}/read`,{method:'POST'});assert.equal(hidden.status,404);
 });
});
