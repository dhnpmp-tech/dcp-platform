'use strict';

// ── Renter workspace file API (presigned URLs to the per-renter MinIO bucket) ─
// Pairs with volumes.js (rent the bucket) + pods.js:820 (inject workspace_s3
// into the pod task_spec so the daemon restores/snapshots /workspace to this
// bucket). This route lets the RENTER manage files in their workspace volume
// from the browser: list, upload (single-PUT for small files + resumable
// multipart for large files), download, delete.
//
// Security model:
//  - requireRenter → req.renter.id (server-derived, never from the body).
//  - bucket = bucketFor(req.renter.id) → per-renter MinIO bucket (dcp-vol-r<id>).
//    A renter can only touch their own bucket; the bucket name is never client-
//    controlled. The MinIO hard quota (set by volume-provision.sh) is the hard
//    ceiling on total bytes — S3 rejects writes past the quota.
//  - key (object path) is sanitized: no '..' or '.' segments, no leading '/',
//    no NUL, max 512 chars. Subfolders via '/' are allowed.
//  - An active volume (renter_volumes status='active') is required for all ops —
//    refuses with 409 + a "rent a volume first" message otherwise.
//  - Presigned URLs are short-lived (15 min) and scoped to one object + one verb
//    (PUT/GET); they carry no list/delete capability.
//
// Uses @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner (Apache-2.0, no API key).

const express = require('express');
const {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const { requireRenter } = require('./pods');
const { activeVolumeForRenter } = require('./volumes');
const { bucketFor } = require('../lib/volume-store');

const router = express.Router();

const SIGNED_URL_TTL_SECONDS = 900; // 15 min
const MIN_PART_SIZE_BYTES = 5 * 1024 * 1024; // 5 MiB — S3 minimum part size (last part excepted)
const MAX_PARTS = 10000; // S3 maximum parts per multipart upload
const MAX_OBJECTS_LISTED = 1000;

// ── S3 client (lazy singleton) ───────────────────────────────────────────────
let _client = null;
function s3() {
  if (_client) return _client;
  const endpoint = process.env.WORKSPACE_S3_ENDPOINT;
  const accessKeyId = process.env.WORKSPACE_S3_KEY;
  const secretAccessKey = process.env.WORKSPACE_S3_SECRET;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('Workspace S3 not configured (WORKSPACE_S3_ENDPOINT/KEY/SECRET env vars missing).');
  }
  _client = new S3Client({
    endpoint,
    region: process.env.WORKSPACE_S3_REGION || 'us-east-1',
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true, // MinIO requires path-style addressing
  });
  return _client;
}

function configured() {
  return !!(process.env.WORKSPACE_S3_ENDPOINT && process.env.WORKSPACE_S3_KEY && process.env.WORKSPACE_S3_SECRET);
}

// ── key sanitization ─────────────────────────────────────────────────────────
function safeKey(input) {
  if (typeof input !== 'string' || input.length === 0 || input.length > 512) return null;
  if (input.includes('\0')) return null;
  const k = input.replace(/^\/+/, '');
  if (!k) return null;
  const segs = k.split('/');
  if (segs.some((s) => s === '..' || s === '.')) return null;
  return k;
}

// ── content-type sanitization ─────────────────────────────────────────────────
// Pins the Content-Type into the presigned PUT signature so the browser is
// bound to send the exact same header on the PUT (else MinIO rejects with
// SignatureDoesNotMatch) AND the stored object inherits a correct content-type
// instead of whatever the browser's fetch default is. Defaults to
// application/octet-stream for callers that don't care.
const DEFAULT_CONTENT_TYPE = 'application/octet-stream';
function safeContentType(input) {
  if (input == null) return DEFAULT_CONTENT_TYPE;
  if (typeof input !== 'string' || input.length === 0 || input.length > 128) return null;
  // RFC 7231 media-type shape: type "/" subtype. No params — params on a
  // presigned header would need separate handling and aren't useful here.
  if (!/^[a-zA-Z0-9!#$&^_\-.+]+\/[a-zA-Z0-9!#$&^_\-.+]+$/.test(input)) return null;
  return input;
}

// ── active-volume guard — returns the volume row or sends a 409 + null ───────
function requireActiveVolume(req, res) {
  const vol = activeVolumeForRenter(req.renter.id);
  if (!vol) {
    res.status(409).json({
      error: 'No active workspace volume. Rent one first to persist files across pods.',
      code: 'NO_ACTIVE_VOLUME',
      rent_endpoint: '/api/volumes/rent',
    });
    return null;
  }
  return vol;
}

function s3NotConfigured(res) {
  return res.status(503).json({ error: 'Workspace storage not configured.', code: 'S3_NOT_CONFIGURED' });
}

// ── GET /api/workspace/files?prefix= ─ list objects in the renter's bucket ────
router.get('/files', requireRenter, async (req, res) => {
  if (!configured()) return s3NotConfigured(res);
  const vol = requireActiveVolume(req, res);
  if (!vol) return;
  try {
    const prefix = typeof req.query.prefix === 'string' ? safeKey(req.query.prefix) : '';
    // Opaque S3 continuation token from a previous truncated response — pass it
    // back unchanged to page past MAX_OBJECTS_LISTED. Treated as opaque by the
    // client (it's an S3-internal cursor, not an offset).
    const continuationToken = typeof req.query.continuation_token === 'string' && req.query.continuation_token.length > 0
      ? req.query.continuation_token
      : undefined;
    const bucket = bucketFor(req.renter.id);
    const out = await s3().send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix ? prefix.replace(/\/$/, '') + '/' : '',
      MaxKeys: MAX_OBJECTS_LISTED,
      ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
    }));
    const files = (out.Contents || [])
      .map((o) => ({
        key: o.Key,
        size: o.Size,
        last_modified: o.LastModified ? o.LastModified.toISOString() : null,
      }))
      .filter((f) => f.key && !f.key.endsWith('/')); // drop folder placeholders
    return res.json({
      bucket,
      prefix: prefix || '',
      files,
      truncated: !!out.IsTruncated,
      // Present only when truncated=true. Pass back unchanged as ?continuation_token=
      // to fetch the next page; absent/null means the listing is complete.
      next_continuation_token: out.NextContinuationToken || null,
      volume: { size_gb: vol.size_gb, status: vol.status },
    });
  } catch (error) {
    console.error('[workspace] list error:', error.message);
    return res.status(500).json({ error: 'Failed to list workspace files.' });
  }
});

// ── POST /api/workspace/upload-url { key } ─ single-PUT presigned (small files)
// For files >= MIN_PART_SIZE_BYTES use the multipart endpoints (resumable).
router.post('/upload-url', requireRenter, async (req, res) => {
  if (!configured()) return s3NotConfigured(res);
  const vol = requireActiveVolume(req, res);
  if (!vol) return;
  const key = safeKey(req.body && req.body.key);
  if (!key) return res.status(400).json({ error: 'Invalid key.', code: 'INVALID_KEY' });
  const contentType = safeContentType(req.body && req.body.content_type);
  if (contentType === null) return res.status(400).json({ error: 'Invalid content_type.', code: 'INVALID_CONTENT_TYPE' });
  try {
    const bucket = bucketFor(req.renter.id);
    // ContentType is pinned into the presigned signature: the browser MUST send
    // this exact Content-Type header on the PUT (else MinIO rejects with
    // SignatureDoesNotMatch) and the stored object inherits it. See
    // safeContentType. The returned content_type tells the client what to send.
    const url = await getSignedUrl(
      s3(),
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
      { expiresIn: SIGNED_URL_TTL_SECONDS }
    );
    return res.json({
      url, method: 'PUT', key, bucket,
      expires_in: SIGNED_URL_TTL_SECONDS,
      min_part_bytes: MIN_PART_SIZE_BYTES,
      content_type: contentType,
    });
  } catch (error) {
    console.error('[workspace] upload-url error:', error.message);
    return res.status(500).json({ error: 'Failed to mint upload URL.' });
  }
});

// ── POST /api/workspace/download-url { key } ─ single-GET presigned ──────────
router.post('/download-url', requireRenter, async (req, res) => {
  if (!configured()) return s3NotConfigured(res);
  const vol = requireActiveVolume(req, res);
  if (!vol) return;
  const key = safeKey(req.body && req.body.key);
  if (!key) return res.status(400).json({ error: 'Invalid key.', code: 'INVALID_KEY' });
  try {
    const bucket = bucketFor(req.renter.id);
    const url = await getSignedUrl(
      s3(),
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: SIGNED_URL_TTL_SECONDS }
    );
    return res.json({ url, method: 'GET', key, bucket, expires_in: SIGNED_URL_TTL_SECONDS });
  } catch (error) {
    console.error('[workspace] download-url error:', error.message);
    return res.status(500).json({ error: 'Failed to mint download URL.' });
  }
});

// ── DELETE /api/workspace/files { key } ─ delete one object ───────────────────
router.delete('/files', requireRenter, async (req, res) => {
  if (!configured()) return s3NotConfigured(res);
  const vol = requireActiveVolume(req, res);
  if (!vol) return;
  const key = safeKey(req.body && req.body.key);
  if (!key) return res.status(400).json({ error: 'Invalid key.', code: 'INVALID_KEY' });
  try {
    const bucket = bucketFor(req.renter.id);
    await s3().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return res.json({ deleted: true, key });
  } catch (error) {
    console.error('[workspace] delete error:', error.message);
    return res.status(500).json({ error: 'Failed to delete file.' });
  }
});

// ── Resumable multipart upload (large files / resume wizard) ─────────────────
// Flow: start → (part-url per part) → complete (or abort). The frontend persists
// { key, upload_id, parts: [{part_number, etag}], size, uploaded_bytes } in
// localStorage so an interrupted upload resumes by requesting the next part URLs
// without re-uploading completed parts.

// POST /api/workspace/multipart/start { key } → { upload_id, key, min_part_bytes, max_parts }
router.post('/multipart/start', requireRenter, async (req, res) => {
  if (!configured()) return s3NotConfigured(res);
  const vol = requireActiveVolume(req, res);
  if (!vol) return;
  const key = safeKey(req.body && req.body.key);
  if (!key) return res.status(400).json({ error: 'Invalid key.', code: 'INVALID_KEY' });
  const contentType = safeContentType(req.body && req.body.content_type);
  if (contentType === null) return res.status(400).json({ error: 'Invalid content_type.', code: 'INVALID_CONTENT_TYPE' });
  try {
    const bucket = bucketFor(req.renter.id);
    // ContentType set on CreateMultipartUpload applies to the final object.
    // Same pin contract as /upload-url — the browser must send this Content-Type
    // on every part PUT.
    const out = await s3().send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: contentType }));
    if (!out.UploadId) throw new Error('No UploadId returned.');
    return res.json({
      upload_id: out.UploadId, key, bucket,
      min_part_bytes: MIN_PART_SIZE_BYTES, max_parts: MAX_PARTS,
      content_type: contentType,
    });
  } catch (error) {
    console.error('[workspace] multipart/start error:', error.message);
    return res.status(500).json({ error: 'Failed to start multipart upload.' });
  }
});

// POST /api/workspace/multipart/part-url { key, upload_id, part_number }
// → { url, method, part_number, expires_in }
router.post('/multipart/part-url', requireRenter, async (req, res) => {
  if (!configured()) return s3NotConfigured(res);
  const vol = requireActiveVolume(req, res);
  if (!vol) return;
  const key = safeKey(req.body && req.body.key);
  const uploadId = req.body && req.body.upload_id;
  const partNumber = Number(req.body && req.body.part_number);
  if (!key || !uploadId || !Number.isInteger(partNumber) || partNumber < 1 || partNumber > MAX_PARTS) {
    return res.status(400).json({ error: 'Invalid key, upload_id, or part_number.', code: 'INVALID_PART' });
  }
  try {
    const bucket = bucketFor(req.renter.id);
    const url = await getSignedUrl(
      s3(),
      new UploadPartCommand({ Bucket: bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }),
      { expiresIn: SIGNED_URL_TTL_SECONDS }
    );
    return res.json({ url, method: 'PUT', part_number: partNumber, expires_in: SIGNED_URL_TTL_SECONDS });
  } catch (error) {
    console.error('[workspace] multipart/part-url error:', error.message);
    return res.status(500).json({ error: 'Failed to mint part URL.' });
  }
});

// POST /api/workspace/multipart/complete { key, upload_id, parts: [{part_number, etag}] }
// → { location, key, bucket }
router.post('/multipart/complete', requireRenter, async (req, res) => {
  if (!configured()) return s3NotConfigured(res);
  const vol = requireActiveVolume(req, res);
  if (!vol) return;
  const key = safeKey(req.body && req.body.key);
  const uploadId = req.body && req.body.upload_id;
  const parts = Array.isArray(req.body && req.body.parts) ? req.body.parts : null;
  if (!key || !uploadId || !parts || parts.length === 0) {
    return res.status(400).json({ error: 'Invalid key, upload_id, or parts.', code: 'INVALID_COMPLETE' });
  }
  try {
    const bucket = bucketFor(req.renter.id);
    const out = await s3().send(new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts
          .map((p) => ({ PartNumber: Number(p.part_number), ETag: String(p.etag) }))
          .sort((a, b) => a.PartNumber - b.PartNumber),
      },
    }));
    return res.json({ location: out.Location || null, key, bucket });
  } catch (error) {
    console.error('[workspace] multipart/complete error:', error.message);
    return res.status(500).json({ error: 'Failed to complete multipart upload.' });
  }
});

// POST /api/workspace/multipart/abort { key, upload_id } — cancel + free storage
router.post('/multipart/abort', requireRenter, async (req, res) => {
  if (!configured()) return s3NotConfigured(res);
  const vol = requireActiveVolume(req, res);
  if (!vol) return;
  const key = safeKey(req.body && req.body.key);
  const uploadId = req.body && req.body.upload_id;
  if (!key || !uploadId) return res.status(400).json({ error: 'Invalid key or upload_id.', code: 'INVALID_ABORT' });
  try {
    const bucket = bucketFor(req.renter.id);
    await s3().send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId }));
    return res.json({ aborted: true, key });
  } catch (error) {
    console.error('[workspace] multipart/abort error:', error.message);
    return res.status(500).json({ error: 'Failed to abort multipart upload.' });
  }
});

module.exports = router;