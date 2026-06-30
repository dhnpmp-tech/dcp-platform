/**
 * ⚠️ NON-PRODUCTION REFERENCE ENTRY — DO NOT RUN IN PRODUCTION ⚠️
 *
 * This is NOT the DCP backend that serves traffic. The production server is
 * `backend/src/server.js` (Express) — it owns HMAC verification, rate limiters,
 * CORS lockdown, input sanitization, and the full route surface. This file is
 * a SMALL Fastify entry that registers only 3 route modules with JWT-only auth
 * and NONE of those Express-layer controls. If it were ever started by accident
 * it would bypass every production guardrail.
 *
 * Why this file still exists: `__tests__/fastify-jwt-hardening.test.js` reads
 * its source text as a regression reference for the JWT hardening properties
 * (F1 algorithm pinning to HS256, F2 24h token expiry). It is a documentation
 * fixture, not a runnable server.
 *
 * ROADMAP 0.9 (2026-06-30): added the fail-fast guard below so the module
 * refuses to boot unless an operator explicitly sets DCP_ALLOW_FASTIFY_ENTRY=1.
 * Accidental `ts-node server.ts` / `node build/server.ts` now exits before
 * calling app.listen, instead of silently binding a port with no controls.
 *
 * To actually remove it (separate task): also retire the hardening test, or
 * migrate its assertions onto the real Express server's JWT config.
 */
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import auditLogger from './middleware/auditLogger';
import auditRoutes from './routes/audit';
import billingRoutes from './routes/billing';
import jobRoutes from './routes/jobs';

// ── Startup Validation ─────────────────────────────────────────────────────
const REQUIRED_ENV = ['JWT_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'] as const;

function validateEnv(): void {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`[FATAL] Missing required environment variables: ${missing.join(', ')}`);
    console.error('Server cannot start without these values. Exiting.');
    process.exit(1);
  }
}

validateEnv();

const app = Fastify({ logger: true });

// ── Plugins ────────────────────────────────────────────────────────────────
// JWT authentication — hard fail if JWT_SECRET missing (validated above)
// F1 fix: pin algorithm to HS256 to prevent alg:none / algorithm confusion attacks
// F2 fix: enforce 24h expiry so stolen tokens cannot be used indefinitely
app.register(fastifyJwt, {
  secret: process.env.JWT_SECRET!,
  sign: { expiresIn: '24h' },
  verify: { algorithms: ['HS256'] },
});

// Audit logging middleware (must be registered before routes)
app.register(auditLogger);

// ── Routes ─────────────────────────────────────────────────────────────────
app.register(auditRoutes, { prefix: '/api/v1/audit' });
app.register(billingRoutes);
app.register(jobRoutes);

// Health check (excluded from audit logs)
app.get('/health', async () => ({ status: 'ok' }));
app.get('/ping', async () => 'pong');

// ── Start ──────────────────────────────────────────────────────────────────
// FAIL-FAST GUARD (ROADMAP 0.9): this module is a non-production reference
// (see header). It refuses to bind a port unless an operator explicitly opts in
// via DCP_ALLOW_FASTIFY_ENTRY=1. This makes accidental startup impossible — the
// Express server.js is the only entry point that should ever serve traffic.
const start = async () => {
  if (process.env.DCP_ALLOW_FASTIFY_ENTRY !== '1') {
    console.error(
      '[FATAL] server.ts is a non-production Fastify reference and will not start.\n' +
      '  The production server is backend/src/server.js (Express).\n' +
      '  If you genuinely intend to run this reference entry, set DCP_ALLOW_FASTIFY_ENTRY=1.'
    );
    process.exit(1);
  }
  try {
    const port = parseInt(process.env.PORT || '3001', 10);
    await app.listen({ port, host: '0.0.0.0' });
    app.log.info(`DC1 backend listening on port ${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();

export default app;
