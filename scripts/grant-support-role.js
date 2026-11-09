import 'dotenv/config';

const base=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'');
const [orgId,userId]=process.argv.slice(2);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if(!base||!key||!uuid.test(orgId||'')||!uuid.test(userId||'')){process.stderr.write('Usage: node scripts/grant-support-role.js <org-uuid> <user-uuid> (requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)\n');process.exit(2)}
const headers={apikey:key,...(key.startsWith('sb_secret_')?{}:{Authorization:`Bearer ${key}`}),'Content-Type':'application/json',Prefer:'return=representation'};
const query=new URLSearchParams({org_id:`eq.${orgId}`,user_id:`eq.${userId}`});
try{
 const current=await fetch(`${base}/rest/v1/memberships?${new URLSearchParams({select:'role',org_id:`eq.${orgId}`,user_id:`eq.${userId}`,limit:'1'})}`,{headers,signal:AbortSignal.timeout(15000)});
 const membership=current.ok?await current.json():null;
 if(!current.ok||!membership?.length){process.stderr.write(`Membership lookup failed (HTTP ${current.status}); confirm the org and member IDs.\n`);process.exitCode=1;process.exit();}
 if(['owner','admin'].includes(membership[0].role)){process.stderr.write('Owners and admins cannot be converted to support by this helper.\n');process.exitCode=1;process.exit();}
 const response=await fetch(`${base}/rest/v1/memberships?${query}`,{method:'PATCH',headers,body:JSON.stringify({role:'support'}),signal:AbortSignal.timeout(15000)});
 const rows=response.ok?await response.json():null;
 if(!response.ok||!rows?.length){process.stderr.write(`Support role update failed (HTTP ${response.status}); confirm the org and member IDs.\n`);process.exitCode=1}
 else process.stdout.write(`Support role granted to member ${userId} in organization ${orgId}.\n`);
}catch{process.stderr.write('Support role update could not reach Supabase. Check the server environment and try again.\n');process.exitCode=1}
