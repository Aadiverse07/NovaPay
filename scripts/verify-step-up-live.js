import 'dotenv/config';

const required=['STEP_UP_TEST_API_URL','STEP_UP_TEST_ACCESS_TOKEN','STEP_UP_TEST_ORG_ID','STEP_UP_TEST_DEVICE_ID','STEP_UP_TEST_PASSWORD'];
const missing=required.filter((key)=>!process.env[key]);
if(missing.length){console.error(`Missing environment variables: ${missing.join(', ')}`);process.exit(2)}
const base=process.env.STEP_UP_TEST_API_URL.replace(/\/$/,'');
let response;
try{
 response=await fetch(`${base}/api/security/step-up`,{method:'POST',headers:{Authorization:`Bearer ${process.env.STEP_UP_TEST_ACCESS_TOKEN}`,'X-Org-Id':process.env.STEP_UP_TEST_ORG_ID,'Content-Type':'application/json'},body:JSON.stringify({method:'password',password:process.env.STEP_UP_TEST_PASSWORD,deviceId:process.env.STEP_UP_TEST_DEVICE_ID})});
}catch{console.error('Step-up live check failed: network unavailable (operation=step_up, status=0)');process.exit(1)}
let body={};try{body=await response.json()}catch{}
const failure=body.error||{};
if(response.ok&&body.granted===true){console.log('Step-up grant flow passed (operation=step_up, status=200)');process.exit(0)}
const code=String(failure.code||'unknown').replace(/[^A-Za-z0-9_.-]/g,'').slice(0,80);
const requestId=response.headers.get('x-request-id')||response.headers.get('sb-request-id')||'unavailable';
console.error(`Step-up live check failed (operation=step_up, status=${response.status}, error_code=${code}, request_id=${requestId})`);process.exit(1);
