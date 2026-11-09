import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createRepositories } from '../src/repos/memory.js';

const org='a0000000-0000-4000-8000-000000000001',creator='b0000000-0000-4000-8000-000000000002',other='c0000000-0000-4000-8000-000000000003',staff='d0000000-0000-4000-8000-000000000004';
const config={PORT:3000,STATIC_DIR:process.cwd(),hasSupabase:true,hasPayPal:false,hasAI:false};
async function withServer(app,fn){const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));try{await fn(`http://127.0.0.1:${server.address().port}`)}finally{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))}}

test('creator ticket API exposes only number and purpose; staff can reply, assign, resolve and retry email',async()=>{
 const repos=createRepositories(),audits=[],notifications=[];repos.supportTickets.staffRecipients=async()=>[staff];repos.notifications.addSupport=async(...args)=>{notifications.push(args)};
 const users=new Map([['owner-token',{id:creator,role:'viewer'}],['other-token',{id:other,role:'viewer'}],['staff-token',{id:staff,role:'support'}]]);
 const identity={async verifyToken(token){return users.get(token)||null},async membership(userId,orgId){if(orgId!==org)return null;const row=users.get([...users.keys()].find(key=>users.get(key)?.id===userId));return row?{role:row.role}:null},async getUserById(id){return id===creator?{id,email:'registered@example.test'}:null},async audit(row){audits.push(row)}};
 const sends=[];let failReply=true;const supportMail={configured:true,async ticketReceived(ticket,email,body){sends.push({kind:'received',ticket,email,body});return{status:'sent'}},async reply(ticket,email,body){sends.push({kind:'reply',ticket,email,body});if(failReply){failReply=false;return{status:'failed',errorClass:'smtp_connection'}}return{status:'sent'}},async status(ticket,email,value){sends.push({kind:'status',ticket,email,value});return{status:'sent'}}};
 const app=createApp({config,identity,repos,supportMail});
 await withServer(app,async base=>{
  const call=(token,path,options={})=>fetch(base+path,{...options,headers:{authorization:`Bearer ${token}`,'x-org-id':org,...(options.body?{'content-type':'application/json'}:{})}});
  const created=await call('owner-token','/api/support/tickets',{method:'POST',body:JSON.stringify({subject:'Cannot capture order',category:'payment_failure',relatedType:'failure',relatedId:'failure-123',body:'Capture request returned a provider error.'})});assert.equal(created.status,201);const createdBody=await created.json(),ticket=createdBody.ticket;assert.equal(ticket.ticket_number_label,'NP-0001');assert.equal(createdBody.emailStatus,'sent');assert.deepEqual(Object.keys(ticket).sort(),['category','created_at','id','subject','ticket_number','ticket_number_label'].sort());assert.equal(sends[0].email,'registered@example.test');
  const own=await call('owner-token','/api/support/tickets');const ownBody=await own.json();assert.equal(ownBody.tickets[0].ticket_number_label,'NP-0001');assert.equal('status'in ownBody.tickets[0],false);assert.equal('priority'in ownBody.tickets[0],false);assert.equal('body'in ownBody.tickets[0],false);
  assert.equal((await call('other-token','/api/support/tickets')).status,200);assert.equal((await(await call('other-token','/api/support/tickets')).json()).tickets.length,0);
  assert.equal((await call('owner-token',`/api/support/tickets/${ticket.id}`)).status,403);
  const creatorReply=await call('owner-token',`/api/support/tickets/${ticket.id}/messages`,{method:'POST',body:JSON.stringify({body:'Please reply.'})});assert.equal(creatorReply.status,403);
  const internal=await call('staff-token',`/api/support/tickets/${ticket.id}/messages`,{method:'POST',body:JSON.stringify({body:'Check provider state internally.',internalNote:true})});assert.equal(internal.status,201);assert.equal(sends.length,1);
  const reply=await call('staff-token',`/api/support/tickets/${ticket.id}/messages`,{method:'POST',body:JSON.stringify({body:'We are checking the provider response.'})});assert.equal(reply.status,201);const failed=await reply.json();assert.equal(failed.message.email_status,'failed');assert.equal(failed.message.email_error_class,'smtp_connection');assert.equal(sends.at(-1).email,'registered@example.test');assert.equal(notifications.at(-1)[3],'support_ticket_reply');assert.ok(notifications.at(-1)[4].includes('NP-0001'));
  const detail=await(await call('staff-token',`/api/support/tickets/${ticket.id}`)).json();assert.equal(detail.messages.length,3);assert.equal(detail.messages[1].internal_note,true);assert.equal(detail.messages[2].email_status,'failed');
  const retried=await call('staff-token',`/api/support/tickets/${ticket.id}/messages/${failed.message.id}/retry-email`,{method:'POST',body:'{}'});assert.equal(retried.status,200);assert.equal((await retried.json()).emailStatus,'sent');
  const updated=await call('staff-token',`/api/support/tickets/${ticket.id}`,{method:'PATCH',body:JSON.stringify({assigneeId:staff,status:'resolved'})});assert.equal(updated.status,200);assert.equal((await updated.json()).ticket.statusEmailStatus,'sent');assert.equal(sends.at(-1).kind,'status');
  assert.ok(audits.some(x=>x.action==='support.ticket.created'));assert.ok(audits.some(x=>x.action==='support.ticket.message_added'));assert.ok(audits.some(x=>x.action==='support.ticket.updated'));assert.ok(audits.some(x=>x.action==='support.ticket.email_sent'));assert.ok(audits.some(x=>x.action==='support.ticket.email_failed'));
 });
});
