import { createHash, randomUUID } from 'node:crypto';
import express from 'express';
import { PDFDocument } from 'pdf-lib';
import { rbac } from '../middleware/auth.js';
import { auditApiAction } from '../services/audit.js';
import { createGeminiDocumentOCRProvider, validateDocumentExtraction } from '../services/documentOcr.js';

export const DOCUMENT_BUCKET = 'novapay-documents';
const MIME_TYPES = new Map([
  ['application/pdf', { extension: 'pdf', signature: (bytes) => bytes.subarray(0, 5).toString('ascii') === '%PDF-' }],
  ['image/png', { extension: 'png', signature: (bytes) => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) }],
  ['image/jpeg', { extension: 'jpg', signature: (bytes) => bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) }],
]);

function publicError(statusCode, code, message) {
  return Object.assign(new Error(message), { statusCode, code });
}

function safeFilename(value, extension) {
  const normalized = String(value || 'document').normalize('NFKC').replace(/[/\\\0-\x1f\x7f]/g, '_').trim();
  const stem = normalized.replace(/\.[^.]*$/, '').replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 100).trim() || 'document';
  return `${stem}.${extension}`;
}

async function pageCount(mime, bytes) {
  if (mime !== 'application/pdf') return 1;
  try {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
    return pdf.getPageCount();
  } catch {
    throw publicError(400, 'INVALID_DOCUMENT', 'The PDF could not be read. Upload an unencrypted, valid PDF.');
  }
}

export function documentRoutes({ config, identity, provider, rag, events }) {
  const router = express.Router();
  const ocrProvider = provider || createGeminiDocumentOCRProvider({ apiKey: config.GEMINI_API_KEY, model: config.DOCUMENT_OCR_MODEL || 'gemini-3.5-flash-lite', timeoutMs: config.DOCUMENT_OCR_TIMEOUT_MS || 25000, events });
  const maxFileMb = config.DOCUMENT_MAX_FILE_MB || 10;
  const maxPages = config.DOCUMENT_MAX_PAGES || 10;
  const maxBytes = maxFileMb * 1024 * 1024;

  router.get('/documents', async (req, res, next) => {
    try {
      const db = identity?.database;
      if (!db?.select) throw publicError(503, 'DOCUMENT_LIST_UNAVAILABLE', 'Document list is unavailable.');
      const query = new URLSearchParams({
        select: 'id,filename,mime_type,byte_size,page_count,status,duplicate_of,extraction,created_at,updated_at',
        org_id: `eq.${req.orgId}`, order: 'created_at.desc', limit: '100',
      }).toString();
      const rows = await db.select('documents', query);
      return res.json({ documents: Array.isArray(rows) ? rows : [], role: req.orgRole });
    } catch (error) { return next(error); }
  });

  router.get('/documents/:documentId', async (req, res, next) => {
    try {
      const documentId = zodUuid(req.params.documentId);
      if (!documentId) throw publicError(400, 'DOCUMENT_ID_INVALID', 'A valid document ID is required.');
      const db = identity?.database;
      if (!db?.select) throw publicError(503, 'DOCUMENT_LIST_UNAVAILABLE', 'Document lookup is unavailable.');
      const query = new URLSearchParams({
        select: 'id,filename,mime_type,byte_size,page_count,status,duplicate_of,extraction,created_at,updated_at',
        id: `eq.${documentId}`, org_id: `eq.${req.orgId}`, limit: '1',
      }).toString();
      const rows = await db.select('documents', query);
      const document = Array.isArray(rows) ? rows[0] : null;
      if (!document) throw publicError(404, 'DOCUMENT_NOT_FOUND', 'Document not found.');
      return res.json({ document });
    } catch (error) { return next(error); }
  });

  router.post('/documents/:documentId/process', rbac(['owner', 'admin', 'accountant']), async (req, res, next) => {
    let usageId = null;
    let usageFinalized = false;
    let documentId;
    try {
      const uuid = zodUuid(req.params.documentId);
      if (!uuid) throw publicError(400, 'DOCUMENT_ID_INVALID', 'A valid document ID is required.');
      documentId = uuid;
      if (!config.GEMINI_API_KEY && !provider) throw publicError(503, 'OCR_NOT_CONFIGURED', 'Document OCR is not configured.');
      const db = identity?.database;
      if (!db?.select || !db?.rpc || !identity?.storage?.download) throw publicError(503, 'DOCUMENT_PROCESSING_UNAVAILABLE', 'Document processing is unavailable.');
      const select = (params) => new URLSearchParams(params).toString();
      const rows = await db.select('documents', select({ select: 'id,org_id,uploaded_by,filename,mime_type,byte_size,page_count,storage_path,sha256,status,duplicate_of,extraction,updated_at', id: `eq.${documentId}`, org_id: `eq.${req.orgId}`, limit: '1' }));
      const document = Array.isArray(rows) ? rows[0] : null;
      if (!document) throw publicError(404, 'DOCUMENT_NOT_FOUND', 'Document not found.');
      if (document.status === 'processed') return res.json({ document: { id: document.id, status: document.status, extraction: document.extraction }, cached: true });
      if (document.status !== 'uploaded') throw publicError(409, 'DOCUMENT_NOT_READY', 'Document is not available for processing.');

      const matches = await db.select('documents', select({ select: 'id', org_id: `eq.${req.orgId}`, sha256: `eq.${document.sha256}`, id: `neq.${documentId}`, order: 'created_at.asc', limit: '1' }));
      const duplicate = Array.isArray(matches) ? matches[0] : null;
      if (duplicate) {
        await db.patch('documents', select({ id: `eq.${documentId}`, org_id: `eq.${req.orgId}`, status: 'eq.uploaded' }), {
          status: 'rejected', duplicate_of: duplicate.id, extraction: { duplicateOf: duplicate.id, reason: 'duplicate_document' }, updated_at: new Date().toISOString(),
        });
        await auditApiAction(identity, req, { action: 'document.rejected', entity: 'document', entityId: documentId, metadata: { reason: 'duplicate_document', duplicateOf: duplicate.id } });
        return res.status(409).json({ error: { code: 'DUPLICATE_DOCUMENT', message: 'This document duplicates another file in the organization.' }, duplicateOf: duplicate.id });
      }

      const claim = await db.rpc('claim_document_processing', {
        p_org: req.orgId, p_document: documentId, p_actor: req.user.id,
        p_concurrent_limit: config.DOCUMENT_MAX_CONCURRENT_JOBS_PER_ORG || 2,
      });
      if (!claim?.claimed) throw publicError(409, claim?.reason === 'concurrency_limit' ? 'DOCUMENT_PROCESSING_LIMIT' : 'DOCUMENT_NOT_READY', claim?.reason === 'concurrency_limit' ? 'The organization already has the maximum number of document jobs running.' : 'Document is no longer available for processing.');

      let reserved;
      try {
        reserved = await db.rpc('reserve_ai_usage', {
          p_org: req.orgId, p_user: req.user.id, p_route: 'ocr', p_model: config.DOCUMENT_OCR_MODEL || 'gemini-3.5-flash-lite',
          p_input_tokens: Math.max(1, Number(document.page_count) * 258 + 200),
          p_user_limit: config.AI_DAILY_USER_LIMIT || 5, p_org_limit: config.AI_DAILY_ORG_LIMIT || 20,
        });
      } catch (error) {
        await db.patch('documents', select({ id: `eq.${documentId}`, org_id: `eq.${req.orgId}`, status: 'eq.processing' }), { status: 'uploaded', updated_at: new Date().toISOString() }).catch(() => {});
        throw error;
      }
      if (!reserved?.allowed) {
        await db.patch('documents', select({ id: `eq.${documentId}`, org_id: `eq.${req.orgId}`, status: 'eq.processing' }), { status: 'uploaded', updated_at: new Date().toISOString() });
        throw publicError(429, 'AI_DAILY_LIMIT', 'The daily AI request limit has been reached. Try again after the UTC day reset.');
      }
      usageId = reserved.usageId || reserved.usage_id;
      if (!usageId) {
        await db.patch('documents', select({ id: `eq.${documentId}`, org_id: `eq.${req.orgId}`, status: 'eq.processing' }), { status: 'uploaded', updated_at: new Date().toISOString() });
        throw publicError(503, 'AI_USAGE_UNAVAILABLE', 'The OCR usage reservation could not be recorded.');
      }

      const started = Date.now();
      try {
        const bytes = await identity.storage.download(DOCUMENT_BUCKET, document.storage_path);
        const result = await ocrProvider.extract({ mimeType: document.mime_type, bytes, pageCount: document.page_count });
        const normalized = validateDocumentExtraction(result.text);
        if (!rag?.indexDocument) throw publicError(503, 'DOCUMENT_INDEX_UNAVAILABLE', 'Document indexing is unavailable.');
        const index = await rag.indexDocument({ orgId: req.orgId, userId: req.user.id, documentId, fields: normalized.fields });
        await db.rpc('complete_ai_usage', {
          p_usage_id: usageId, p_input_tokens: Number(result.usage?.inputTokens || Math.max(1, Number(document.page_count) * 258 + 200)),
          p_output_tokens: Number(result.usage?.outputTokens || 0), p_latency_ms: Date.now() - started,
          p_model: result.model || config.DOCUMENT_OCR_MODEL || 'gemini-3.5-flash-lite', p_status: 'completed',
        });
        usageFinalized = true;
        const extraction = { ...normalized, model: result.model || config.DOCUMENT_OCR_MODEL || 'gemini-3.5-flash-lite', ...(index ? { index } : {}) };
        await db.patch('documents', select({ id: `eq.${documentId}`, org_id: `eq.${req.orgId}`, status: 'eq.processing' }), { status: 'processed', extraction, updated_at: new Date().toISOString() });
        return res.json({ document: { id: documentId, status: 'processed', extraction }, cached: false });
      } catch (error) {
        if (usageId && !usageFinalized) {
          const invalid = error?.code === 'OCR_INVALID_RESPONSE' || error?.code === 'OCR_FIELD_VALIDATION';
          await db.rpc('complete_ai_usage', {
            p_usage_id: usageId, p_input_tokens: Math.max(1, Number(document.page_count) * 258 + 200), p_output_tokens: 0,
            p_latency_ms: Date.now() - started, p_model: config.DOCUMENT_OCR_MODEL || 'gemini-3.5-flash-lite', p_status: invalid ? 'invalid_response' : 'error',
          }).catch(() => {});
          usageFinalized = true;
        }
        await db.patch('documents', select({ id: `eq.${documentId}`, org_id: `eq.${req.orgId}`, status: 'eq.processing' }), {
          status: 'failed', extraction: { errorCode: error?.code || 'OCR_FAILED' }, updated_at: new Date().toISOString(),
        }).catch(() => {});
        throw error;
      }
    } catch (error) {
      return next(error);
    }
  });

  router.post('/documents/:documentId/confirm', express.json({ limit: '64kb' }), rbac(['owner', 'admin', 'accountant']), async (req, res, next) => {
    try {
      const documentId = zodUuid(req.params.documentId);
      if (!documentId) throw publicError(400, 'DOCUMENT_ID_INVALID', 'A valid document ID is required.');
      const db = identity?.database;
      if (!db?.select || !db?.patch) throw publicError(503, 'DOCUMENT_PROCESSING_UNAVAILABLE', 'Document review is unavailable.');
      const query = new URLSearchParams({ select: 'id,org_id,status,extraction', id: `eq.${documentId}`, org_id: `eq.${req.orgId}`, limit: '1' }).toString();
      const rows = await db.select('documents', query);
      const document = Array.isArray(rows) ? rows[0] : null;
      if (!document) throw publicError(404, 'DOCUMENT_NOT_FOUND', 'Document not found.');
      if (document.status !== 'processed') throw publicError(409, 'DOCUMENT_NOT_READY', 'Only processed documents can be confirmed.');
      const invoiceDraftId = zodUuid(req.body?.invoiceDraftId) ? req.body.invoiceDraftId : null;
      const extraction = { ...(document.extraction && typeof document.extraction === 'object' ? document.extraction : {}), confirmation: { confirmedAt: new Date().toISOString(), confirmedBy: req.user.id, ...(invoiceDraftId ? { invoiceDraftId } : {}) } };
      const updated = await db.patch('documents', new URLSearchParams({ id: `eq.${documentId}`, org_id: `eq.${req.orgId}`, status: 'eq.processed' }).toString(), { extraction, updated_at: new Date().toISOString() });
      if (!Array.isArray(updated) || !updated.length) throw publicError(409, 'DOCUMENT_NOT_READY', 'Document changed before it could be confirmed.');
      await auditApiAction(identity, req, { action: 'document.confirmed', entity: 'document', entityId: documentId });
      return res.json({ document: { id: documentId, status: 'processed', extraction }, confirmed: true });
    } catch (error) { return next(error); }
  });

  router.post('/documents/:documentId/reject', express.json({ limit: '64kb' }), rbac(['owner', 'admin', 'accountant']), async (req, res, next) => {
    try {
      const documentId = zodUuid(req.params.documentId);
      if (!documentId) throw publicError(400, 'DOCUMENT_ID_INVALID', 'A valid document ID is required.');
      const db = identity?.database;
      if (!db?.select || !db?.patch) throw publicError(503, 'DOCUMENT_PROCESSING_UNAVAILABLE', 'Document review is unavailable.');
      const query = new URLSearchParams({ select: 'id,status,extraction', id: `eq.${documentId}`, org_id: `eq.${req.orgId}`, limit: '1' }).toString();
      const rows = await db.select('documents', query);
      const document = Array.isArray(rows) ? rows[0] : null;
      if (!document) throw publicError(404, 'DOCUMENT_NOT_FOUND', 'Document not found.');
      if (!['uploaded', 'processed', 'failed'].includes(document.status)) throw publicError(409, 'DOCUMENT_NOT_READY', 'Document cannot be rejected in its current state.');
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 300) : '';
      const extraction = { ...(document.extraction && typeof document.extraction === 'object' ? document.extraction : {}), rejection: { reason: reason || null, rejectedAt: new Date().toISOString(), rejectedBy: req.user.id } };
      const updated = await db.patch('documents', new URLSearchParams({ id: `eq.${documentId}`, org_id: `eq.${req.orgId}`, status: `eq.${document.status}` }).toString(), { status: 'rejected', extraction, updated_at: new Date().toISOString() });
      if (!Array.isArray(updated) || !updated.length) throw publicError(409, 'DOCUMENT_NOT_READY', 'Document changed before it could be rejected.');
      await auditApiAction(identity, req, { action: 'document.rejected', entity: 'document', entityId: documentId, metadata: { reason: reason || 'manual_review' } });
      return res.json({ document: { id: documentId, status: 'rejected' }, rejected: true });
    } catch (error) { return next(error); }
  });

  router.delete('/documents/:documentId', rbac(['owner', 'admin', 'accountant']), async (req, res, next) => {
    try {
      const documentId = zodUuid(req.params.documentId);
      if (!documentId) throw publicError(400, 'DOCUMENT_ID_INVALID', 'A valid document ID is required.');
      const db = identity?.database;
      if (!db?.select || !db?.rpc || !identity?.storage?.download || !identity?.storage?.remove || !identity?.storage?.upload) throw publicError(503, 'DOCUMENT_DELETE_UNAVAILABLE', 'Document deletion is unavailable.');
      const query = new URLSearchParams({ select: 'id,storage_path,mime_type,status', id: `eq.${documentId}`, org_id: `eq.${req.orgId}`, limit: '1' }).toString();
      const rows = await db.select('documents', query);
      const document = Array.isArray(rows) ? rows[0] : null;
      if (!document) throw publicError(404, 'DOCUMENT_NOT_FOUND', 'Document not found.');
      if (document.status === 'processing') throw publicError(409, 'DOCUMENT_NOT_READY', 'Wait for document processing to finish before deleting.');
      const bytes = await identity.storage.download(DOCUMENT_BUCKET, document.storage_path);
      await identity.storage.remove(DOCUMENT_BUCKET, [document.storage_path]);
      let storagePath;
      try {
        storagePath = await db.rpc('delete_document', { p_org: req.orgId, p_document: documentId, p_actor: req.user.id, p_request_id: req.id });
      } catch (error) {
        await identity.storage.upload(DOCUMENT_BUCKET, document.storage_path, bytes, document.mime_type).catch(() => {});
        throw error;
      }
      if (!storagePath) {
        await identity.storage.upload(DOCUMENT_BUCKET, document.storage_path, bytes, document.mime_type).catch(() => {});
        throw publicError(404, 'DOCUMENT_NOT_FOUND', 'Document not found.');
      }
      return res.json({ document: { id: documentId, deleted: true }, removedStorageObject: true, removedChunksAndSearchHits: true });
    } catch (error) { return next(error); }
  });

  router.post('/documents', express.raw({ type: [...MIME_TYPES.keys()], limit: maxBytes }), rbac(['owner', 'admin', 'accountant']), async (req, res, next) => {
    try {
      const mime = (req.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
      const format = MIME_TYPES.get(mime);
      if (!format || !Buffer.isBuffer(req.body) || req.body.length === 0) throw publicError(415, 'UNSUPPORTED_DOCUMENT', 'Upload a non-empty PDF, PNG, or JPEG document.');
      if (req.body.length > maxBytes) throw publicError(413, 'DOCUMENT_TOO_LARGE', `Documents may not exceed ${maxFileMb} MB.`);
      if (!format.signature(req.body)) throw publicError(400, 'INVALID_DOCUMENT', 'The file contents do not match the declared document type.');
      const pages = await pageCount(mime, req.body);
      if (pages < 1 || pages > maxPages) throw publicError(413, 'DOCUMENT_PAGE_LIMIT', `Documents may not exceed ${maxPages} pages.`);
      if (!identity?.storage || !identity?.database?.rpc) throw publicError(503, 'DOCUMENT_STORAGE_UNAVAILABLE', 'Document upload is unavailable.');

      const documentId = randomUUID();
      const filename = safeFilename(req.get('x-file-name'), format.extension);
      const objectPath = `${req.orgId}/${documentId}/${filename}`;
      await identity.storage.upload(DOCUMENT_BUCKET, objectPath, req.body, mime);
      let document;
      try {
        document = await identity.database.rpc('reserve_document_upload', {
          p_org: req.orgId,
          p_document: documentId,
          p_owner: req.user.id,
          p_filename: filename,
          p_mime_type: mime,
          p_byte_size: req.body.length,
          p_page_count: pages,
          p_storage_path: objectPath,
          p_sha256: createHash('sha256').update(req.body).digest('hex'),
          p_hourly_limit: config.DOCUMENT_MAX_UPLOADS_PER_ORG_PER_HOUR || 20,
          p_request_id: req.id,
        });
      } catch (error) {
        await identity.storage.remove(DOCUMENT_BUCKET, [objectPath]).catch(() => {});
        throw error;
      }
      return res.status(201).json({ document: document || { id: documentId, status: 'uploaded', filename, mimeType: mime, byteSize: req.body.length, pageCount: pages } });
    } catch (error) {
      return next(error);
    }
  });
  return router;
}

function zodUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}
