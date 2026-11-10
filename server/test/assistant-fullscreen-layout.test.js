import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, script, css] = await Promise.all([
  readFile(new URL('../../dashboard.html', import.meta.url), 'utf8'),
  readFile(new URL('../../src/dashboard.js', import.meta.url), 'utf8'),
  readFile(new URL('../../src/ai-chat.css', import.meta.url), 'utf8'),
]);
const assistant = html.split('id="view-ai-assistant"')[1].split('id="view-approvals"')[0];

test('AI view removes the shared page title and intro copy without changing other view titles', () => {
  assert.doesNotMatch(assistant, /Answers cite available records\. NovaPay does not import your full PayPal history\./);
  assert.doesNotMatch(assistant, /Understand the activity you can see/);
  assert.match(html, /id="view-ai-assistant"[^>]*data-hide-page-title/);
  assert.ok(script.includes("if(hidePageTitle){title.remove();}"));
  assert.ok(script.includes("if(!title.isConnected)document.querySelector(\".dashboard-heading\").appendChild(title)"));
  assert.match(html, /<h1 id="page-title">Dashboard<\/h1>/);
});

test('assistant fills the main shell while preserving topbar controls, internal message scrolling and pinned composer', () => {
  for (const control of ['calendar-button', 'notifications', 'dashboard-theme', 'more-button']) assert.match(html, new RegExp(`id="${control}"`));
  assert.match(css, /body\.assistant-active \.dashboard-main\{[^}]*height:100dvh[^}]*overflow:hidden/);
  assert.match(css, /body\.assistant-active \.dashboard-content\{[^}]*min-height:0[^}]*overflow:hidden/);
  assert.match(css, /#view-ai-assistant \.ai-command-grid\{[^}]*max-width:none/);
  assert.match(css, /#view-ai-assistant \.ai-conversation\{[^}]*min-height:0[^}]*overflow-y:auto/);
  assert.match(css, /#view-ai-assistant \.ai-chat-row\{[^}]*margin-top:auto/);
  assert.match(css, /\.ai-command-card\.is-fs-fallback/);
});
