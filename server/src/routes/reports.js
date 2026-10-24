import { Router } from 'express';
import { z } from 'zod';
import { structuredErrorBody } from '../middleware/errorResponses.js';

const querySchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  currency: z.string().regex(/^[A-Za-z]{3}$/).transform((value)=>value.toUpperCase()).optional(),
  format: z.enum(['json','csv']).default('json'),
}).strict();
const views = {
  'profit-and-loss':'report_profit_and_loss',
  'trial-balance':'report_trial_balance',
  fees:'report_fee_summary',
  refunds:'report_refunds_summary',
  'cash-movement':'report_cash_movement',
};

function csv(rows) {
  const fields=[...new Set(rows.flatMap((row)=>Object.keys(row)))];
  const quote=(value)=>`"${String(value??'').replaceAll('"','""')}"`;
  return [fields.map(quote).join(','),...rows.map((row)=>fields.map((field)=>quote(row[field])).join(','))].join('\r\n');
}

export function reportTotals(report,rows) {
  const sum=(predicate,field='amount_minor')=>rows.reduce((total,row)=>total+(predicate(row)?BigInt(String(row[field]||0)):0n),0n);
  if(report==='profit-and-loss'){
    const revenue=sum((row)=>row.account_type==='revenue');
    const contra=sum((row)=>row.account_type==='contra_revenue');
    const expense=sum((row)=>row.account_type==='expense');
    return {revenueMinor:String(revenue),refundsMinor:String(contra),netRevenueMinor:String(revenue-contra),expensesMinor:String(expense),netIncomeMinor:String(revenue-contra-expense)};
  }
  if(report==='trial-balance'){
    const debit=sum(()=>true,'debit_minor'),credit=sum(()=>true,'credit_minor');
    return {debitMinor:String(debit),creditMinor:String(credit),balanced:debit===credit};
  }
  return null;
}

export function reportRoutes({ repos }) {
  const router=Router();
  router.get('/reports/:report',async(req,res,next)=>{
    const parsed=querySchema.safeParse(req.query);
    if(!parsed.success) return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','Report filters are invalid.'));
    const {from,to,currency,format}=parsed.data;
    if(from&&to&&from>to) return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','The from date must not be after the to date.'));
    const view=views[req.params.report];
    if(!view) return res.status(404).json(structuredErrorBody('REPORT_NOT_FOUND','The requested report does not exist.'));
    try{
      const rows=await repos.reports.rows(view,req.orgId,{from,to});
      const filtered=currency?rows.filter((row)=>row.currency===currency):rows;
      if(format==='csv') return res.type('text/csv').attachment(`${req.params.report}.csv`).send(csv(filtered));
      return res.json({report:req.params.report,from:from||null,to:to||null,rows:filtered,totals:reportTotals(req.params.report,filtered)});
    }catch(error){return next(error);}
  });
  return router;
}
