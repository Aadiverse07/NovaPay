import { createHash, randomUUID } from 'node:crypto';
import express from 'express';
import { PDFDocument } from 'pdf-lib';
import { rbac } from '../middleware/auth.js';

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

export function documentRoutes({ config, identity }) {
  const router = express.Router();
  const maxFileMb = config.DOCUMENT_MAX_FILE_MB || 10;
  const maxPages = config.DOCUMENT_MAX_PAGES || 10;
  const maxBytes = maxFileMb * 1024 * 1024;
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
