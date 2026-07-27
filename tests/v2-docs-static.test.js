const assert = require('assert');
const fs = require('fs');
const path = require('path');

const docs = fs.readFileSync(path.join(__dirname, '..', 'app/(site)/docs/page.tsx'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'app/(site)/docs/docs.css'), 'utf8');

[
  'id="quickstart"',
  'id="openai-compatible-api"',
  'id="auth"',
  'id="billing"',
  'id="pricing"',
  'id="models"',
  'id="chat"',
  'id="embeddings"',
  'id="rerank"',
  'id="streaming"',
  'id="errors"',
  'id="rag"',
  'id="python-sdk"',
  'id="node-sdk"',
  'id="curl-rest"',
  'id="arabic"',
  'id="residency"',
  'id="provider-onboarding"',
  'id="sdk-examples"',
].forEach((anchor) => {
  assert(docs.includes(anchor), `v2 docs should render section anchor ${anchor}`);
});

[
  'Documentation sections',
  'OpenAI-compatible API',
  'Provider onboarding',
  'GET /v1/models',
  '402 insufficient_balance',
  'href="/earn"',
  'href="/provider-setup"',
  'href="/pricing"',
  'qwen2.5:7b',
  "DCP-specific wrappers can be layered later",
].forEach((needle) => {
  assert(docs.includes(needle), `v2 docs should include launch docs copy: ${needle}`);
});

[
  'href="#"',
  'type="search"',
  'Search the docs',
  'ابحث في التوثيق',
  'qwen3-4b',
].forEach((stub) => {
  assert(!docs.includes(stub), `v2 docs should not ship inert docs chrome: ${stub}`);
});

assert(!css.includes('.dx-top .search'), 'v2 docs should not keep unused decorative search styles');
assert(css.includes('.dx-section-map'), 'v2 docs should style the launch section map');

console.log('v2 docs static checks passed');
