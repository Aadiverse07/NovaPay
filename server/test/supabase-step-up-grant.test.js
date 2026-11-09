import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseServices } from '../src/services/supabase.js';

test('password grant uses anon key, JSON password grant, normalized email and untouched password, with structured failure',async()=>{
 const calls=[];const fetchImpl=async(url,options)=>{calls.push({url,options});return{ok:false,status:400,json:async()=>({error_code:'invalid_credentials'})}};
 const auth=createSupabaseServices({hasSupabase:true,SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'public-anon-key',SUPABASE_SERVICE_ROLE_KEY:'server-only-key'},fetchImpl);
 const result=await auth.verifyReauthPassword(' Owner@Example.Test ','  password with spaces  ');
 assert.deepEqual(result,{userId:null,status:400,errorCode:'invalid_credentials',accessToken:null});assert.equal(calls[0].url,'https://project.supabase.co/auth/v1/token?grant_type=password');assert.equal(calls[0].options.headers.apikey,'public-anon-key');assert.equal(calls[0].options.headers['Content-Type'],'application/json');assert.deepEqual(JSON.parse(calls[0].options.body),{email:'owner@example.test',password:'  password with spaces  '});
});

test('password grant successful response returns verified user ID',async()=>{
 const auth=createSupabaseServices({hasSupabase:true,SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'server'},async()=>({ok:true,status:200,json:async()=>({user:{id:'user-1'},access_token:'temporary-token'})}));
 assert.deepEqual(await auth.verifyReauthPassword('a@example.test','password'),{userId:'user-1',status:200,errorCode:null,accessToken:'temporary-token'});
});
