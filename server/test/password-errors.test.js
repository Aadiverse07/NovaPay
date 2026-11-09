import test from 'node:test';
import assert from 'node:assert/strict';
import { passwordUpdateError } from '../../src/password-errors.js';

test('password update errors map to separate user guidance',()=>{
 assert.equal(passwordUpdateError({code:'reauthentication_needed'}).code,'reauthentication_needed');
 assert.equal(passwordUpdateError({code:'same_password'}).message,'Your new password must be different from your current one.');
 assert.match(passwordUpdateError({code:'weak_password',message:'Password should contain symbols.'}).message,/symbols/);
 assert.equal(passwordUpdateError({code:'session_not_found'}).code,'session_expired');
 assert.equal(passwordUpdateError({status:429}).code,'rate_limited');
 assert.equal(passwordUpdateError({code:'unexpected'}).code,'update_failed');
});

test('reauthentication code and request throttling give actionable messages',()=>{
 assert.match(passwordUpdateError({code:'reauthentication_not_valid'}).message,/wrong or expired/i);
 assert.match(passwordUpdateError({code:'over_request_rate_limit'}).message,/wait a minute/i);
});
