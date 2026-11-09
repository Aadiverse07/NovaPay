function passwordUpdateError(error) {
  var code=String(error&& (error.code||error.name)||'').toLowerCase(),status=Number(error&&(error.status||error.statusCode)||0),details=[error&&error.details,error&&error.message].filter(Boolean).join(' ');
  if(code==='reauthentication_needed'||code==='reauthentication_required')return{code:'reauthentication_needed',message:'Check your email for a verification code to continue.'};
  if(code==='same_password')return{code:code,message:'Your new password must be different from your current one.'};
  if(code==='reauthentication_not_valid')return{code:code,message:'That verification code is wrong or expired. Request a new code and try again.'};
  if(code==='weak_password')return{code:code,message:'Choose a stronger password. '+(details||'The password does not meet Supabase password requirements.')};
  if(['session_not_found','refresh_token_not_found','invalid_jwt','jwt_expired','session_expired'].includes(code)||status===401)return{code:'session_expired',message:'Your session has expired. Sign in again before changing your password.'};
  if(status===429||code.includes('rate_limit')||code.includes('too_many'))return{code:'rate_limited',message:'Too many password requests. Wait a minute and try again.'};
  return{code:'update_failed',message:'Password could not be updated. Check your connection and try again.'};
}
if(typeof window!=='undefined')window.NovaPayPasswordErrors={passwordUpdateError:passwordUpdateError};
if(typeof module!=='undefined')module.exports={passwordUpdateError:passwordUpdateError};
