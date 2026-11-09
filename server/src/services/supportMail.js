import nodemailer from 'nodemailer';

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function errorClass(error){const code=String(error?.code||'').toUpperCase();if(/AUTH|CREDENTIAL|LOGIN/.test(code))return'smtp_auth';if(/ECONN|ETIMEDOUT|ESOCKET|ENOTFOUND/.test(code))return'smtp_connection';if(/REJECT|EENVELOPE/.test(code))return'smtp_rejected';return'smtp_unknown'}
export function createSupportMail({config={},transport}={}){
 const configured=Boolean(config.SMTP_HOST&&config.SMTP_FROM);
 const mailer=transport||(configured?nodemailer.createTransport({host:config.SMTP_HOST,port:Number(config.SMTP_PORT||587),secure:Number(config.SMTP_PORT)===465,auth:config.SMTP_USER?{user:config.SMTP_USER,pass:config.SMTP_PASS}:undefined}):null);
 async function send({to,subject,text,replyTo,copyTo}){
  if(!configured||!mailer)return{status:'not_configured',errorClass:null};
  try{await mailer.sendMail({from:config.SMTP_FROM,to, ...(copyTo?{cc:copyTo}:{}), ...(replyTo?{replyTo}:{}),subject,text,html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#16233a"><div style="font-weight:700;color:#2154b8;margin:24px 0">NovaPay Support</div><div style="white-space:pre-wrap;line-height:1.55">${escapeHtml(text)}</div><p style="font-size:12px;color:#657080;margin-top:24px">Please reply to this email to follow up.</p></div>`});return{status:'sent',errorClass:null};}
  catch(error){return{status:'failed',errorClass:errorClass(error)}}
 }
 return{
  configured,
  async ticketReceived(ticket,email,body){return send({to:email,copyTo:config.SUPPORT_INBOX_EMAIL||undefined,replyTo:config.SUPPORT_INBOX_EMAIL||config.SMTP_FROM,subject:`NovaPay ${ticket.ticket_number_label} · We received your request`,text:`We received your support request.\n\nTicket: ${ticket.ticket_number_label}\nPurpose: ${ticket.category}\nSubject: ${ticket.subject}\n\n${body}`})},
  async reply(ticket,email,body){return send({to:email,replyTo:config.SUPPORT_INBOX_EMAIL||config.SMTP_FROM,subject:`NovaPay ${ticket.ticket_number_label} · Support reply`,text:`Support replied to your ticket.\n\nTicket: ${ticket.ticket_number_label}\nSubject: ${ticket.subject}\n\n${body}`})},
  async status(ticket,email,status){return send({to:email,replyTo:config.SUPPORT_INBOX_EMAIL||config.SMTP_FROM,subject:`NovaPay ${ticket.ticket_number_label} · Ticket ${status}`,text:`Your NovaPay support ticket is now ${status}.\n\nTicket: ${ticket.ticket_number_label}\nSubject: ${ticket.subject}`})},
  errorClass,
 };
}
