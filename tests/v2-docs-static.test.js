const assert = require('assert');
const fs = require('fs');
const path = require('path');

const docs = fs.readFileSync(path.join(__dirname, '..', 'app/v2/docs/page.tsx'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'app/v2/docs/docs.css'), 'utf8');

[
  'id="quickstart"',
  'id="auth"',
  'id="billing"',
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
].forEach((anchor) => {
  assert(docs.includes(anchor), `v2 docs should render section anchor ${anchor}`);
});

[
  'href="#"',
  'type="search"',
  'Search the docs',
  'ابحث في التوثيق',
].forEach((stub) => {
  assert(!docs.includes(stub), `v2 docs should not ship inert docs chrome: ${stub}`);
});

assert(!css.includes('.dx-top .search'), 'v2 docs should not keep unused decorative search styles');

console.log('v2 docs static checks passed');
