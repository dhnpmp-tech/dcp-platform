const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');

async function loadAnalyzer() {
  return import(pathToFileURL(path.join(root, 'scripts/ecc-pr-review-agent.mjs')).href);
}

function addedLine(line, text) {
  return { line, text };
}

async function run() {
  const analyzer = await loadAnalyzer();

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

  const docs = fs.readFileSync(path.join(root, 'docs/orchestration/ecc-pr-review-trio.md'), 'utf8');
  assert(docs.includes('silent-failure-hunter'));
  assert(docs.includes('pr-test-analyzer'));
  assert(docs.includes('type-design-analyzer'));
  assert(docs.includes('pull_request_target'));

  console.log('ECC PR review trio static tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
