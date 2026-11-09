import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupportMail, escapeHtml } from '../src/services/supportMail.js';

test('support mail reports unconfigured without claiming a send',async()=>{
 const mail=createSupportMail({config:{}});assert.equal(mail.configured,false);assert.deepEqual(await mail.reply({ticket_number_label:'NP-0001'},'user@example.test','A reply'),{status:'not_configured',errorClass:null});
});
test('support mail uses server-selected recipient, configured reply-to/copy and escapes user text',async()=>{
 let captured;const mail=createSupportMail({config:{SMTP_HOST:'smtp.test',SMTP_PORT:587,SMTP_FROM:'NovaPay <support@example.test>',SMTP_USER:'user',SMTP_PASS:'secret',SUPPORT_INBOX_EMAIL:'help@example.test'},transport:{async sendMail(message){captured=message}}});
 const outcome=await mail.ticketReceived({ticket_number_label:'NP-0007',category:'payment_failure',subject:'<img src=x onerror=alert(1)>'},'registered@example.test','Please inspect <script>alert(1)</script>');
 assert.equal(outcome.status,'sent');assert.equal(captured.to,'registered@example.test');assert.equal(captured.cc,'help@example.test');assert.equal(captured.replyTo,'help@example.test');assert.match(captured.html,/&lt;script&gt;/);assert.doesNotMatch(captured.html,/<script>/);assert.equal(escapeHtml('a&b"c'),'a&amp;b&quot;c');
});
test('support mail failure returns only a safe error class',async()=>{
 const mail=createSupportMail({config:{SMTP_HOST:'smtp.test',SMTP_FROM:'help@example.test'},transport:{async sendMail(){throw Object.assign(new Error('private SMTP message'),{code:'EAUTH'})}}});const result=await mail.reply({ticket_number_label:'NP-0001'},'registered@example.test','secret content');assert.deepEqual(result,{status:'failed',errorClass:'smtp_auth'});
});
