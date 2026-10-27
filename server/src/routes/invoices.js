import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { rbac } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { structuredErrorBody } from '../middleware/errorResponses.js';
import { buildInvoiceDraft, invoiceMoney } from '../services/invoices.js';

const lineSchema=z.object({
  description:z.string().trim().min(1).max(200),
  quantity:z.union([z.string(),z.number()]).transform(String).refine((v)=>/^\d{1,7}(?:\.\d{1,3})?$/.test(v)),
  unitPrice:z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/),
  taxRate:z.union([z.string(),z.number()]).optional().transform((v)=>v==null?'0':String(v)).refine((v)=>/^(?:0(?:\.\d{1,4})?|1(?:\.0{1,4})?)$/.test(v)),
});
const createSchema=z.object({invoiceNumber:z.string().trim().min(1).max(25),customerName:z.string().trim().min(1).max(160),customerEmail:z.string().email().max(254),currency:z.string().regex(/^[A-Za-z]{3}$/).transform((v)=>v.toUpperCase()),lines:z.array(lineSchema).min(1).max(100)});
const idSchema=z.string().uuid();

export function invoiceRoutes({repos}) {
  const router=Router();
  router.get('/invoices',async(req,res,next)=>{
    const limit=Number(req.query.limit??50),offset=Number(req.query.offset??0),state=req.query.state;
    if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0||offset>100000||state&&!['draft','reviewed','sent','paid','void'].includes(String(state))) return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','Invoice filters are invalid.'));
    try{return res.json({invoices:await repos.invoices.list(req.orgId,{limit,offset,state:state||undefined}),page:{limit,offset}});}catch(error){return next(error);}
  });
  router.post('/invoices',rbac(['owner','admin','accountant']),validateBody(createSchema),async(req,res,next)=>{
    try{
      const draft=buildInvoiceDraft(req.body,req.user.id);
      const saved=await repos.invoices.createDraft(req.orgId,draft.invoice,draft.lines);
      return res.status(201).json({invoice:saved});
    }catch(error){if(error.statusCode)return res.status(error.statusCode).json(structuredErrorBody(error.code||'VALIDATION_ERROR',error.message));return next(error);}
  });
  router.get('/invoices/:invoiceId',async(req,res,next)=>{
    if(!idSchema.safeParse(req.params.invoiceId).success)return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','Invoice ID is invalid.'));
    try{const invoice=await repos.invoices.get(req.orgId,req.params.invoiceId);return invoice?res.json({invoice}):res.status(404).json(structuredErrorBody('INVOICE_NOT_FOUND','The invoice was not found.'));}catch(error){return next(error);}
  });
  router.post('/invoices/:invoiceId/review',rbac(['owner','admin','approver']),async(req,res,next)=>{
    if(!idSchema.safeParse(req.params.invoiceId).success)return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','Invoice ID is invalid.'));
    try{const invoice=await repos.invoices.setState(req.orgId,req.params.invoiceId,'reviewed',req.user.id);return res.json({invoice});}catch(error){return next(error);}
  });
  router.post('/invoices/:invoiceId/send-approval',rbac(['owner','admin','accountant']),async(req,res,next)=>{
    if(!idSchema.safeParse(req.params.invoiceId).success)return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','Invoice ID is invalid.'));
    try{
      const approvalId=`APR-INV-${randomUUID()}`;
      const approval=await repos.invoices.requestSendApproval(req.orgId,req.params.invoiceId,approvalId,req.user.id,{invoiceId:req.params.invoiceId});
      return res.status(201).json({approval});
    }catch(error){return next(error);}
  });
  router.post('/invoices/:invoiceId/void',rbac(['owner','admin']),async(req,res,next)=>{
    if(!idSchema.safeParse(req.params.invoiceId).success)return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','Invoice ID is invalid.'));
    try{const invoice=await repos.invoices.setState(req.orgId,req.params.invoiceId,'void',req.user.id);return res.json({invoice});}catch(error){return next(error);}
  });
  return router;
}

export const formatInvoiceMoney=invoiceMoney;
