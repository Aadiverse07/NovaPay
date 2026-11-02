import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../../src/documents.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../../dashboard.html', import.meta.url), 'utf8');
const apiClient = await readFile(new URL('../../src/api-client.js', import.meta.url), 'utf8');

test('Documents waits for auth and uses organization-scoped API list and mutations', () => {
  assert.match(source, /if \(auth && auth\.ready\) await auth\.ready/);
  assert.match(source, /auth\.mode !== "supabase" \|\| !auth\.isAuthenticated\(\)/);
  assert.match(source, /api\.request\("\/api\/documents"\)/);
  assert.match(source, /api\.request\("\/api\/documents\/" \+ encodeURIComponent\(doc\.id\), \{ method: "DELETE" \}\)/);
  assert.match(apiClient, /X-Org-Id/);
});

test('Documents has no sample rows in authenticated mode and exposes empty, retry, reason and review states', () => {
  assert.match(source, /No documents have been uploaded to this organization yet\./);
  assert.match(source, /Document data is unavailable\. No sample records are shown\./);
  assert.match(source, /documents-retry/);
  assert.match(source, /No stored reason; re-upload to get details\./);
  assert.match(source, /validationIssues/);
  assert.match(source, /Possible duplicate of/);
  assert.match(html, /id="documents-retry"/);
  assert.doesNotMatch(source, /sampleDocumentRows|illustrativeDocumentRows/i);
});

test('document deletion is role-gated and confirms cascade impact before API request', () => {
  assert.match(source, /if \(canWrite\(\)\) \{ var remove/);
  assert.match(source, /Delete this document\? Its file and search data are removed\. This cannot be undone\./);
  assert.match(source, /if \(!doc \|\| busy \|\| !canWrite\(\)\) return/);
});
