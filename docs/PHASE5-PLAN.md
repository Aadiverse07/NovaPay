# Phase 5 Plan — RAG and OCR

**Status:** Planning only; awaiting `PLAN OK`. No Phase 5 implementation code has been written.

## Scope and source reconciliation

The Blueprint's numbered **Phase 5 — RAG and OCR** section and copy-paste prompt define this plan. It covers private document upload, OCR and field validation, duplicate flags, tenant-isolated hybrid retrieval, grounded AI answers, and a Documents review UI. The section is on PDF page 15 (timing: Week 4); its detailed prompt and acceptance checks are on page 28.

`PaypalFinal.png` labels a **Week 5** roadmap card “Advanced Features” and lists fundraising/maintenance fund management, invoice automation, rate limiting/security, and UX polish. That week label does not match the Blueprint's numbered Phase 5 (RAG/OCR). Do not fold those Week 5 bullets into this Phase 5 implementation; fundraising and maintenance transparency are already covered by the Phase 6 work. Keep this discrepancy recorded in `docs/DECISIONS.md`.

The existing `dashboard.html` already contains a Documents view and `src/modules.js` currently presents sample-only upload/review actions. Phase 5 should wire that view without redesign or edits to protected design files.

## Ordered tasks

1. **Resolve provider and limit decisions before schema work.** Select and record an OCR provider and an embedding provider/model/dimension in `docs/DECISIONS.md`. Define configurable max file size/pages, per-org concurrency/rate limits, retention and retry behavior. The existing Documents UI says 10 MB; make the server limit authoritative and keep the UI copy consistent. Document an antivirus hook point in `docs/RUNBOOK.md` if scanning is not implemented.
2. **Add private persistence and retrieval schema.** Add `supabase/migrations/0015_documents_rag.sql` (never modify migrations 0001–0014). Enable pgvector if not already available. Create org-scoped document metadata and `document_chunks` with `org_id`, `document_id`, text, chosen-dimension embedding, full-text vector and metadata; private Storage bucket/object policies; indexes; and a hybrid search SQL function that requires verified org context and applies authorization/metadata filters before returning results. Ensure update re-indexing and document deletion remove all chunks/search hits. Any SECURITY DEFINER/search RPC must be service-role-only and tested with an ordinary JWT expecting 403.
3. **Implement bounded upload and processing.** Add authenticated document endpoints with PDF/PNG/JPG allow-list, file magic-byte validation, configured size/page limits, per-org concurrency/rate limits, private Storage writes, processing state, safe failure/retry handling, and no public file URLs. Store a file hash and enforce org-scoped duplicate checks; flag hash and fuzzy `(vendor, invoice number, total)` matches rather than dropping uploads.
4. **Implement OCR and validation.** Add `server/src/services/ocr.js` behind a provider interface. Extract vendor, invoice number, dates, currency, line items, tax and total with per-field confidence. Validate line-item/subtotal/tax/total arithmetic, currency and dates. Mark low-confidence or invalid fields for human review. Extraction is not proof that an invoice is genuine.
5. **Implement embeddings, hybrid search, and grounded answers.** Index only OCR text and the Blueprint-approved sources (approved policies, transaction descriptions, quotations/work orders and campaign descriptions). Do not use vectors for balances, totals or statuses; use SQL for those. Merge full-text and vector results with reciprocal-rank fusion, always scoped to verified organization and permissions. Delete/re-index chunks on document deletion/update. Connect the existing OCR router branch and retrieval answer flow; use server-built evidence, untrusted-text delimiters, citations, and an insufficient-evidence response.
6. **Wire the existing Documents view.** Replace sample-only handlers with upload/processing status, extracted-field review with confidence flags, confirm/reject, duplicate and arithmetic warnings, and links to an invoice or transaction. Confirming may create an invoice draft only; it must not send an invoice or execute a payment. Use existing component classes/tokens; no redesign.
7. **Document and verify.** Update the API/Frontend contract, runbook, environment-key names, and tests. Keep browser-only checks explicitly UNVERIFIED until a human runs them.

## Planned files

| Area | Planned files |
|---|---|
| Database/storage | New `supabase/migrations/0015_documents_rag.sql` |
| API | New `server/src/routes/documents.js`; update `server/src/app.js`, `server/src/config.js` |
| OCR/RAG/providers | New `server/src/services/ocr.js`, `server/src/services/embeddings.js`, `server/src/services/rag.js`; update `server/src/services/ai.js`, `server/src/ai/router.js` |
| Persistence | Update `server/src/repos/postgres.js` and `server/src/repos/memory.js` |
| UI | Update `src/modules.js`; add `src/documents.js` only if separation is needed; make minimal `dashboard.html` markup changes only if existing fields cannot express the workflow. Do not edit protected CSS/tokens/assets. |
| Tests | Add document upload/OCR/RAG/route/migration tests under `server/test/`; update `server/test/ai-router.test.js` and `server/test/ai.test.js` for OCR/retrieval routing and injection behavior. |
| Docs/config | Update `docs/API.md`, `docs/FRONTEND-CONTRACT.md`, `docs/RUNBOOK.md`, `.env.example` (key names only), `docs/DECISIONS.md`, `docs/TEST-REPORT.md`, `docs/CONTEXT.md`, `docs/WORKLOG.md`. |

Provider selection and vector dimension are gates before the migration is authored. The exact max-page and concurrency defaults also need to be recorded before upload implementation; the Blueprint names these limits but does not supply numeric values.

## Acceptance checks

All rows below are **UNVERIFIED** until Phase 5 is approved, implemented and each check is actually run.

| Check | Acceptance result | Status now |
|---|---|---|
| Upload validation | PDF/PNG/JPG with matching magic bytes accepted; unsupported type, mismatch, over-size/page files rejected safely; per-org concurrency/rate limits enforced | UNVERIFIED |
| Storage privacy | Bucket private; RLS/object access is organization-scoped; no cross-tenant download | UNVERIFIED |
| Extraction | Required fields and per-field confidence returned; wrong arithmetic, invalid currency/date and low confidence are flagged for review | UNVERIFIED |
| Duplicate detection | Same file hash and fuzzy vendor/number/total match are flagged, never silently discarded | UNVERIFIED |
| Tenant isolation | Org B cannot retrieve Org A chunks through any API or SQL function; membership and role checks pass | UNVERIFIED |
| Grounded retrieval | Hybrid search scopes before returning results; citations refer to returned evidence; weak retrieval yields insufficient evidence | UNVERIFIED |
| Prompt injection | Hidden instructions in document text cannot alter assistant behavior | UNVERIFIED |
| Re-index/delete | Updating a document refreshes chunks; deleting it removes chunks and search hits | UNVERIFIED |
| UI review | Upload lifecycle, confidence highlighting, confirm/reject and draft link work without redesign; invoice send remains disabled/simulated | UNVERIFIED |
| Regression/security | `npm test`, `npm run check:migrations`, changed-file `node --check`, RLS/API isolation, upload-limit tests, and `git diff --check` pass | UNVERIFIED |
| Browser | Documents view, console/network, theme and mobile checks | UNVERIFIED; human run required |

## Simulation and safety boundaries

- OCR extraction and retrieval are evidence aids, not proof an invoice is genuine; humans review low-confidence and flagged fields.
- Antivirus is a documented hook point only unless separately implemented and verified; never label an unscanned document as scanned.
- Existing invoice sending and maintenance payouts remain **SIMULATED**. Confirming an extracted invoice can create only a draft; this phase does not execute payments or send invoices.
- Any sample document remains clearly labelled demo data and is never shown as authenticated organization data.
- No secrets or key values go in browser code, plans or logs.
