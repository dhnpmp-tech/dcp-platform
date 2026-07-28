# Renter Console Shell

The renter console uses `app/(site)/renter/layout.tsx` as the only owner of the
shared sidebar, mobile drawer, topbar, language toggle, account identity, credit
summary, sign-out, and `+ Add credit` CTA.

Pages under `app/(site)/renter/*` should render their page workflow inside one
`<main className="rt-main ...">` column. They should not render `rt-sb`,
`rt-nav`, `rt-tb`, `rt-backdrop`, or `rt-app` markup, and page CSS should not
define those shared shell selectors.

The canonical renter nav is:

- Build: Overview, Playground, API keys, Usage, GPU Pods, Fine-Tuning, Batch
- Spend: Credit, Invoices
- Account: Settings, Docs

The shell reads the renter account and credit summary from the same renter API
surfaces used by the console pages: `/renters/me` and `/renters/balance` with
the `x-renter-key` header. Pages remain responsible for their own product data
and mutations.

Regression coverage lives in `tests/v2-renter-console-static.test.js`.
