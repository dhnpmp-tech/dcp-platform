const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');

async function loadAnalyzer() {
  return import(pathToFileURL(path.join(root, 'scripts/ecc-pr-review-agent.mjs')).href);
}

async function loadCommenter() {
  return import(pathToFileURL(path.join(root, 'scripts/ecc-pr-review-comment.mjs')).href);
}

function addedLine(line, text) {
  return { line, text };
}

async function run() {
  const analyzer = await loadAnalyzer();
  const commenter = await loadCommenter();

  const workflow = fs.readFileSync(path.join(root, '.github/workflows/ecc-pr-review-trio.yml'), 'utf8');
  assert(workflow.includes('pull_request_target:'), 'ECC workflow must use pull_request_target for PR comments');
  assert(workflow.includes('issues: write'), 'ECC workflow needs issue comment permission for sticky PR comments');
  assert(workflow.includes('pull-requests: write'), 'ECC workflow needs pull request comment permission');
  assert(workflow.includes('Checkout trusted base scripts'), 'ECC workflow must separate trusted base scripts');
  assert(workflow.includes('Checkout pull request for analysis'), 'ECC workflow must analyze the PR checkout');
  assert(workflow.includes('silent-failure-hunter'), 'silent-failure-hunter must be in the workflow matrix');
  assert(workflow.includes('pr-test-analyzer'), 'pr-test-analyzer must be in the workflow matrix');
  assert(workflow.includes('type-design-analyzer'), 'type-design-analyzer must be in the workflow matrix');
  assert(workflow.includes('if: always()'), 'ECC findings must be commented even when the analyzer fails');
  assert(!/ANTHROPIC|OPENAI|CLAUDE_API_KEY/.test(workflow), 'ECC workflow must not require model-provider secrets');

  const diff = [
    'diff --git a/backend/src/routes/providers.js b/backend/src/routes/providers.js',
    '+++ b/backend/src/routes/providers.js',
    '@@ -10,0 +11,2 @@',
    '+try {',
    '+} catch (error) {}',
  ].join('\n');
  const parsed = analyzer.parseAddedLinesFromDiff(diff);
  assert.deepStrictEqual(parsed.get('backend/src/routes/providers.js'), [
    addedLine(11, 'try {'),
    addedLine(12, '} catch (error) {}'),
  ]);

  const files = ['backend/src/routes/providers.js'];
  const addedLinesByFile = new Map([
    ['backend/src/routes/providers.js', [addedLine(12, '} catch (error) {}')]],
  ]);

  const silentResult = analyzer.analyzeAgent('silent-failure-hunter', {
    files,
    addedLinesByFile,
    base: 'base-sha',
    head: 'head-sha',
  });
  assert.strictEqual(silentResult.status, 'fail', 'empty catches must fail silent-failure-hunter');
  assert(silentResult.findings.some((finding) => finding.severity === 'critical'));

  const testResult = analyzer.analyzeAgent('pr-test-analyzer', {
    files: ['backend/src/routes/payments.js'],
    addedLinesByFile: new Map(),
  });
  assert.strictEqual(testResult.status, 'fail', 'high-risk route edits without tests must fail pr-test-analyzer');

  const coveredResult = analyzer.analyzeAgent('pr-test-analyzer', {
    files: ['backend/src/routes/payments.js', 'backend/src/__tests__/payments.test.js'],
    addedLinesByFile: new Map(),
  });
  assert.strictEqual(coveredResult.status, 'pass', 'high-risk route edits with tests should pass pr-test-analyzer');

  const typeResult = analyzer.analyzeAgent('type-design-analyzer', {
    files: ['app/renter/dashboard/page.tsx'],
    addedLinesByFile: new Map([
      ['app/renter/dashboard/page.tsx', [addedLine(20, 'const payload: any = input;')]],
    ]),
  });
  assert.strictEqual(typeResult.status, 'warn', 'new any usage should warn type-design-analyzer');

  const markdown = analyzer.formatMarkdown(silentResult);
  assert(markdown.includes('<!-- dcp-ecc-pr-review:silent-failure-hunter -->'));
  assert(markdown.includes('Status: **FAIL**'));
  assert(markdown.includes('backend/src/routes/providers.js:12'));

  const noisyResult = {
    agent: 'silent-failure-hunter',
    status: 'warn',
    base: 'base-sha',
    head: 'head-sha',
    scanned_files: 1,
    findings: Array.from({ length: 2000 }, (_, index) => ({
      severity: 'warning',
      location: `app/generated/large-${index}.js:${index + 1}`,
      issue: 'Large synthetic finding '.repeat(4),
      impact: 'Impact text that makes the rendered markdown intentionally long. '.repeat(4),
      recommendation: 'Recommendation text that makes the rendered markdown intentionally long. '.repeat(4),
    })),
  };
  const cappedMarkdown = analyzer.formatMarkdown(noisyResult);
  assert(cappedMarkdown.length <= analyzer.MAX_MARKDOWN_COMMENT_CHARS, 'formatMarkdown must stay below the GitHub comment cap');
  assert(cappedMarkdown.includes('Review output truncated'), 'truncated analyzer markdown must explain truncation');

  const cappedComment = commenter.truncateCommentBody('x'.repeat(commenter.MAX_MARKDOWN_COMMENT_CHARS + 100));
  assert(cappedComment.length <= commenter.MAX_MARKDOWN_COMMENT_CHARS, 'commenter must cap final sticky comment bodies');
  assert(cappedComment.includes('Review output truncated'), 'truncated sticky comments must explain truncation');

  const nextLink = commenter.parseNextLinkHeader([
    '<https://api.github.com/repos/dhnpmp-tech/dcp-platform/issues/1/comments?page=2>; rel="next"',
    '<https://api.github.com/repos/dhnpmp-tech/dcp-platform/issues/1/comments?page=4>; rel="last"',
  ].join(', '));
  assert.strictEqual(
    nextLink,
    'https://api.github.com/repos/dhnpmp-tech/dcp-platform/issues/1/comments?page=2',
    'comment lookup must parse GitHub pagination next links',
  );

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dcp-ecc-review-'));
  const largeFile = path.join(tmpDir, 'large-generated.js');
  fs.writeFileSync(largeFile, Buffer.alloc(analyzer.MAX_REVIEW_FILE_BYTES + 1, 'a'));
  assert.strictEqual(analyzer.isOversizedReviewFile(largeFile), true, 'large generated files must be detected');
  assert.deepStrictEqual(analyzer.readFileLines(largeFile), [], 'large files must be skipped instead of fully read');
  assert.deepStrictEqual(
    analyzer.getAddedOrAllLines(largeFile, new Map()),
    [],
    'fallback full-file scans must skip oversized files',
  );
  fs.rmSync(tmpDir, { recursive: true, force: true });

  const docs = fs.readFileSync(path.join(root, 'docs/orchestration/ecc-pr-review-trio.md'), 'utf8');
  assert(docs.includes('silent-failure-hunter'));
  assert(docs.includes('pr-test-analyzer'));
  assert(docs.includes('type-design-analyzer'));
  assert(docs.includes('pull_request_target'));
  assert(docs.includes('60,000 characters'));
  assert(docs.includes('pagination'));
  assert(docs.includes('2 MB'));

  console.log('ECC PR review trio static tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
