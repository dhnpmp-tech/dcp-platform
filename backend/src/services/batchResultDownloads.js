'use strict';

const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const DEFAULT_SIGNED_URL_TTL_SECONDS = 900;
const MIN_SIGNED_URL_TTL_SECONDS = 60;
const MAX_SIGNED_URL_TTL_SECONDS = 3600;
const MAX_STORAGE_KEY_LENGTH = 512;

let cachedClient = null;
let cachedClientSignature = null;

function getBatchResultDownloadConfig(env = process.env) {
  const bucket = stringOrNull(env.BATCH_RESULTS_S3_BUCKET);
  const endpoint = stringOrNull(env.BATCH_RESULTS_S3_ENDPOINT || env.WORKSPACE_S3_ENDPOINT);
  const accessKeyId = stringOrNull(env.BATCH_RESULTS_S3_KEY || env.WORKSPACE_S3_KEY);
  const secretAccessKey = stringOrNull(env.BATCH_RESULTS_S3_SECRET || env.WORKSPACE_S3_SECRET);
  const region = stringOrNull(env.BATCH_RESULTS_S3_REGION || env.WORKSPACE_S3_REGION) || 'us-east-1';
  const expiresIn = normalizeTtlSeconds(env.BATCH_RESULTS_SIGNED_URL_TTL_SECONDS);
  const forcePathStyle = parseBoolean(env.BATCH_RESULTS_S3_FORCE_PATH_STYLE, true);

  const missing = [];
  if (!bucket) missing.push('BATCH_RESULTS_S3_BUCKET');
  if (!endpoint) missing.push('BATCH_RESULTS_S3_ENDPOINT');
  if (!accessKeyId) missing.push('BATCH_RESULTS_S3_KEY');
  if (!secretAccessKey) missing.push('BATCH_RESULTS_S3_SECRET');

  return {
    configured: missing.length === 0,
    missing,
    bucket,
    endpoint,
    accessKeyId,
    secretAccessKey,
    region,
    expiresIn,
    forcePathStyle,
  };
}

async function signBatchResultDownload(manifest, options = {}) {
  if (!manifest || !manifest.results_available) {
    return disabledDownload('wait_for_completed_batch_result_key_and_checksum');
  }

  const storageKey = normalizeStorageKey(manifest.result_storage_key);
  if (!storageKey || !isScopedBatchResultKey(storageKey, manifest.renter_id, manifest.batch_id)) {
    return disabledDownload('batch_result_storage_key_scope_invalid');
  }

  const config = options.config || getBatchResultDownloadConfig(options.env || process.env);
  if (!config.configured) {
    return disabledDownload('configure_batch_result_object_store', {
      download_configured: false,
      missing_config: config.missing,
    });
  }

  const now = options.now instanceof Date ? options.now : new Date();
  const expiresAt = new Date(now.getTime() + config.expiresIn * 1000).toISOString();
  const client = options.s3Client || getS3Client(config);
  const presigner = options.getSignedUrl || getSignedUrl;
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: storageKey,
    ResponseContentType: 'application/jsonl',
  });
  const url = await presigner(client, command, { expiresIn: config.expiresIn });

  return {
    download_enabled: true,
    download_url: url,
    download_method: 'GET',
    download_expires_in: config.expiresIn,
    download_expires_at: expiresAt,
    download_configured: true,
    next: 'download_batch_result_jsonl',
  };
}

function disabledDownload(next, extra = {}) {
  return {
    download_enabled: false,
    download_url: null,
    download_method: null,
    download_expires_in: null,
    download_expires_at: null,
    next,
    ...extra,
  };
}

function getS3Client(config) {
  const signature = [
    config.endpoint,
    config.region,
    config.accessKeyId,
    config.secretAccessKey,
    config.forcePathStyle ? 'path' : 'host',
  ].join('|');
  if (cachedClient && cachedClientSignature === signature) return cachedClient;
  cachedClientSignature = signature;
  cachedClient = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: config.forcePathStyle,
  });
  return cachedClient;
}

function normalizeStorageKey(value) {
  if (typeof value !== 'string') return null;
  const key = value.trim().replace(/^\/+/, '');
  if (!key || key.length > MAX_STORAGE_KEY_LENGTH || key.includes('\0')) return null;
  const segments = key.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return null;
  return key;
}

function isScopedBatchResultKey(key, renterId, batchId) {
  const ownerId = Number(renterId);
  if (!Number.isInteger(ownerId) || ownerId <= 0) return false;
  if (typeof batchId !== 'string' || !/^batch_[a-z0-9][a-z0-9_-]{5,63}$/.test(batchId)) return false;
  return key.startsWith(`batch-results/renter-${ownerId}/${batchId}/`);
}

function normalizeTtlSeconds(value) {
  if (value == null || value === '') return DEFAULT_SIGNED_URL_TTL_SECONDS;
  const n = Number(value);
  if (!Number.isInteger(n)) return DEFAULT_SIGNED_URL_TTL_SECONDS;
  return Math.max(MIN_SIGNED_URL_TTL_SECONDS, Math.min(MAX_SIGNED_URL_TTL_SECONDS, n));
}

function parseBoolean(value, defaultValue) {
  if (value == null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function stringOrNull(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function resetBatchResultDownloadClientForTests() {
  cachedClient = null;
  cachedClientSignature = null;
}

module.exports = {
  DEFAULT_SIGNED_URL_TTL_SECONDS,
  getBatchResultDownloadConfig,
  signBatchResultDownload,
  __test: {
    disabledDownload,
    getS3Client,
    isScopedBatchResultKey,
    normalizeStorageKey,
    normalizeTtlSeconds,
    parseBoolean,
    resetBatchResultDownloadClientForTests,
  },
};
