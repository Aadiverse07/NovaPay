import { Router } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { rbac } from '../middleware/auth.js';
import { structuredErrorBody } from '../middleware/errorResponses.js';
import { approveUrl, paypalRequestId } from '../services/paypal.js';

const uuid = z.string().uuid();
const campaignBody = z.object({
  title: z.string().trim().min(1).max(160),
  purpose: z.string().trim().min(1).max(2000),
  targetMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  deadline: z.string().date().nullable().optional(),
  organiser: z.string().trim().min(1).max(160),
  status: z.enum(['draft','active']).default('active'),
}).strict();
const pledgeBody = z.object({ amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).strict();

function mapCampaign(row) {
  return { id: row.id, title: row.title, purpose: row.purpose, targetMinor: Number(row.target_minor ?? row.targetMinor), currency: row.currency || 'USD', deadline: row.deadline || null, organiser: row.organiser, status: row.status, createdAt: row.created_at || null };
}

export function fundRoutes({ config, paypal, repos }) {
  const router = Router();
  router.get('/funds/campaigns', async (req, res, next) => {
    try {
      const rows = await repos.funds.listCampaigns(req.orgId);
      return res.json({ campaigns: (rows || []).map(mapCampaign) });
    } catch (error) { return next(error); }
  });

  router.post('/funds/campaigns', rbac(['owner','admin','accountant']), async (req, res, next) => {
    const parsed = campaignBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','Campaign fields are invalid.'));
    try {
      const campaign = await repos.funds.createCampaign({ orgId:req.orgId,actorId:req.user.id,...parsed.data,requestId:req.id });
      return res.status(201).json({ campaign:mapCampaign(campaign) });
    } catch (error) { return next(error); }
  });

  router.get('/funds/campaigns/:campaignId/summary', async (req, res, next) => {
    if (!uuid.safeParse(req.params.campaignId).success) return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','Campaign ID is invalid.'));
    try { return res.json(await repos.funds.campaignSummary(req.orgId,req.params.campaignId)); }
    catch (error) { return next(error); }
  });

  router.post('/funds/campaigns/:campaignId/pledges', rbac(['owner','admin','accountant','approver']), async (req, res, next) => {
    if (!uuid.safeParse(req.params.campaignId).success) return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','Campaign ID is invalid.'));
    const parsed = pledgeBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','Pledge fields are invalid.'));
    try {
      const contribution = await repos.funds.createPledge({ orgId:req.orgId,actorId:req.user.id,campaignId:req.params.campaignId,amountMinor:parsed.data.amountMinor,requestId:req.id });
      return res.status(201).json({ contribution:{ id:contribution.id,status:contribution.status,amountMinor:Number(contribution.amount_minor ?? contribution.amountMinor),currency:'USD',donorRef:'anonymous',countsAsFunds:false }, message:'Pledge recorded as intent only; it does not count as received funds.' });
    } catch (error) { return next(error); }
  });

  router.post('/funds/contributions/:contributionId/paypal-order', rbac(['owner','admin','accountant','approver']), async (req, res, next) => {
    if (!uuid.safeParse(req.params.contributionId).success) return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','Contribution ID is invalid.'));
    if (!config.hasPayPal) return res.status(503).json(structuredErrorBody('PAYPAL_UNAVAILABLE','PayPal Sandbox is not configured.'));
    try {
      const contribution = await repos.funds.getContribution(req.orgId,req.params.contributionId);
      if (!contribution || contribution.status!=='pledged') return res.status(404).json(structuredErrorBody('PLEDGE_NOT_FOUND','An open pledge was not found.'));
      const amountMinor = Number(contribution.amount_minor ?? contribution.amountMinor);
      if (!Number.isSafeInteger(amountMinor) || amountMinor < 1 || amountMinor > 1000000) return res.status(400).json(structuredErrorBody('PAYPAL_AMOUNT_LIMIT','PayPal Sandbox contribution orders support up to 10,000.00 USD.'));
      const requestKey = createHash('sha256').update(`${req.orgId}:${contribution.id}`).digest('hex').slice(0,32);
      let order = await repos.orders.byRequestKey(requestKey,req.orgId);
      if (!order || !order.id || order.status==='CREATING') {
        if (!order) order = await repos.orders.save({ id:'',requestKey,amount:(amountMinor/100).toFixed(2),currency:'USD',status:'CREATING',state:'Creating',approveUrl:'' },req.orgId);
        const amount = (amountMinor/100).toFixed(2);
        const data = await paypal.pp('POST','/v2/checkout/orders',{ intent:'CAPTURE',purchase_units:[{ reference_id:contribution.id,custom_id:contribution.id,description:'NovaPay campaign contribution',amount:{currency_code:'USD',value:amount} }],payment_source:{paypal:{experience_context:{return_url:`http://localhost:${config.PORT}/dashboard.html#fundraising`,cancel_url:`http://localhost:${config.PORT}/dashboard.html#fundraising`,user_action:'PAY_NOW'}}} },paypalRequestId('fund-contribution',`${req.orgId}:${contribution.id}`),req.orgId);
        const link = (data.links||[]).find((item)=>item.rel==='payer-action'||item.rel==='approve');
        const url = approveUrl(link?.href);
        if (!data.id || !url) return res.status(502).json(structuredErrorBody('PAYPAL_ORDER_INCOMPLETE','PayPal returned no buyer approval URL.'));
        order = await repos.orders.save({ id:String(data.id),requestKey,amount,currency:'USD',status:String(data.status||'CREATED'),state:'Created',approveUrl:url },req.orgId);
        await repos.funds.linkContributionOrder({ orgId:req.orgId,actorId:req.user.id,contributionId:contribution.id,requestKey,orderId:order.id,approveUrl:url,requestId:req.id });
      } else {
        await repos.funds.linkContributionOrder({ orgId:req.orgId,actorId:req.user.id,contributionId:contribution.id,requestKey,orderId:order.id,approveUrl:order.approveUrl,requestId:req.id });
      }
      return res.status(201).json({ orderId:order.id,status:order.status,approveUrl:order.approveUrl,amount:order.amount,currency:'USD',contributionId:contribution.id });
    } catch (error) { return next(error); }
  });
  return router;
}
