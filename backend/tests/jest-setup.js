/**
 * Jest global setup — runs before any module is loaded in each test file.
 * Points the DB at an in-memory SQLite so tests never touch providers.db.
 */
process.env.DC1_DB_PATH = ':memory:';
process.env.DC1_ADMIN_TOKEN = 'test-admin-token-jest';
process.env.DC1_HMAC_SECRET = 'test-hmac-secret-jest-fixed-32-byte-key-!!';
// Suppress Supabase sync in tests
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_KEY = 'test-supabase-key-jest';
process.env.SUPABASE_SERVICE_KEY = 'test-supabase-service-key-jest';
// Disable rate limiting in the test env by default — suites that drive many
// requests at a capped endpoint (e.g. registerLimiter is max-5/hour) otherwise
// hit spurious 429/502 unrelated to the code under test. Safe because the
// limiters now evaluate this flag PER-REQUEST (createRateLimiter `skip`), so
// rateLimiter.test.js re-enables it per-test (beforeEach sets '0') and still
// verifies active limiting on the real module-level limiter consts.
process.env.DISABLE_RATE_LIMIT = process.env.DISABLE_RATE_LIMIT || '1';
