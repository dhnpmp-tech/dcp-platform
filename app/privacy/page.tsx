import LegalPage from '../components/layout/LegalPage'

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="March 18, 2026">
      <p>
        This Privacy Policy explains how DCP (&ldquo;DCP&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) collects, uses,
        stores, and protects your personal data. DCP operates as a GPU compute marketplace serving users in Saudi Arabia and
        complies with the <strong>Saudi Personal Data Protection Law (PDPL)</strong> (Royal Decree M/19, effective September 2023)
        and its implementing regulations.
      </p>

      <h2>1. Data Controller</h2>
      <p>
        DCP is the data controller for personal data processed through dcp.sa and the DCP API.
        For privacy inquiries, contact: <a href="mailto:privacy@dcp.sa">privacy@dcp.sa</a>
      </p>

      <h2>2. Personal Data We Collect</h2>
      <p>We collect the following categories of personal data:</p>

      <h3>Providers (GPU owners)</h3>
      <ul>
        <li><strong>Identity data</strong>: Full name, email address, phone number (optional)</li>
        <li><strong>Hardware data</strong>: GPU model, VRAM, driver version, operating system, GPU count</li>
        <li><strong>Network data</strong>: IP address, hostname (collected via daemon heartbeat every 30 seconds)</li>
        <li><strong>Financial data</strong>: Earnings balance (SAR), job completion history, payout records</li>
        <li><strong>Performance data</strong>: Uptime metrics, reliability score, job success rate</li>
      </ul>

      <h3>Renters (compute buyers)</h3>
      <ul>
        <li><strong>Identity data</strong>: Full name, email address, organization (optional)</li>
        <li><strong>Financial data</strong>: Wallet balance (SAR), top-up history, job billing records</li>
        <li><strong>Usage data</strong>: Job submissions, job type, compute time, job status and output</li>
      </ul>

      <h2>3. Legal Basis for Processing (PDPL Article 5)</h2>
      <p>We process your personal data on the following bases:</p>
      <ul>
        <li><strong>Contractual necessity</strong>: To provide the DCP marketplace service you registered for</li>
        <li><strong>Explicit consent</strong>: For cross-border data transfers and non-essential processing (obtained at registration)</li>
        <li><strong>Legal obligation</strong>: Financial records retained per SAMA regulations (7 years)</li>
        <li><strong>Legitimate interest</strong>: Platform security monitoring, fraud prevention, abuse detection</li>
      </ul>

      <h2>4. How We Use Your Data</h2>
      <ul>
        <li>Operate the DCP GPU compute marketplace (job routing, billing, payouts)</li>
        <li>Authenticate your account using your API key</li>
        <li>Monitor platform health, detect fraud, and enforce rate limits</li>
        <li>Send important service notifications (security alerts, policy changes)</li>
        <li>Comply with Saudi regulatory requirements (SAMA, ZATCA, PDPL)</li>
      </ul>
      <p>We do not sell your personal data to third parties. We do not use your data for advertising.</p>

      <h2>5. Data Storage and Cross-Border Transfer</h2>
      <p>
        <strong>Important disclosure (PDPL Article 29)</strong>: DCP&rsquo;s backend servers are currently hosted on Hostinger
        infrastructure located in <strong>Lithuania (EU) and the United States</strong>. The DCP web frontend and serverless
        functions are deployed to <strong>Vercel</strong>, which routes by default to <strong>US-East (iad1)</strong> with
        regional fallbacks across the EU and Asia. This means your personal data (account profile, job history, usage
        events, billing metadata) is transferred to and stored outside the Kingdom of Saudi Arabia for those workloads.
      </p>
      <p>
        Payments and payouts are processed through <strong>Moyasar</strong>, a Saudi-licensed payment service provider
        regulated by SAMA. Full card numbers, CVVs, and bank-side credentials are held by Moyasar inside the Kingdom
        and never reach DCP&rsquo;s servers &mdash; tokenization happens client-side via Moyasar&rsquo;s SDK against
        their hosted endpoint.
      </p>
      <p>
        DCP&rsquo;s backend does persist the following payment-adjacent fields on the out-of-Kingdom database to operate
        the marketplace:
      </p>
      <ul>
        <li>
          For <strong>providers</strong> who register a payout account: full Saudi IBAN, account holder name, and the
          Moyasar payout-account UUID (<code>providers.payout_iban</code>, <code>payout_holder_name</code>,
          <code>moyasar_payout_account_id</code>).
        </li>
        <li>
          For <strong>renters</strong> who enable saved-card auto-top-up: the Moyasar card token id (an opaque reference,
          not the card number itself), card brand, and last-four digits for display
          (<code>renters.moyasar_card_token</code>, <code>moyasar_card_brand</code>, <code>moyasar_card_last4</code>).
        </li>
        <li>
          Transaction history for every top-up, auto-top-up attempt, payout, and inference settlement: amounts, statuses,
          timestamps, Moyasar reference ids, and failure reasons. These are required by SAMA for the seven-year retention
          window and are surfaced in the renter and provider dashboards as well as admin reconciliation.
        </li>
      </ul>
      <p>
        Saved card tokens can be removed at any time from{' '}
        <a href="/renter/billing">/renter/billing</a> (the &ldquo;Remove&rdquo; action), which also disables auto-top-up.
        Provider IBANs can be updated in <a href="/provider/settings">/provider/settings</a>. Account deletion erases
        these fields except where retained for SAMA financial-records obligations.
      </p>
      <p>
        Compute jobs themselves (model inference) run on provider GPUs registered to the platform. Provider GPUs may
        physically reside in the Kingdom or in other jurisdictions; the marketplace listing surfaces the provider&rsquo;s
        declared region where available.
      </p>
      <p>
        For each completed inference job, DCP&rsquo;s backend persists the prompt (<code>jobs.task_spec</code>) and the
        model response (<code>jobs.result</code>) on the out-of-Kingdom database to support debugging, dispute
        resolution, and the renter dashboard&rsquo;s job-history view. Per the &ldquo;Data Retention&rdquo; table below,
        these payload columns are nulled out automatically <strong>90 days after job completion</strong> by the daily
        cleanup worker (<code>backend/src/services/cleanup.js</code>). Job metadata (id, timing, cost, status) is
        retained for the seven-year SAMA window after the payload is cleared.
      </p>
      <p>
        By registering and using DCP, you provide explicit consent to this cross-border transfer as required by PDPL
        Article 29. Saudi residents and entities subject to NDMO data-classification requirements should review the
        SDAIA Cross-Border Transfer Regulation (September 2024) before sending sensitive workloads through the platform.
        We are planning migration of the DCP backend and Vercel functions to Saudi Arabia-hosted infrastructure
        (STC Cloud or AWS Bahrain ap-southeast-3) in Q3 2026; this disclosure will be updated when the migration
        completes.
      </p>

      <h2>6. Data Retention</h2>
      <table>
        <thead>
          <tr>
            <th>Data Type</th>
            <th>Retention Period</th>
            <th>Basis</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Account data (name, email)</td>
            <td>Until account deletion</td>
            <td>Contractual necessity</td>
          </tr>
          <tr>
            <td>Heartbeat logs (IP, GPU metrics)</td>
            <td>30 days</td>
            <td>Platform operations</td>
          </tr>
          <tr>
            <td>Job logs</td>
            <td>90 days</td>
            <td>Debugging, dispute resolution</td>
          </tr>
          <tr>
            <td>Job records (metadata only, payload cleared after 90 days)</td>
            <td>7 years</td>
            <td>SAMA financial regulation</td>
          </tr>
          <tr>
            <td>Payment records</td>
            <td>7 years</td>
            <td>SAMA financial regulation (never deleted)</td>
          </tr>
        </tbody>
      </table>
      <p>
        Automated data retention enforcement runs daily at 02:00 UTC. Payment and billing records are
        exempt from deletion to comply with Saudi financial regulations.
      </p>

      <h2>7. Your Rights (PDPL Chapter 3)</h2>
      <p>Under the PDPL, you have the following rights:</p>
      <ul>
        <li>
          <strong>Right of access</strong>: Request a copy of your personal data — email{' '}
          <a href="mailto:privacy@dcp.sa">privacy@dcp.sa</a>
        </li>
        <li>
          <strong>Right to correction</strong>: Request correction of inaccurate data — contact{' '}
          <a href="mailto:privacy@dcp.sa">privacy@dcp.sa</a>
        </li>
        <li>
          <strong>Right to erasure (right to be forgotten)</strong>: Delete your account and anonymize your PII
          via the API: <code>DELETE /api/providers/me</code> or <code>DELETE /api/renters/me</code>.
          Financial records are retained as required by law.
        </li>
        <li>
          <strong>Right to withdraw consent</strong>: You may withdraw consent at any time by deleting your account.
          Withdrawal does not affect the lawfulness of prior processing.
        </li>
        <li>
          <strong>Right to lodge a complaint</strong>: You may file a complaint with the Saudi Data and AI Authority
          (SDAIA) at <a href="https://sdaia.gov.sa" target="_blank" rel="noopener noreferrer">sdaia.gov.sa</a>
        </li>
      </ul>

      <h2>8. Security</h2>
      <p>
        We implement technical and organizational security measures including: TLS encryption in transit,
        cryptographically random API keys, parameterized database queries, rate limiting, CORS lockdown,
        and security headers. See our <a href="https://github.com/dhnpmp-tech/dcp-platform/blob/main/SECURITY.md">Security Policy</a> for
        full details including our vulnerability disclosure process.
      </p>
      <p>
        In the event of a personal data breach, we will notify affected users and SDAIA within <strong>72 hours</strong> of
        discovery, as required by PDPL Article 19.
      </p>

      <h2>9. Cookies and Local Storage</h2>
      <p>
        DCP uses browser <strong>localStorage</strong> to store your API key for session persistence.
        No tracking cookies or third-party advertising trackers are used. No cookies are set by the DCP API.
      </p>

      <h2>10. Third-Party Services</h2>
      <ul>
        <li><strong>Billing partner</strong>: payment data is handled through our configured payment partner, using standard security practices.</li>
        <li><strong>Vercel</strong>: Frontend hosting and CDN (edge caching of pages, no PII stored)</li>
        <li><strong>Supabase</strong>: Real-time data sync for provider metrics (anonymized aggregate data only)</li>
      </ul>

      <h2>11. Changes to This Policy</h2>
      <p>
        We will notify registered users of material changes via email at least 14 days before changes take effect.
        The &ldquo;Last Updated&rdquo; date at the top of this policy reflects the most recent revision.
      </p>

      <h2>12. Contact</h2>
      <ul>
        <li>Privacy inquiries (PDPL rights requests): <a href="mailto:privacy@dcp.sa">privacy@dcp.sa</a></li>
        <li>Security vulnerabilities: <a href="mailto:security@dcp.sa">security@dcp.sa</a></li>
        <li>General support: <a href="mailto:support@dcp.sa">support@dcp.sa</a></li>
      </ul>
    </LegalPage>
  )
}
