# Resend to AWS SES Evaluation

Date checked: 2026-07-26
Mission task: `task_950fbc5863d2`
Status: recommendation only. Do not flip production email from Resend to SES in
this PR.

## Decision

Keep Resend as the launch provider for DCP transactional email. Revisit AWS SES
when DCP has sustained volume above 50,000 transactional emails per month, needs
AWS-native deliverability controls, or wants a dedicated operational owner for
email reputation, bounce handling, and DNS health.

The old "62K free emails per month on SES" assumption is not safe for launch
planning without validating the actual AWS account, region, and billing plan.
The AWS pricing page checked on 2026-07-26 presents SES pricing as plan-based
and marginal per-1,000-email rates, with new account/account-region behavior
starting 2026-07-21. Treat SES as cheaper at scale, not as a free replacement.

## Current DCP Email Surface

DCP currently sends email through direct Resend HTTP calls in two places:

- `backend/src/services/emailService.js` sends reusable transactional templates:
  welcome email, payout approval/rejection, provider offline, job status,
  auto-top-up, and data export ready.
- `backend/src/services/auth-otp.js` sends the magic-link login email directly
  through Resend, outside `emailService.js`.

Volume control work has already reduced the biggest avoidable burn:

- `backend/src/services/notificationsV2.js` replaced per-job completion emails
  with in-dashboard notification rows.
- `backend/src/services/dailyDigest.js` rolls renter notifications into one
  daily email per renter.

Configuration today is simple:

- `RESEND_API_KEY`
- `FRONTEND_URL`
- fixed sender: `DCP Platform <noreply@dcp.sa>`

## Current Pricing Snapshot

Source links checked on 2026-07-26:

- AWS SES pricing: https://aws.amazon.com/ses/pricing/
- AWS SES production access/sandbox: https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html
- AWS SES Easy DKIM: https://docs.aws.amazon.com/ses/latest/dg/send-email-authentication-dkim-easy.html
- Resend pricing: https://resend.com/pricing
- Resend Node.js quickstart: https://resend.com/docs/send-with-nodejs

Resend public pricing checked on 2026-07-26:

- Free: 3,000 emails per month, 100 emails per day.
- Pro: 50,000 emails per month at $20/month, extra emails at $0.90/1,000.
- Scale: 100,000 emails per month at $90/month, extra emails at $0.90/1,000.
- Dedicated IP add-on: available to Scale customers exceeding 3,000 emails/day.

AWS SES pricing checked on 2026-07-26:

- Essentials 0 to 10M tier: $0.16 per 1,000 outbound emails.
- Pro 0 to 10M tier: $0.22 per 1,000 outbound emails plus account/region fee.
- Enterprise 0 to 10M tier: $0.23 per 1,000 outbound emails plus account/region
  fee.
- AWS states that new SES accounts and account-region combinations with no
  metered SES activity since 2025-06-01 start on the Essentials plan beginning
  2026-07-21.

Operational interpretation:

- Below 50,000/month, Resend Pro costs roughly $20/month. The SES savings are
  too small to justify a launch-week provider migration.
- Above 50,000/month, SES becomes materially cheaper, but only if the team is
  ready to own deliverability operations.
- The actual AWS bill may also include attachments, Mail Manager, dedicated IP,
  VDM/analytics, and other SES features if enabled.

## Migration Work Required

Do not swap providers by editing the two direct `fetch` calls. Add a provider
interface first so magic links and transactional templates use the same delivery
contract.

Recommended implementation path:

1. Add `backend/src/services/mailProvider.js` with a stable internal contract:
   `sendMail({ to, from, subject, html, text, tags, idempotencyKey })`.
2. Implement `resendProvider` behind the current `RESEND_API_KEY` behavior.
3. Implement `sesProvider` with `@aws-sdk/client-sesv2`.
4. Route `emailService.js` and `auth-otp.js` through `mailProvider.js`.
5. Add runtime env:
   - `EMAIL_PROVIDER=resend|ses`
   - `AWS_SES_REGION`
   - `AWS_SES_FROM_ADDRESS`
   - `AWS_SES_CONFIGURATION_SET`
   - `AWS_SES_ACCESS_KEY_ID` / `AWS_SES_SECRET_ACCESS_KEY`, or an instance role
     on the VPS if the deployment moves to AWS-native runtime.
6. Verify `dcp.sa` as an SES identity.
7. Publish DKIM DNS records and keep SPF/DMARC aligned with the chosen sender.
8. Request SES production access. While in sandbox, SES cannot be used as the
   public magic-link provider because recipient restrictions would break real
   signups.
9. Wire bounce/complaint/reject/delivery events to an admin-visible ledger.
10. Canary SES to internal recipients only, then 5 percent of low-risk
    transactional emails, then magic links last.

## Acceptance Tests For A Future Migration PR

A future migration PR should be blocked until these are green:

- Unit tests prove Resend and SES adapters preserve `to`, `from`, `subject`,
  `html`, `text`, timeout behavior, and safe error return shape.
- Magic-link auth test proves `auth-otp.js` no longer bypasses the shared mail
  provider.
- Daily digest test proves digest emails still send once per renter per day.
- Provider payout email tests prove approval/rejection notifications keep their
  existing behavior.
- SES sandbox integration test sends to verified internal recipients only.
- Production canary runbook records DNS identity, DKIM verification, sandbox
  exit, configuration set, bounce/complaint event target, and rollback to
  `EMAIL_PROVIDER=resend`.

## Recommendation For DCP

Do this now:

- Keep Resend for launch.
- Keep daily digest/on-dashboard notification behavior, because it already fixes
  the quota burn that made this migration attractive.
- Add a backlog item for the shared mail-provider abstraction when monthly
  transactional volume consistently exceeds 30,000 or when a customer/security
  requirement asks for AWS-native email controls.

Do not do this now:

- Do not remove Resend.
- Do not make SES the magic-link provider until sandbox exit, DKIM, bounce and
  complaint handling, and canary evidence exist.
- Do not use the 62K/month SES free-tier statement in public or internal launch
  planning without account-specific AWS validation.

