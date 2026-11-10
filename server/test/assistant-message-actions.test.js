import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../../src/dashboard.js',import.meta.url),'utf8');
const storage=await readFile(new URL('../../src/assistant-conversation.js',import.meta.url),'utf8');

test('assistant messages provide copy with a Clipboard API fallback and confirmation',()=>{
  assert.match(source,/navigator\.clipboard&&navigator\.clipboard\.writeText/);
  assert.match(source,/document\.execCommand\("copy"\)/);
  assert.match(source,/button\.textContent="Copied"/);
  assert.match(source,/data-message-copy/);
});

test('user message editing saves on Enter, cancels on Escape, persists truncation, and preserves existing approvals',()=>{
  assert.match(source,/e\.key==="Escape"\).*?renderStoredTurns\(turns\)/);
  assert.match(source,/e\.key==="Enter"&&!e\.shiftKey/);
  assert.match(source,/assistantConversation\.replace\(next\)/);
  assert.match(source,/The earlier proposal is still in Approvals\./);
  assert.match(source,/handleQuery\(text,\{source:"edited"/);
  assert.match(storage,/function replace\(nextTurns\)/);
});
