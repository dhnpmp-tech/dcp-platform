#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SOURCE_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.js',
  '.jsx',
  '.mjs',
  '.py',
  '.sh',
  '.ts',
  '.tsx',
]);

const TYPE_EXTENSIONS = new Set(['.ts', '.tsx']);

const MAX_MARKDOWN_COMMENT_CHARS = 60000;
const MAX_REVIEW_FILE_BYTES = 2 * 1024 * 1024;

const IGNORED_PATH_PARTS = new Set([
  '.git',
  '.next',
  'coverage',
  'dist',
  'node_modules',
  'out',
]);

const AGENT_PROFILES = {
  'silent-failure-hunter': {
    title: 'silent-failure-hunter',
    intent: 'Flags swallowed errors, empty catches, silent fallbacks, and missing propagation in changed code.',
  },
  'pr-test-analyzer': {
    title: 'pr-test-analyzer',
    intent: 'Checks whether a PR changed product code without matching behavioral test coverage.',
  },
  'type-design-analyzer': {
    title: 'type-design-analyzer',
    intent: 'Flags new TypeScript escape hatches that weaken invariants or hide illegal states.',
  },
};

function printUsage() {
  process.stdout.write(`Usage:
  node scripts/ecc-pr-review-agent.mjs --agent <name> --base <sha> --head <sha> --output <file>

Agents:
  silent-failure-hunter
  pr-test-analyzer
  type-design-analyzer

Options:
  --format markdown|json   Default: markdown
  --max-files <n>          Default: 250
\n`);
}

function parseArgs(argv) {
  const args = argv.slice();
  const parsed = { format: 'markdown', maxFiles: 250 };

  while (args.length) {
    const key = args.shift();
    const value = args[0] && !args[0].startsWith('--') ? args.shift() : undefined;

    if (key === '--agent') parsed.agent = value;
    else if (key === '--base') parsed.base = value;
    else if (key === '--head') parsed.head = value;
    else if (key === '--output') parsed.output = value;
    else if (key === '--format') parsed.format = value || 'markdown';
    else if (key === '--max-files') parsed.maxFiles = Number(value) || 250;
    else if (key === '--help' || key === '-h') parsed.help = true;
    else throw new Error(`unknown option: ${key}`);
  }

  return parsed;
}

function runGit(args) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trimEnd();
  } catch (error) {
    const stderr = error.stderr ? String(error.stderr).trim() : '';
    const detail = stderr ? `: ${stderr}` : '';
    throw new Error(`git ${args.join(' ')} failed${detail}`);
  }
}

function shouldIgnoreFile(filePath) {
  const parts = filePath.split(/[\\/]+/);
  return parts.some((part) => IGNORED_PATH_PARTS.has(part));
}

function hasExtension(filePath, extensions) {
  return extensions.has(path.extname(filePath).toLowerCase());
}

function isTestFile(filePath) {
  return (
    /(^|\/)(__tests__|tests|test|e2e)(\/|$)/.test(filePath) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(filePath) ||
    /\.test\.mjs$/.test(filePath)
  );
}

function isProductSourceFile(filePath) {
  if (shouldIgnoreFile(filePath)) return false;
  if (!hasExtension(filePath, SOURCE_EXTENSIONS)) return false;
  if (isTestFile(filePath)) return false;
  if (filePath.endsWith('.d.ts')) return false;
  return true;
}

function isTypeSourceFile(filePath) {
  return isProductSourceFile(filePath) && hasExtension(filePath, TYPE_EXTENSIONS);
}

function isDocsOnlyFile(filePath) {
  return /\.(md|mdx|txt|png|jpg|jpeg|gif|webp|svg)$/i.test(filePath);
}

function isHighRiskProductFile(filePath) {
  return (
    /(^|\/)(middleware|auth)\.[cm]?[jt]sx?$/.test(filePath) ||
    /backend\/src\/routes\/(payments|providers|v1|auth|admin)\.js$/.test(filePath) ||
    /backend\/src\/services\/.*(payment|payout|settlement|balance|invoice|routing|refund)/i.test(filePath) ||
    /backend\/src\/.*(missionClaims|providerVerification|provider-probe)/.test(filePath) ||
    /(^|\/)(security|contracts)\//.test(filePath)
  );
}

function collectChangedFiles(base, head, maxFiles = 250) {
  const output = runGit(['diff', '--name-only', '--diff-filter=ACMRT', `${base}...${head}`]);
  const files = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => !shouldIgnoreFile(file));

  if (files.length > maxFiles) {
    throw new Error(`refusing to scan ${files.length} files; raise --max-files if this is intentional`);
  }

  return files;
}

function parseAddedLinesFromDiff(diffText) {
  const addedLinesByFile = new Map();
  let currentFile = null;
  let nextNewLine = 0;

  for (const rawLine of diffText.split('\n')) {
    if (rawLine.startsWith('+++ b/')) {
      currentFile = rawLine.slice('+++ b/'.length);
      if (!addedLinesByFile.has(currentFile)) addedLinesByFile.set(currentFile, []);
      continue;
    }

    const hunk = rawLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      nextNewLine = Number(hunk[1]);
      continue;
    }

    if (!currentFile || !nextNewLine) continue;

    if (rawLine.startsWith('+') && !rawLine.startsWith('+++')) {
      addedLinesByFile.get(currentFile).push({ line: nextNewLine, text: rawLine.slice(1) });
      nextNewLine += 1;
      continue;
    }

    if (rawLine.startsWith('-') && !rawLine.startsWith('---')) continue;
    if (!rawLine.startsWith('\\')) nextNewLine += 1;
  }

  return addedLinesByFile;
}

function collectAddedLines(base, head, files) {
  if (!files.length) return new Map();
  const diff = runGit(['diff', '--unified=0', '--no-color', `${base}...${head}`, '--', ...files]);
  return parseAddedLinesFromDiff(diff);
}

function isOversizedReviewFile(filePath, maxBytes = MAX_REVIEW_FILE_BYTES) {
  return fs.statSync(filePath).size > maxBytes;
}

function readFileLines(filePath) {
  if (isOversizedReviewFile(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
}

function getAddedOrAllLines(filePath, addedLinesByFile) {
  if (addedLinesByFile.has(filePath)) return addedLinesByFile.get(filePath);

  return readFileLines(filePath).map((text, index) => ({
    line: index + 1,
    text,
  }));
}

function getContext(lines, lineNumber, before = 4, after = 8) {
  const start = Math.max(1, lineNumber - before);
  const end = Math.min(lines.length, lineNumber + after);
  return lines.slice(start - 1, end).join('\n');
}

function makeFinding(severity, file, line, issue, impact, recommendation) {
  return {
    severity,
    location: line ? `${file}:${line}` : file,
    issue,
    impact,
    recommendation,
  };
}

function analyzeSilentFailure(files, addedLinesByFile) {
  const findings = [];

  for (const file of files.filter(isProductSourceFile)) {
    const fullLines = readFileLines(file);
    const scanLines = getAddedOrAllLines(file, addedLinesByFile);

    for (const added of scanLines) {
      const text = added.text.trim();
      const context = getContext(fullLines, added.line);

      if (/catch\s*(?:\([^)]*\))?\s*\{\s*\}/.test(text)) {
        findings.push(makeFinding(
          'critical',
          file,
          added.line,
          'Empty catch block added.',
          'The PR can hide a real runtime failure and continue with corrupted state.',
          'Log with useful context and rethrow, return an explicit typed error, or make the fallback visible to callers.',
        ));
      }

      if (/\.catch\s*\(\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*(?:\[\]|null|undefined|\{\})\s*\)/.test(text)) {
        findings.push(makeFinding(
          'critical',
          file,
          added.line,
          'Promise rejection is converted to an empty value.',
          'Downstream code cannot distinguish no data from a failed dependency.',
          'Propagate the error or return a structured degraded state with a logged reason.',
        ));
      }

      if (/catch\b/.test(context) && /return\s+(?:null|undefined|\[\]|\{\})\s*;?/.test(context)) {
        const hasVisibleHandling = /(throw\b|logger\.(error|warn)|console\.(error|warn)|warnOnce|record[A-Za-z]*Failure|set[A-Za-z]*Error)/.test(context);
        if (!hasVisibleHandling) {
          findings.push(makeFinding(
            'warning',
            file,
            added.line,
            'Catch path returns an empty fallback without visible handling.',
            'The caller may treat dependency failure as a valid empty response.',
            'Add contextual warning/error telemetry, a structured status, or explicit propagation.',
          ));
        }
      }
    }
  }

  return findings;
}

function analyzePrTests(files) {
  const findings = [];
  const productFiles = files.filter(isProductSourceFile);
  const testFiles = files.filter(isTestFile);
  const docsOnly = files.length > 0 && files.every(isDocsOnlyFile);
  const highRiskFiles = productFiles.filter(isHighRiskProductFile);

  if (!files.length) {
    findings.push(makeFinding(
      'notice',
      'PR diff',
      null,
      'No changed files detected.',
      'The analyzer had no diff to inspect.',
      'Confirm the workflow was run with a valid pull request base and head SHA.',
    ));
    return findings;
  }

  if (docsOnly) return findings;

  if (highRiskFiles.length && !testFiles.length) {
    findings.push(makeFinding(
      'critical',
      highRiskFiles.join(', '),
      null,
      'High-risk product code changed without matching tests in the PR.',
      'Auth, billing, provider routing, contracts, or security behavior can regress silently.',
      'Add focused unit/integration/proof coverage, or explain in the PR why an existing named gate already covers the change.',
    ));
  } else if (productFiles.length && !testFiles.length) {
    findings.push(makeFinding(
      'warning',
      productFiles.join(', '),
      null,
      'Product code changed without test files in the PR.',
      'The change may rely on manual review instead of executable behavioral coverage.',
      'Add a focused regression test, or document the exact existing command that covers the changed behavior.',
    ));
  }

  return findings;
}

function analyzeTypeDesign(files, addedLinesByFile) {
  const findings = [];

  for (const file of files.filter(isTypeSourceFile)) {
    const scanLines = getAddedOrAllLines(file, addedLinesByFile);

    for (const added of scanLines) {
      const text = added.text.trim();
      if (!text || text.startsWith('//') || text.startsWith('*')) continue;

      if (/@ts-nocheck/.test(text)) {
        findings.push(makeFinding(
          'critical',
          file,
          added.line,
          'TypeScript checking disabled for a changed file.',
          'The PR can ship illegal states without compiler feedback.',
          'Remove @ts-nocheck and encode the boundary with narrower types or validated parsing.',
        ));
      }

      if (/@ts-ignore/.test(text)) {
        findings.push(makeFinding(
          'warning',
          file,
          added.line,
          'TypeScript error suppressed with @ts-ignore.',
          'The suppressed invariant may drift as surrounding code changes.',
          'Prefer @ts-expect-error with a narrow reason, or fix the type boundary directly.',
        ));
      }

      if (/(:\s*any\b|\bas\s+any\b|<\s*any\s*>|Record\s*<\s*string\s*,\s*any\s*>|Promise\s*<\s*any\s*>)/.test(text)) {
        findings.push(makeFinding(
          'warning',
          file,
          added.line,
          'New any-based escape hatch added.',
          'Callers can pass impossible shapes and bypass useful domain invariants.',
          'Use a named interface, discriminated union, branded id, or unknown plus explicit validation.',
        ));
      }

      if (/unknown\s+as\s+[A-Za-z_$][\w$<>{}\[\], ]+/.test(text)) {
        findings.push(makeFinding(
          'warning',
          file,
          added.line,
          'Unknown value cast directly to an application type.',
          'Runtime payloads may skip validation before entering trusted code.',
          'Validate the payload shape before casting, or keep it unknown until narrowed.',
        ));
      }
    }
  }

  return findings;
}

function analyzeAgent(agent, options) {
  const { files, addedLinesByFile = new Map(), base = 'unknown', head = 'unknown' } = options;
  if (!AGENT_PROFILES[agent]) throw new Error(`unknown agent: ${agent}`);

  let findings = [];
  if (agent === 'silent-failure-hunter') findings = analyzeSilentFailure(files, addedLinesByFile);
  if (agent === 'pr-test-analyzer') findings = analyzePrTests(files);
  if (agent === 'type-design-analyzer') findings = analyzeTypeDesign(files, addedLinesByFile);

  const hasCritical = findings.some((finding) => finding.severity === 'critical');
  const hasWarnings = findings.some((finding) => finding.severity === 'warning');
  const status = hasCritical ? 'fail' : hasWarnings ? 'warn' : 'pass';

  return {
    agent,
    status,
    base,
    head,
    scanned_files: files.length,
    findings,
  };
}

function escapeTableCell(value) {
  return String(value || '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>');
}

function truncateMarkdownComment(markdown, limit = MAX_MARKDOWN_COMMENT_CHARS) {
  if (markdown.length <= limit) return markdown;

  const note = '\n\n_Review output truncated to stay below the GitHub comment size limit._\n';
  const keep = Math.max(0, limit - note.length);
  return `${markdown.slice(0, keep).trimEnd()}${note}`;
}

function formatMarkdown(result) {
  const profile = AGENT_PROFILES[result.agent];
  const lines = [
    `<!-- dcp-ecc-pr-review:${result.agent} -->`,
    `## ECC PR Review: ${profile.title}`,
    '',
    `Status: **${result.status.toUpperCase()}**`,
    '',
    profile.intent,
    '',
    `Scanned files: ${result.scanned_files}`,
    `Base: \`${result.base}\``,
    `Head: \`${result.head}\``,
    '',
  ];

  if (!result.findings.length) {
    lines.push('No findings from this agent.');
    lines.push('');
    return lines.join('\n');
  }

  lines.push('| Severity | Location | Issue | Impact | Recommendation |');
  lines.push('|---|---|---|---|---|');

  for (const finding of result.findings) {
    lines.push([
      finding.severity,
      `\`${finding.location}\``,
      finding.issue,
      finding.impact,
      finding.recommendation,
    ].map(escapeTableCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }

  lines.push('');
  return truncateMarkdownComment(lines.join('\n'));
}

function writeOutput(outputPath, content) {
  if (!outputPath) {
    process.stdout.write(content);
    if (!content.endsWith('\n')) process.stdout.write('\n');
    return;
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  if (!args.agent || !args.base || !args.head) {
    printUsage();
    throw new Error('--agent, --base, and --head are required');
  }

  const files = collectChangedFiles(args.base, args.head, args.maxFiles);
  const addedLinesByFile = collectAddedLines(args.base, args.head, files);
  const result = analyzeAgent(args.agent, {
    files,
    addedLinesByFile,
    base: args.base,
    head: args.head,
  });

  const output = args.format === 'json'
    ? `${JSON.stringify(result, null, 2)}\n`
    : formatMarkdown(result);

  writeOutput(args.output, output);
  process.exitCode = result.status === 'fail' ? 1 : 0;
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}

export {
  AGENT_PROFILES,
  MAX_MARKDOWN_COMMENT_CHARS,
  MAX_REVIEW_FILE_BYTES,
  analyzeAgent,
  collectAddedLines,
  collectChangedFiles,
  formatMarkdown,
  getAddedOrAllLines,
  isHighRiskProductFile,
  isOversizedReviewFile,
  isProductSourceFile,
  isTestFile,
  parseAddedLinesFromDiff,
  readFileLines,
  truncateMarkdownComment,
};
