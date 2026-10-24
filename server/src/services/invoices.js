import { moneyToMinor, minorToMoney } from '../repos/postgres.js';
import { PAYPAL_API, paypalRequestId } from './paypal.js';

const PAYPAL_INVOICE_ID = /^INV2-(?:[A-Z0-9]{4,5}-){2,3}[A-Z0-9]{4,5}$/;
const PAYPAL_INVOICE_PATH = /^\/v2\/invoicing\/invoices\/([^/]+)$/;

export function extractPayPalInvoiceId(response) {
  const directId = typeof response?.id === 'string' ? response.id : '';
  if (PAYPAL_INVOICE_ID.test(directId)) return directId;

  const hrefs = [
    ...(typeof response?.href === 'string' ? [response.href] : []),
    ...(Array.isArray(response?.links) ? response.links.filter((link) => link?.rel === 'self').map((link) => link.href) : []),
  ];
  const api = new URL(PAYPAL_API);
  for (const href of hrefs) {
    if (typeof href !== 'string' || !href) continue;
    try {
      const url = new URL(href, api);
      if (url.protocol !== 'https:' || url.origin !== api.origin || url.search || url.hash || url.username || url.password) continue;
      const match = PAYPAL_INVOICE_PATH.exec(url.pathname);
      if (!match) continue;
      const id = decodeURIComponent(match[1]);
      if (PAYPAL_INVOICE_ID.test(id)) return id;
    } catch {}
  }
  return null;
}

function logInvoiceSendStage(repos, req, stage, ok = true) {
  Promise.resolve(repos.events?.addCall({ t: new Date().toISOString(), m: `invoice_send:${stage}`, ok }, req.orgId)).catch(() => {});
}

function scaledInteger(value, scale, label) {
  const text=String(value);
  const decimals=scale===1000?3:4;
  if(!new RegExp(`^(?:0|[1-9]\\d*)(?:\\.\\d{1,${decimals}})?$`).test(text)) throw Object.assign(new Error(`${label} is invalid.`),{statusCode:400,code:'VALIDATION_ERROR'});
  const [whole,fraction='']=text.split('.');
  return BigInt(whole)*BigInt(scale)+BigInt(fraction.padEnd(decimals,'0'));
}
const roundRatio=(numerator,denominator)=>(numerator+denominator/2n)/denominator;

export function computeInvoice(lines) {
  const computed=lines.map((line)=>{
    const quantity=scaledInteger(line.quantity,1000,'Quantity');
    const price=BigInt(moneyToMinor(line.unitPrice));
    const taxRate=scaledInteger(line.taxRate??'0',10000,'Tax rate');
    if(quantity<=0n||price<0n||taxRate>10000n) throw Object.assign(new Error('Invoice line values are invalid.'),{statusCode:400,code:'VALIDATION_ERROR'});
    const subtotal=roundRatio(price*quantity,1000n);
    const tax=roundRatio(subtotal*taxRate,10000n);
    const total=subtotal+tax;
    for(const amount of [subtotal,tax,total]) if(amount>BigInt(Number.MAX_SAFE_INTEGER)) throw Object.assign(new Error('Invoice total is too large.'),{statusCode:400,code:'VALIDATION_ERROR'});
    return {description:line.description.trim(),quantity:(Number(quantity)/1000).toFixed(3).replace(/0+$/,'').replace(/\.$/,''),unit_price_minor:Number(price),tax_rate:(Number(taxRate)/10000).toFixed(4),line_subtotal_minor:Number(subtotal),tax_minor:Number(tax),line_total_minor:Number(total)};
  });
  const subtotal=computed.reduce((sum,line)=>sum+line.line_subtotal_minor,0);
  const tax=computed.reduce((sum,line)=>sum+line.tax_minor,0);
  const total=computed.reduce((sum,line)=>sum+line.line_total_minor,0);
  if(!Number.isSafeInteger(total)||total<=0) throw Object.assign(new Error('Invoice total must be greater than zero.'),{statusCode:400,code:'VALIDATION_ERROR'});
  return {lines:computed,subtotalMinor:subtotal,taxMinor:tax,totalMinor:total};
}

export function buildInvoiceDraft(input,userId) {
  const computed=computeInvoice(input.lines);
  return {
    invoice:{invoice_number:input.invoiceNumber,customer_name:input.customerName,customer_email:input.customerEmail,currency:input.currency,
      subtotal_minor:computed.subtotalMinor,tax_minor:computed.taxMinor,total_minor:computed.totalMinor,created_by:userId},
    lines:computed.lines,
  };
}

function percentFromRate(rate) {
  const text=String(rate),[whole,fraction='']=text.split('.');
  let value=BigInt(whole+fraction.padEnd(4,'0'))*100n;
  const denominator=10000n;
  const integer=value/denominator,rem=value%denominator;
  return rem?`${integer}.${String(rem).padStart(4,'0').replace(/0+$/,'')}`:String(integer);
}

export async function decideInvoiceSend({repos,paypal,req,approvalId,decision,note=''}) {
  const current=await repos.approvals.get(approvalId,req.orgId);
  if(!current||current.proposalType!=='send-invoice') return {status:404,body:{error:{code:'INVOICE_APPROVAL_NOT_FOUND',message:'The invoice approval was not found.'}}};
  if(current.status==='completed') return {status:200,body:{approvalId,status:'completed',invoiceId:current.invoiceId}};
  const decided=await repos.approvals.decideInvoiceSend(approvalId,req.orgId,decision,note,req.user.id,req.id);
  if(decided.result==='already_decided') return {status:409,body:{error:{code:'APPROVAL_ALREADY_DECIDED',message:'This approval is no longer pending.'}}};
  if(decision==='reject') return {status:200,body:{approvalId,status:'rejected',reviewerId:req.user.id,decisionNote:note}};
  const approval=decided.approval;
  const invoice=await repos.invoices.get(req.orgId,approval.invoiceId);
  if(!invoice||invoice.state!=='reviewed') {
    await repos.invoices.failSend(req.orgId,approvalId,'Invoice is not in reviewed state.');
    return {status:409,body:{error:{code:'INVOICE_NOT_REVIEWED',message:'Only a reviewed invoice can be sent.'}}};
  }
  let stage = 'paypal_create';
  try {
    let paypalInvoiceId=invoice.paypalInvoiceId;
    if(!paypalInvoiceId) {
      const [givenName,...surnameParts]=invoice.customerName.split(/\s+/);
      const response=await paypal.pp('POST','/v2/invoicing/invoices',{
        detail:{invoice_number:invoice.invoiceNumber,currency_code:invoice.currency,payment_term:{term_type:'DUE_ON_RECEIPT'},note:'Invoice issued by NovaPay'},
        invoicer:{name:{given_name:'NovaPay',surname:'Organization'}},
        primary_recipients:[{billing_info:{name:{given_name:givenName,surname:surnameParts.join(' ')||'Customer'},email_address:invoice.customerEmail}}],
        items:invoice.lines.map((line)=>({name:line.description,quantity:line.quantity,unit_amount:{currency_code:invoice.currency,value:line.unitPrice},...(Number(line.taxRate)>0?{tax:{name:'Tax',percent:percentFromRate(line.taxRate)}}:{})})),
      },paypalRequestId('invoice-create',`${req.orgId}:${invoice.id}`),req.orgId);
      logInvoiceSendStage(repos,req,'paypal_create_ok');
      stage = 'invoice_id_extract';
      paypalInvoiceId=extractPayPalInvoiceId(response);
      if(!paypalInvoiceId) {
        logInvoiceSendStage(repos,req,'invoice_id_extraction_failed',false);
        throw Object.assign(new Error('PayPal did not return a valid invoice ID.'),{statusCode:502});
      }
      logInvoiceSendStage(repos,req,'invoice_id_extracted');
      stage = 'persist_paypal_draft';
      await repos.invoices.setPayPalDraft(req.orgId,invoice.id,paypalInvoiceId);
      logInvoiceSendStage(repos,req,'paypal_draft_persisted');
    }
    stage = 'paypal_send';
    logInvoiceSendStage(repos,req,'paypal_send_called');
    await paypal.pp('POST',`/v2/invoicing/invoices/${encodeURIComponent(paypalInvoiceId)}/send`,{send_to_recipient:true,send_to_invoicer:true},paypalRequestId('invoice-send',`${req.orgId}:${approvalId}`),req.orgId);
    logInvoiceSendStage(repos,req,'paypal_send_ok');
    await repos.invoices.completeSend(req.orgId,approvalId,paypalInvoiceId,{id:paypalInvoiceId,status:'SENT'});
    return {status:200,body:{approvalId,status:'completed',invoiceId:invoice.id,paypalInvoiceId,state:'sent'}};
  } catch {
    logInvoiceSendStage(repos,req,`failed_at_${stage}`,false);
    await repos.invoices.failSend(req.orgId,approvalId,'PayPal invoice delivery failed; verify the Sandbox invoice before retrying.');
    return {status:502,body:{error:{code:'INVOICE_SEND_FAILED',message:'PayPal could not send the invoice. Check the Sandbox invoice before retrying.'}}};
  }
}

export const invoiceMoney = (minor)=>minorToMoney(minor);
