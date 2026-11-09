import 'dotenv/config';

const base=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const serviceKey=String(process.env.SUPABASE_SERVICE_ROLE_KEY||''),anonKey=String(process.env.SUPABASE_ANON_KEY||'');
const orgId=String(process.env.SUPPORT_RLS_ORG_ID||'');
const emails={creator:String(process.env.SUPPORT_RLS_CREATOR_EMAIL||''),other:String(process.env.SUPPORT_RLS_OTHER_EMAIL||''),support:String(process.env.SUPPORT_RLS_SUPPORT_EMAIL||'')};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if(!base||!serviceKey||!anonKey||!uuid.test(orgId)||Object.values(emails).some(email=>!/^\S+@\S+\.\S+$/.test(email))){process.stderr.write('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, SUPPORT_RLS_ORG_ID, and SUPPORT_RLS_CREATOR_EMAIL / SUPPORT_RLS_OTHER_EMAIL / SUPPORT_RLS_SUPPORT_EMAIL.\n');process.exit(2)}
const serviceHeaders={apikey:serviceKey,...(serviceKey.startsWith('sb_secret_')?{}:{Authorization:`Bearer ${serviceKey}`}),'Content-Type':'application/json',Prefer:'return=representation'};
const anonHeaders={'Content-Type':'application/json',apikey:anonKey};
async function request(url,options={}){const response=await fetch(url,{...options,signal:AbortSignal.timeout(20000)});let body=null;try{body=await response.json()}catch{}return{status:response.status,body}}
async function service(path,options={}){return request(base+path,{...options,headers:{...serviceHeaders,...(options.headers||{})}})}
function assert(ok,message){if(!ok)throw new Error(message)}
function q(values){return new URLSearchParams(values).toString()}
async function authenticate(email){const generated=await service('/auth/v1/admin/generate_link',{method:'POST',body:JSON.stringify({type:'magiclink',email})});assert(generated.status===200&&generated.body?.hashed_token,'fixture-user-auth-unavailable');const verified=await request(`${base}/auth/v1/verify`,{method:'POST',headers:anonHeaders,body:JSON.stringify({type:'magiclink',token_hash:generated.body.hashed_token})});assert(verified.status===200&&verified.body?.access_token,'fixture-user-sign-in-failed');return verified.body}
async function readAs(user,path){return request(`${base}${path}`,{headers:{apikey:anonKey,Authorization:`Bearer ${user.access_token}`}})}
const users={};let ticketId=null;
try{
 for(const role of ['creator','other','support'])users[role]=await authenticate(emails[role]);
 const [creatorMembership,supportMembership]=await Promise.all(['creator','support'].map(async role=>{const path='/rest/v1/memberships?'+q({select:'role',org_id:`eq.${orgId}`,user_id:`eq.${users[role].user.id}`,limit:'1'});return service(path)}));
 assert(creatorMembership.status===200&&creatorMembership.body?.length,'creator-not-member-of-org');
 assert(supportMembership.status===200&&supportMembership.body?.[0]?.role==='support','support-fixture-must-have-support-role');
 const ticket=await service('/rest/v1/support_tickets',{method:'POST',body:JSON.stringify({org_id:orgId,created_by:users.creator.user.id,subject:`RLS verify ${Date.now()}`,category:'other',priority:'low',status:'open'})});assert(ticket.status===201&&ticket.body?.[0]?.id,'fixture-ticket-create-failed');ticketId=ticket.body[0].id;
 const message=await service('/rest/v1/support_ticket_messages',{method:'POST',body:JSON.stringify([{ticket_id:ticketId,org_id:orgId,author_id:users.creator.user.id,body:'Customer-visible verification note.',internal_note:false},{ticket_id:ticketId,org_id:orgId,author_id:users.support.user.id,body:'Internal verification note.',internal_note:true}])});assert(message.status===201,'fixture-messages-create-failed');
 const ticketPath=`/rest/v1/support_tickets?${q({select:'id',org_id:`eq.${orgId}`,id:`eq.${ticketId}`})}`;
 const messagePath=`/rest/v1/support_ticket_messages?${q({select:'body,internal_note',org_id:`eq.${orgId}`,ticket_id:`eq.${ticketId}`})}`;
 const [creatorTicket,otherTicket,creatorMessages,supportTicket,supportMessages]=await Promise.all([readAs(users.creator,ticketPath),readAs(users.other,ticketPath),readAs(users.creator,messagePath),readAs(users.support,ticketPath),readAs(users.support,messagePath)]);
 assert(creatorTicket.status===200&&creatorTicket.body?.length===1,'creator-cannot-read-own-ticket');
 assert(otherTicket.status===200&&otherTicket.body?.length===0,'other-user-read-another-users-ticket');
 assert(creatorMessages.status===200&&creatorMessages.body?.length===1&&!creatorMessages.body[0].internal_note,'creator-can-read-internal-note');
 assert(supportTicket.status===200&&supportTicket.body?.length===1,'support-cannot-read-org-ticket');
 assert(supportMessages.status===200&&supportMessages.body?.length===2,'support-cannot-read-ticket-internal-note');
 process.stdout.write(JSON.stringify({result:'PASS',creatorOwnTicket:true,otherUserDenied:true,creatorInternalNotesHidden:true,supportCanReadOrgTicket:true,supportCanReadInternalNotes:true,temporaryTicketCreated:true})+'\n');
}catch(error){process.stderr.write(`FAIL ${String(error?.message||'support RLS check failed').replace(/https?:\/\/\S+/g,'[URL]').slice(0,180)}\n`);process.exitCode=1}
finally{if(ticketId){const cleanup=await service(`/rest/v1/support_tickets?${q({org_id:`eq.${orgId}`,id:`eq.${ticketId}`})}`,{method:'DELETE'});if(![200,204].includes(cleanup.status)){process.stderr.write(`Temporary ticket cleanup failed (${ticketId}); remove it from the disposable test org.\n`);process.exitCode=1}}}
