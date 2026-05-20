import LegalPage from '../components/layout/LegalPage'

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" lastUpdated="March 12, 2026">
      <p style={{ fontSize: '0.85rem', opacity: 0.75 }}>
        Reviewers: an expanded PDPL-aligned draft is available at{' '}
        <a href="/legal/terms-v2">/legal/terms-v2</a> (and{' '}
        <a href="/legal/privacy-v2">/legal/privacy-v2</a>), pending Saudi legal counsel review. The text below
        remains the effective Terms of Service.
      </p>

      <h2>1. Acceptance of Terms</h2>
      <p>By accessing or using the DCP platform (&quot;Service&quot;), operated by DC Power Solutions Company (CR: 7053667775), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.</p>

      <h2>2. Description of Service</h2>
      <p>DCP is a GPU compute marketplace that connects GPU providers with renters who need computational resources. Providers share their GPU hardware, and renters pay for compute time at published rates.</p>

      <h2>3. Account Registration</h2>
      <p>To use DCP, you must register for an account and provide accurate information. You are responsible for safeguarding your API key. You must not share your API key with unauthorized parties.</p>

      <h2>4. Provider Responsibilities</h2>
      <p>Providers agree to make their GPU hardware available as described during registration. Providers must ensure their hardware meets minimum requirements and maintain reasonable uptime. DCP is not responsible for hardware failures on provider equipment.</p>

      <h2>5. Renter Responsibilities</h2>
      <p>Renters agree to use GPU compute resources only for lawful purposes. Renters must not use the Service for cryptocurrency mining, attacks on third-party systems, or processing of illegal content.</p>

      <h2>6. Billing and Payments</h2>
      <p>Renter usage of the inference API is billed in Saudi halala (1/100 SAR) per million tokens at the published per-model rate. The current rate card by model class is maintained at <a href="https://dcp.sa/pricing">dcp.sa/pricing</a>; rates may change with at least 30 days&apos; prior notice for active subscribers. Renters may pay-as-you-go from a prepaid balance, or subscribe to a monthly tier that grants a SAR credit allotment plus a uniform percentage discount on every model&apos;s per-token rate. Pay-as-you-go top-up balance does not expire. Subscription monthly credit not consumed by the end of the billing period rolls over for thirty (30) days, then expires. GPU-hour rental, where offered, is billed per minute. Provider compensation is determined by a published revenue-share schedule and is paid in halala. Disputes regarding usage metering must be raised within thirty (30) days of the disputed charge via <a href="mailto:billing@dcp.sa">billing@dcp.sa</a>. A draft of the renewed terms with full per-class detail is being prepared at <a href="/legal/terms-v2">/legal/terms-v2</a> and will replace this section once Saudi counsel signoff lands.</p>

      <h2>7. Prohibited Uses</h2>
      <p>You may not use DCP to:</p>
      <ul>
        <li>Engage in cryptocurrency mining or blockchain computation</li>
        <li>Launch denial-of-service attacks or other malicious activities</li>
        <li>Process, store, or transmit illegal content</li>
        <li>Reverse engineer or attempt to gain unauthorized access to DCP systems</li>
        <li>Resell compute resources without authorization</li>
      </ul>

      <h2>8. Limitation of Liability</h2>
      <p>DCP is provided &quot;as is&quot; without warranties. DC Power Solutions Company shall not be liable for indirect, incidental, or consequential damages arising from the use of the Service.</p>

      <h2>9. Termination</h2>
      <p>We may suspend or terminate your account at any time for violations of these Terms. You may close your account at any time by contacting support.</p>

      <h2>10. Governing Law</h2>
      <p>These Terms are governed by the laws of the Kingdom of Saudi Arabia. Disputes shall be resolved in the courts of Riyadh.</p>

      <h2>11. Contact</h2>
      <p>Questions about these Terms may be directed to <a href="mailto:legal@dcp.sa">legal@dcp.sa</a>.</p>
    </LegalPage>
  )
}
