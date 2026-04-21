/**
 * Regression guard: production infrastructure identifiers (IPs, libp2p peer
 * IDs, bootstrap multiaddrs) must never be hardcoded in the backend source
 * tree. If this test fails, a real secret-ish infra detail was just committed.
 *
 * Exceptions intentionally covered:
 *   - Inline doc/comment example using <IP> / <PEER_ID> placeholders (ok)
 *   - This test file itself (it has to mention the patterns to match)
 *
 * Tito Audit reference: hardcoded 76.13.179.86 + 12D3Koo... multiaddr leak
 * mitigated on branch peter/security-hardening.
 */

const fs = require('node:fs');
const path = require('node:path');

const BACKEND_DIR = path.resolve(__dirname, '..', '..');
const SEARCH_ROOTS = ['src', 'tests', 'ecosystem.config.js'];
const EXTS = new Set(['.js', '.ts', '.tsx', '.json', '.mjs', '.cjs']);

// Patterns that, if present verbatim, represent a real infra leak.
const FORBIDDEN_PATTERNS = [
  {
    name: 'hardcoded production IP',
    re: /\b76\.13\.179\.86\b/,
  },
  {
    name: 'libp2p peer ID (12D3Koo…)',
    // Specifically the production peer ID prefix — test flags *any* 12D3Koo
    // since every libp2p ed25519 pubkey starts with this.
    re: /\b12D3Koo[A-Za-z0-9]{42,}\b/,
  },
];

// Files that are allowed to mention patterns (this test + its runner).
const ALLOWLIST = new Set([
  path.join(__dirname, 'no-hardcoded-prod-infra.test.js'),
]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  const stat = fs.statSync(dir);
  if (stat.isFile()) {
    out.push(dir);
    return out;
  }
  for (const entry of fs.readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === 'build') continue;
    const full = path.join(dir, entry);
    const s = fs.statSync(full);
    if (s.isDirectory()) walk(full, out);
    else if (EXTS.has(path.extname(full))) out.push(full);
  }
  return out;
}

describe('security: no hardcoded production infra in backend source', () => {
  const files = SEARCH_ROOTS.flatMap((root) => walk(path.join(BACKEND_DIR, root)));

  for (const { name, re } of FORBIDDEN_PATTERNS) {
    test(`no ${name}`, () => {
      const hits = [];
      for (const f of files) {
        if (ALLOWLIST.has(f)) continue;
        let content;
        try {
          content = fs.readFileSync(f, 'utf8');
        } catch {
          continue;
        }
        if (re.test(content)) hits.push(path.relative(BACKEND_DIR, f));
      }
      if (hits.length) {
        throw new Error(
          `${name} leaked in: ${hits.join(', ')}\n` +
            'Move the value to an environment variable (e.g. DCP_P2P_BOOTSTRAP, MC_API_URL).',
        );
      }
    });
  }
});
