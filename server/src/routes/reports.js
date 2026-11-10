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

export function reportCsvCell(value) {
  const text=String(value??'');
  const safe=/^[\u0000-\u0020]*[=+\-@]/.test(text)?`'${text}`:text;
  return `"${safe.replaceAll('"','""')}"`;
}

function csv(rows) {
  const fields=[...new Set(rows.flatMap((row)=>Object.keys(row)))];
  return [fields.map(reportCsvCell).join(','),...rows.map((row)=>fields.map((field)=>reportCsvCell(row[field])).join(','))].join('\r\n');
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
  router.get('/reports/cash-flow-series',async(req,res,next)=>{
    const parsed=querySchema.safeParse(req.query);
    if(!parsed.success) return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','Cash flow filters are invalid.'));
    const {from,to,currency}=parsed.data;
    if(from&&to&&from>to) return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','The from date must not be after the to date.'));
    try{
      const entries=[]; const limit=500;
      for(let offset=0;offset<10000;offset+=limit){
        const batch=await repos.listLedgerEntries(req.orgId,{from,to,limit,offset});
        entries.push(...batch); if(batch.length<limit) break;
      }
      const groups=new Map();
      for(const entry of entries){
        const code=String(entry.currency||'').toUpperCase();
        if(!/^[A-Z]{3}$/.test(code)||(currency&&code!==currency)) continue;
        const date=String(entry.created_at||entry.entry_date||'').slice(0,10);
        if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||(from&&date<from)||(to&&date>to)) continue;
        const bucket=date.slice(0,7), key=`${code}:${bucket}`;
        const total=groups.get(key)||{period:bucket,currency:code,moneyIn:0n,moneyOut:0n,net:0n};
        for(const line of entry.lines||[]){
          const account=String((Array.isArray(line.accounts)?line.accounts[0]?.code:line.accounts?.code)||line.account_code||''); if(!['1000','1010'].includes(account)) continue;
          const debit=BigInt(String(line.debit_minor||0)),credit=BigInt(String(line.credit_minor||0));
          if(debit>credit) total.moneyIn+=debit-credit; else total.moneyOut+=credit-debit;
          total.net+=debit-credit;
        }
        groups.set(key,total);
      }
      const rows=[...groups.values()].sort((a,b)=>a.period.localeCompare(b.period)||a.currency.localeCompare(b.currency)).map(row=>({period:row.period,currency:row.currency,money_in_minor:String(row.moneyIn),money_out_minor:String(row.moneyOut),net_minor:String(row.net)}));
      const currencies=[...new Set(rows.map(row=>row.currency))];
      return res.json({from:from||null,to:to||null,rows,currencies});
    }catch(error){return next(error);}
  });
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
