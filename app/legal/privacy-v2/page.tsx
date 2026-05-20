import LegalPage from '../../components/layout/LegalPage'
import DraftBanner from '../../components/layout/DraftBanner'

export const metadata = {
  title: 'Privacy Policy (Draft v2) | DCP',
  description:
    'PDPL-aligned Privacy Policy draft for DC Power Solutions Company (dcp.sa). Pending Saudi legal counsel review — not the effective policy.',
  robots: { index: false, follow: false },
}

export default function PrivacyV2DraftPage() {
  return (
    <LegalPage title="Privacy Policy — Draft v2" lastUpdated="2026-05-20">
      <DraftBanner />

      <p>
        <strong>Effective Date:</strong> [TBD]
        <br />
        <strong>Last Updated:</strong> [TBD]
      </p>

      <h2>1. Who we are</h2>
      <p>
        DCP (operated by DC Power Solutions Company, CR No. 7053667775) is the controller of personal data processed
        via dcp.sa, except where these Terms identify Renter as Controller for prompt content. We are based in the
        Kingdom of Saudi Arabia. Contact: <a href="mailto:privacy@dcp.sa">privacy@dcp.sa</a>.
      </p>

      <h2>2. Data we collect</h2>
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Specific data</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Account data</td>
            <td>Name, email, phone, password hash, CR number (if commercial)</td>
            <td>You, at registration</td>
          </tr>
          <tr>
            <td>Billing data</td>
            <td>Payment method token, transaction history, billing address, VAT number</td>
            <td>You / Moyasar (payment processor)</td>
          </tr>
          <tr>
            <td>Authentication data</td>
            <td>API keys (hashed), session tokens, login timestamps, IP address</td>
            <td>Generated on use</td>
          </tr>
          <tr>
            <td>Usage data</td>
            <td>Request count, token count, model selected, latency, error logs, timestamps</td>
            <td>Service</td>
          </tr>
          <tr>
            <td>Content (transient)</td>
            <td>Prompts and outputs of Inference Jobs</td>
            <td>You</td>
          </tr>
          <tr>
            <td>Communications</td>
            <td>Support tickets, emails, in-app messages</td>
            <td>You</td>
          </tr>
          <tr>
            <td>Device data</td>
            <td>Browser, OS, device type, IP-derived city/region</td>
            <td>Your device</td>
          </tr>
        </tbody>
      </table>

      <h2>3. Lawful basis (PDPL Art. 6)</h2>
      <table>
        <thead>
          <tr>
            <th>Processing purpose</th>
            <th>Lawful basis</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Operate your account</td>
            <td>Contract performance</td>
          </tr>
          <tr>
            <td>Process payments and issue VAT invoices</td>
            <td>Contract + legal obligation (ZATCA)</td>
          </tr>
          <tr>
            <td>Route Inference Jobs to Providers</td>
            <td>Contract</td>
          </tr>
          <tr>
            <td>Detect fraud and abuse</td>
            <td>Legitimate interests</td>
          </tr>
          <tr>
            <td>Send service announcements</td>
            <td>Contract</td>
          </tr>
          <tr>
            <td>Send marketing emails</td>
            <td>Consent (separate opt-in)</td>
          </tr>
          <tr>
            <td>Respond to law enforcement requests</td>
            <td>Legal obligation</td>
          </tr>
          <tr>
            <td>Improve aggregated service metrics</td>
            <td>Legitimate interests (anonymised)</td>
          </tr>
        </tbody>
      </table>

      <h2>4. How we use your data</h2>
      <p>
        We use personal data only for the purposes listed in Section 3. We do not sell personal data. We do not use
        Renter prompts or outputs to train AI models.
      </p>

      <h2>5. Who receives your data</h2>
      <ul>
        <li>
          <strong>Providers</strong> on the DCP mesh network receive your Inference Job content for the duration of
          execution only. Providers are bound by a Provider Agreement that requires data residency in KSA, deletion
          after execution, and a data-processing addendum aligned with PDPL.
        </li>
        <li>
          <strong>Payment processors:</strong> Moyasar (or such other SAMA-licensed processor as DCP uses), which
          holds card data under its own privacy terms.
        </li>
        <li>
          <strong>KSA tax authorities (ZATCA):</strong> invoice metadata, as required by the VAT Law.
        </li>
        <li>
          <strong>KSA regulators and courts:</strong> on lawful demand.
        </li>
        <li>
          <strong>DCP staff and contractors:</strong> on a need-to-know basis, bound by confidentiality.
        </li>
        <li>
          <strong>Successor entity</strong> in the event of merger or acquisition.
        </li>
      </ul>
      <p>
        We do <strong>not</strong> share personal data with advertising networks. We do <strong>not</strong> use
        third-party analytics that exfiltrate personal data outside KSA. [Confirm Plausible / self-hosted analytics
        setup — Saudi lawyer to confirm if any tag remains.]
      </p>

      <h2>6. Cross-border transfers</h2>
      <p>
        <strong>All Inference Jobs are processed on Provider machines located in the Kingdom of Saudi Arabia.</strong>{' '}
        Prompt content and outputs do not leave KSA in the course of routing.
      </p>
      <p>
        Limited categories of personal data may be processed outside KSA where strictly necessary and subject to PDPL
        Art. 29 safeguards:
      </p>
      <ul>
        <li>
          [List any non-KSA SaaS — e.g., email delivery, observability — or state &ldquo;None at this
          time.&rdquo;] <strong>Audit this list before publishing.</strong>
        </li>
      </ul>
      <p>
        If you are a Renter located outside KSA, you are responsible for compliance with your own jurisdiction&rsquo;s
        outbound transfer rules when you send data to dcp.sa.
      </p>

      <h2>7. Retention</h2>
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Retention</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Account profile</td>
            <td>Life of account + 30 days post-deletion</td>
          </tr>
          <tr>
            <td>Billing records (invoices, VAT)</td>
            <td>6 years (ZATCA requirement)</td>
          </tr>
          <tr>
            <td>Prompt content / outputs</td>
            <td>Not retained beyond execution unless you opt in to history</td>
          </tr>
          <tr>
            <td>API request metadata (no payload)</td>
            <td>90 days</td>
          </tr>
          <tr>
            <td>Authentication / security logs</td>
            <td>90 days</td>
          </tr>
          <tr>
            <td>Marketing consent records</td>
            <td>Life of consent + 2 years</td>
          </tr>
          <tr>
            <td>Breach incident records</td>
            <td>Permanent</td>
          </tr>
        </tbody>
      </table>

      <h2>8. Your rights (PDPL Art. 4)</h2>
      <p>You have the right to:</p>
      <ul>
        <li>Be informed about processing of your personal data.</li>
        <li>Access your personal data and obtain a copy in a readable format.</li>
        <li>Correct inaccurate or incomplete data.</li>
        <li>Request destruction of your personal data where no longer necessary or consent is withdrawn.</li>
        <li>Withdraw consent at any time (for processing based on consent).</li>
        <li>Lodge a complaint with the Saudi Data and AI Authority (SDAIA).</li>
      </ul>
      <p>
        <strong>How to exercise:</strong> email <a href="mailto:privacy@dcp.sa">privacy@dcp.sa</a> or use the in-app
        &ldquo;My Data&rdquo; panel. We will respond within <strong>30 days</strong>, extendable once by a further
        30 days with notice.
      </p>

      <h2>9. Security</h2>
      <p>We protect personal data with industry-standard measures:</p>
      <ul>
        <li>
          TLS 1.3 in transit, AES-256 at rest (Saudi lawyer / security review to confirm — must reflect actual
          implementation).
        </li>
        <li>API keys stored as one-way hashes.</li>
        <li>Network segregation; Provider machines accessed only via WireGuard mesh.</li>
        <li>Least-privilege access for staff.</li>
        <li>72-hour breach notification process aligned to PDPL Art. 20.</li>
      </ul>
      <p>No system is 100% secure. You are responsible for keeping your API keys and credentials confidential.</p>

      <h2>10. Cookies and similar technologies</h2>
      <p>dcp.sa uses the following categories of cookies and local storage:</p>
      <ul>
        <li>
          <strong>Strictly necessary:</strong> session, CSRF, authentication. Cannot be disabled.
        </li>
        <li>
          <strong>Functional:</strong> language, theme preference. Disabling does not block use.
        </li>
        <li>
          <strong>Analytics:</strong> [confirm — e.g., self-hosted Plausible with no PII / no third-party
          transfer]. Disable via the cookie banner.
        </li>
        <li>
          <strong>Marketing:</strong> <strong>None at present.</strong> If added, explicit opt-in via banner.
        </li>
      </ul>
      <p>See Section 11 for consent mechanism.</p>

      <h2>11. Cookie consent</h2>
      <p>
        On first visit and at least every 12 months, dcp.sa displays a consent banner offering &ldquo;Accept
        all,&rdquo; &ldquo;Reject non-essential,&rdquo; and &ldquo;Customise.&rdquo; Consent records are retained per
        Section 7. Strictly necessary cookies do not require consent under PDPL Implementing Regulations (Saudi
        lawyer to confirm).
      </p>

      <h2>12. Children</h2>
      <p>
        The Service is not directed at users under 18. We do not knowingly collect personal data from minors. If you
        believe a minor has registered, email <a href="mailto:privacy@dcp.sa">privacy@dcp.sa</a> for immediate
        deletion.
      </p>

      <h2>13. Data Protection Officer</h2>
      <p>
        DCP has appointed a Data Protection Officer. Contact: <a href="mailto:dpo@dcp.sa">dpo@dcp.sa</a>.
      </p>

      <h2>14. Changes to this policy</h2>
      <p>
        We will notify Users of material changes by email and prominent notice on dcp.sa at least 30 days before
        they take effect.
      </p>

      <h2>15. Contact and complaints</h2>
      <ul>
        <li>Privacy questions: <a href="mailto:privacy@dcp.sa">privacy@dcp.sa</a></li>
        <li>Data protection officer: <a href="mailto:dpo@dcp.sa">dpo@dcp.sa</a></li>
        <li>
          SDAIA: <a href="https://sdaia.gov.sa" target="_blank" rel="noopener noreferrer">https://sdaia.gov.sa</a>{' '}
          (regulator)
        </li>
      </ul>
    </LegalPage>
  )
}
