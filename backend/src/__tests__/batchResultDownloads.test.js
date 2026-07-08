'use strict';

const { GetObjectCommand } = require('@aws-sdk/client-s3');
const {
  getBatchResultDownloadConfig,
  signBatchResultDownload,
  __test,
} = require('../services/batchResultDownloads');

function completedManifest(overrides = {}) {
  return {
    batch_id: 'batch_result01',
    renter_id: 7,
    status: 'completed',
    results_available: true,
    result_storage_key: 'batch-results/renter-7/batch_result01/output.jsonl',
    result_checksum_sha256: 'c'.repeat(64),
    result_normalized_bytes: 1024,
    ...overrides,
  };
}

describe('batch result download signer', () => {
  afterEach(() => {
    __test.resetBatchResultDownloadClientForTests();
  });

  test('reports missing object-store config without signing', async () => {
    const download = await signBatchResultDownload(completedManifest(), {
      env: {},
    });

    expect(download).toMatchObject({
      download_enabled: false,
      download_url: null,
      download_configured: false,
      next: 'configure_batch_result_object_store',
    });
    expect(download.missing_config).toEqual(expect.arrayContaining([
      'BATCH_RESULTS_S3_BUCKET',
      'BATCH_RESULTS_S3_ENDPOINT',
      'BATCH_RESULTS_S3_KEY',
      'BATCH_RESULTS_S3_SECRET',
    ]));
  });

  test('refuses unscoped result storage keys before signing', async () => {
    const download = await signBatchResultDownload(completedManifest({
      result_storage_key: 'batch-results/renter-8/batch_result01/output.jsonl',
    }), {
      config: {
        configured: true,
        bucket: 'dcp-batch-results',
        endpoint: 'https://objects.example.test',
        accessKeyId: 'ak',
        secretAccessKey: 'sk',
        region: 'us-east-1',
        expiresIn: 900,
        forcePathStyle: true,
      },
      getSignedUrl: async () => {
        throw new Error('should not sign unsafe key');
      },
    });

    expect(download).toMatchObject({
      download_enabled: false,
      next: 'batch_result_storage_key_scope_invalid',
    });
  });

  test('signs completed result manifests with bounded expiry metadata', async () => {
    const calls = [];
    const download = await signBatchResultDownload(completedManifest(), {
      config: {
        configured: true,
        bucket: 'dcp-batch-results',
        endpoint: 'https://objects.example.test',
        accessKeyId: 'ak',
        secretAccessKey: 'sk',
        region: 'us-east-1',
        expiresIn: 120,
        forcePathStyle: true,
      },
      now: new Date('2026-07-08T09:30:00.000Z'),
      getSignedUrl: async (client, command, options) => {
        calls.push({ client, command, options });
        return 'https://objects.example.test/dcp-batch-results/batch-results/renter-7/batch_result01/output.jsonl?sig=test';
      },
    });

    expect(download).toMatchObject({
      download_enabled: true,
      download_method: 'GET',
      download_expires_in: 120,
      download_expires_at: '2026-07-08T09:32:00.000Z',
      download_configured: true,
      next: 'download_batch_result_jsonl',
    });
    expect(download.download_url).toContain('/batch-results/renter-7/batch_result01/output.jsonl');
    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBeInstanceOf(GetObjectCommand);
    expect(calls[0].options).toEqual({ expiresIn: 120 });
  });

  test('normalizes config with workspace endpoint fallback and clamped TTL', () => {
    const config = getBatchResultDownloadConfig({
      BATCH_RESULTS_S3_BUCKET: 'dcp-batch-results',
      WORKSPACE_S3_ENDPOINT: 'https://minio.example.test',
      WORKSPACE_S3_KEY: 'workspace-ak',
      WORKSPACE_S3_SECRET: 'workspace-sk',
      BATCH_RESULTS_SIGNED_URL_TTL_SECONDS: '7200',
      BATCH_RESULTS_S3_FORCE_PATH_STYLE: 'false',
    });

    expect(config).toMatchObject({
      configured: true,
      endpoint: 'https://minio.example.test',
      accessKeyId: 'workspace-ak',
      secretAccessKey: 'workspace-sk',
      expiresIn: 3600,
      forcePathStyle: false,
    });
  });

  test('keeps unavailable manifests disabled', async () => {
    const download = await signBatchResultDownload(completedManifest({
      results_available: false,
      result_storage_key: null,
    }));

    expect(download).toMatchObject({
      download_enabled: false,
      next: 'wait_for_completed_batch_result_key_and_checksum',
    });
  });
});
