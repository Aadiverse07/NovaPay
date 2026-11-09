import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { rbac } from '../middleware/auth.js';
import { auditApiAction } from '../services/audit.js';
import { structuredErrorBody } from '../middleware/errorResponses.js';

const createSchema=z.object({subject:z.string().trim().min(5).max(160),category:z.enum(['payment_failure','refund','account','invoice','other']),priority:z.enum(['low','normal','high','urgent']).default('normal'),relatedType:z.enum(['transaction','approval','failure','invoice']).optional(),relatedId:z.string().max(150).optional(),body:z.string().trim().min(1).max(4000)}).strict();
const messageSchema=z.object({body:z.string().trim().min(1).max(4000),internalNote:z.boolean().default(false)}).strict();
const updateSchema=z.object({status:z.enum(['open','in_progress','waiting_on_user','resolved','closed']).optional(),priority:z.enum(['low','normal','high','urgent']).optional(),assigneeId:z.string().uuid().nullable().optional()}).strict();
const idSchema=z.string().uuid();
const isStaff=req=>['support','admin','owner'].includes(req.orgRole);
const ticketNumber=t=>`NP-${String(t.ticket_number||0).padStart(4,'0')}`;
const creatorTicket=t=>({id:t.id,ticket_number:t.ticket_number,ticket_number_label:ticketNumber(t),category:t.category,subject:t.subject,created_at:t.created_at});
const staffTicket=t=>({...t,ticket_number_label:ticketNumber(t)});

export function supportRoutes({repos,identity,supportMail}={}){
 const router=Router();
 async function notifyUsers(orgId,ticketId,userIds,rule,ticketNo=null){for(const id of new Set((userIds||[]).filter(Boolean)))await repos.notifications?.addSupport?.(orgId,ticketId,id,rule,ticketNo)}
 async function notifySupportQueue(orgId,ticketId){const recipients=await repos.supportTickets.staffRecipients?.(orgId)||[];await notifyUsers(orgId,ticketId,recipients,'support_ticket_update')}
 async function emailFor(ticket){const user=await identity?.getUserById?.(ticket.created_by);return typeof user?.email==='string'?user.email.trim():''}
 async function recordDelivery(req,ticket,message,result,operation){
  await repos.supportTickets.updateMessageEmail(ticket.org_id,message.id,result.status,result.errorClass||null);
  await auditApiAction(identity,req,{action:`support.ticket.email_${result.status}`,entity:'support_ticket_message',entityId:message.id,metadata:{operation,status:result.status,errorClass:result.errorClass||null}});
 }
 async function sendForMessage(req,ticket,message){
  ticket.ticket_number_label=ticketNumber(ticket);
  let result;
  if(message.internal_note)return{status:'not_configured',errorClass:null};
  let recipient='';try{recipient=await emailFor(ticket)}catch{recipient=''}
  if(!recipient)result={status:'failed',errorClass:'recipient_unavailable'};
  else try{if(message.email_kind==='ticket_received')result=await supportMail.ticketReceived(ticket,recipient,message.body);else if(message.email_kind==='status')result=await supportMail.status(ticket,recipient,message.body.replace(/^Ticket status: /,''));else result=await supportMail.reply(ticket,recipient,message.body)}catch{result={status:'failed',errorClass:'smtp_unknown'}}
  await recordDelivery(req,ticket,message,result,message.email_kind);
  return result;
 }
 const createLimit=rateLimit({windowMs:3600000,limit:10,standardHeaders:'draft-8',legacyHeaders:false,keyGenerator:req=>req.user.id,message:{error:{code:'TICKET_RATE_LIMITED',message:'Too many new tickets. Try again later.'}}});
 router.post('/support/tickets',createLimit,async(req,res,next)=>{
  const parsed=createSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','Ticket fields are invalid.'));
  try{
   const ticket=await repos.supportTickets.create(req.orgId,req.user.id,parsed.data);ticket.ticket_number_label=ticketNumber(ticket);
   const message=await repos.supportTickets.addMessage(req.orgId,ticket.id,req.user.id,parsed.data.body,false,'not_configured','ticket_received');
   const delivery=await sendForMessage(req,ticket,message);
   await notifySupportQueue(req.orgId,ticket.id);
   await auditApiAction(identity,req,{action:'support.ticket.created',entity:'support_ticket',entityId:ticket.id,metadata:{category:ticket.category,ticketNumber:ticket.ticket_number}});
   return res.status(201).json({ticket:creatorTicket(ticket),emailStatus:delivery.status});
  }catch(error){return next(error)}
 });
 router.get('/support/tickets',async(req,res,next)=>{
  try{
   const limit=Math.min(100,Math.max(1,Number(req.query.limit)||50)),offset=Math.max(0,Number(req.query.offset)||0);
   const filters={limit,offset,...(['open','in_progress','waiting_on_user','resolved','closed'].includes(req.query.status)?{status:req.query.status}:{}),...(['low','normal','high','urgent'].includes(req.query.priority)?{priority:req.query.priority}:{}),...(['payment_failure','refund','account','invoice','other'].includes(req.query.category)?{category:req.query.category}:{})};
   const rows=await repos.supportTickets.list(req.orgId,req.user.id,isStaff(req),filters);
   return res.json({tickets:rows.map(isStaff(req)?staffTicket:creatorTicket),isSupport:isStaff(req),page:{limit,offset}});
  }catch(error){return next(error)}
 });
 router.get('/support/tickets/:id',async(req,res,next)=>{
  const parsed=idSchema.safeParse(req.params.id);if(!parsed.success)return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','Ticket ID is invalid.'));
  if(!isStaff(req))return res.status(403).json(structuredErrorBody('TICKET_EMAIL_ONLY','Ticket replies are sent to your account email.'));
  try{const ticket=await repos.supportTickets.get(req.orgId,parsed.data);if(!ticket)return res.status(404).json(structuredErrorBody('TICKET_NOT_FOUND','The ticket was not found.'));return res.json({ticket:staffTicket(ticket),messages:await repos.supportTickets.messages(req.orgId,ticket.id,true)})}catch(error){return next(error)}
 });
 router.post('/support/tickets/:id/messages',async(req,res,next)=>{
  const id=idSchema.safeParse(req.params.id),parsed=messageSchema.safeParse(req.body);if(!id.success)return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','Ticket ID is invalid.'));if(!parsed.success)return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','Message must be 1 to 4,000 characters.'));
  if(!isStaff(req))return res.status(403).json(structuredErrorBody('TICKET_EMAIL_ONLY','Replies from ticket creators are not available in NovaPay. Start a new ticket or reply by email.'));
  try{
   const ticket=await repos.supportTickets.get(req.orgId,id.data);if(!ticket)return res.status(404).json(structuredErrorBody('TICKET_NOT_FOUND','The ticket was not found.'));
   const message=await repos.supportTickets.addMessage(req.orgId,ticket.id,req.user.id,parsed.data.body,parsed.data.internalNote,'not_configured','reply');
   let delivery={status:'not_configured',errorClass:null};
   if(!parsed.data.internalNote){delivery=await sendForMessage(req,ticket,message);await notifyUsers(req.orgId,ticket.id,[ticket.created_by],'support_ticket_reply',ticketNumber(ticket));}
   await auditApiAction(identity,req,{action:'support.ticket.message_added',entity:'support_ticket',entityId:ticket.id,metadata:{internalNote:parsed.data.internalNote,emailStatus:delivery.status}});
   return res.status(201).json({message:{...message,email_status:parsed.data.internalNote?'not_configured':delivery.status,email_error_class:delivery.errorClass||null}});
  }catch(error){return next(error)}
 });
 router.post('/support/tickets/:id/messages/:messageId/retry-email',rbac(['support','admin','owner']),async(req,res,next)=>{
  const id=idSchema.safeParse(req.params.id),messageId=idSchema.safeParse(req.params.messageId);if(!id.success||!messageId.success)return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','Ticket or message ID is invalid.'));
  try{const ticket=await repos.supportTickets.get(req.orgId,id.data),message=ticket&&await repos.supportTickets.getMessage(req.orgId,ticket.id,messageId.data);if(!ticket||!message||message.internal_note)return res.status(404).json(structuredErrorBody('TICKET_MESSAGE_NOT_FOUND','The message was not found.'));if(message.email_status!=='failed')return res.status(409).json(structuredErrorBody('EMAIL_RETRY_NOT_AVAILABLE','Only failed email deliveries can be retried.'));const result=await sendForMessage(req,ticket,message);return res.json({emailStatus:result.status,errorClass:result.errorClass||null})}catch(error){return next(error)}
 });
 router.patch('/support/tickets/:id',rbac(['support','admin','owner']),async(req,res,next)=>{
  const id=idSchema.safeParse(req.params.id),parsed=updateSchema.safeParse(req.body);if(!id.success||!parsed.success)return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','Ticket update is invalid.'));
  try{
   const previous=await repos.supportTickets.get(req.orgId,id.data);if(!previous)return res.status(404).json(structuredErrorBody('TICKET_NOT_FOUND','The ticket was not found.'));const previousStatus=previous.status;
   const ticket=await repos.supportTickets.update(req.orgId,id.data,parsed.data);ticket.ticket_number_label=ticketNumber(ticket);
   if(parsed.data.status&&parsed.data.status!==previousStatus){
    await notifyUsers(req.orgId,ticket.id,[ticket.created_by],'support_ticket_update');
    if(['resolved','closed'].includes(parsed.data.status)){const body=`Ticket status: ${parsed.data.status}`;const message=await repos.supportTickets.addMessage(req.orgId,ticket.id,req.user.id,body,false,'not_configured','status');const delivery=await sendForMessage(req,ticket,message);ticket.statusEmailStatus=delivery.status;}
   }
   await auditApiAction(identity,req,{action:'support.ticket.updated',entity:'support_ticket',entityId:ticket.id,metadata:{...parsed.data,ticketNumber:ticket.ticket_number}});
   return res.json({ticket:staffTicket(ticket)});
  }catch(error){return next(error)}
 });
 return router;
}
