/**
 * Regression guard: production infrastructure identifiers (IPs, libp2p peer
 * IDs, bootstrap multiaddrs) and credentials (Telegram bot tokens) must never
 * be hardcoded in the backend source tree — including .py/.sh sources. If this
 * test fails, a real secret-ish infra detail was just committed.
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
// .py/.sh added 2026-06-02: a hardcoded Telegram token in src/channels/
// heartbeat_mvp.py (a .py file) was missed because Python sources weren't scanned.
const EXTS = new Set(['.js', '.ts', '.tsx', '.json', '.mjs', '.cjs', '.py', '.sh']);

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
  {
    // Mirrors the telegram-bot-token rule in .gitleaks.toml. A hardcoded
    // default token previously shipped in src/channels/heartbeat_mvp.py and was
    // missed because .py wasn't scanned (now in EXTS) and no token pattern
    // existed here. Matches the numeric_id:secret shape in any context.
    name: 'Telegram bot token (id:secret shape)',
    re: /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/,
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

// Regression: the Telegram-token detector above (and its .gitleaks.toml twin)
// must fire on the pre-rotation @dcp_dev_bot token's shape. Built from the real
// (public) bot id + a synthetic secret so the literal token never reappears in
// source — committing it would re-leak it and trip the very rule under test.
describe('security: telegram-token pattern fires on the pre-rotation token shape', () => {
  const tgRe = /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/;

  test('matches an id:secret token shape', () => {
    const tokenShape = '8291599718' + ':' + 'A'.repeat(35);
    expect(tgRe.test(tokenShape)).toBe(true);
  });

  test('does not match ordinary code or env references', () => {
    expect(tgRe.test('process.env.TG_DEV_BOT_TOKEN')).toBe(false);
    expect(tgRe.test('const built = "2026-06-02"; // 12:00 build')).toBe(false);
  });
});
