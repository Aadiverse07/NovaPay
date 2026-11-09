import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const dashboard=readFileSync(new URL('../../dashboard.html',import.meta.url),'utf8');
const styles=readFileSync(new URL('../../src/security.css',import.meta.url),'utf8');
const live=readFileSync(new URL('../../src/novapay-live.js',import.meta.url),'utf8');

test('step-up dialog has accessible methods, inline state, labeled password and cancel controls',()=>{
 assert.match(dashboard,/<dialog id="security-step-up-modal"[^>]+role="dialog"/);assert.match(dashboard,/aria-describedby="security-step-up-help"/);assert.match(dashboard,/security-step-up-password-tab/);assert.match(dashboard,/security-step-up-email-tab/);assert.match(dashboard,/security-step-up-toggle-password/);assert.match(dashboard,/role="status" aria-live="polite"/);assert.match(dashboard,/security-step-up-cancel/);
});
test('step-up modal is responsive and themed, restores focus and closes without submitting on cancel',()=>{
 assert.match(styles,/\.security-step-up-dialog\{width:min\(480px,calc\(100vw - 32px\)\)/);assert.match(styles,/::backdrop/);assert.match(styles,/@media\(max-width:520px\)/);assert.match(live,/if\(opener&&opener\.isConnected\)opener\.focus\(\)/);assert.match(live,/finish\(false,new Error\("Re-authentication was cancelled\."\)\)/);assert.match(live,/processing=false;\$\("approval-confirm-submit"\)\.disabled=false/);
});
