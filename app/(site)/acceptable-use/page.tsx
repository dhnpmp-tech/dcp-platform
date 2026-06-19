import LegalShell from '../components/chrome/LegalShell'

export default function AcceptableUsePage() {
  return (
    <LegalShell title="Acceptable Use Policy" lastUpdated="March 12, 2026">
      <h2>Overview</h2>
      <p>This Acceptable Use Policy applies to all users of the DCP GPU compute marketplace, including both providers and renters. Violations may result in immediate account suspension.</p>

      <h2>Permitted Uses</h2>
      <p>DCP compute resources may be used for:</p>
      <ul>
        <li>Machine learning model training and inference</li>
        <li>AI image and text generation</li>
        <li>Scientific computing and data analysis</li>
        <li>Software development and testing</li>
        <li>Academic and research workloads</li>
        <li>Any other lawful computational task</li>
      </ul>

      <h2>Prohibited Uses</h2>
      <p>The following activities are strictly prohibited on the DCP platform:</p>
      <ul>
        <li><strong>Cryptocurrency mining</strong> — Mining, staking, or any blockchain computation</li>
        <li><strong>Malicious software</strong> — Development or deployment of malware, ransomware, or exploits</li>
        <li><strong>Network attacks</strong> — DDoS, port scanning, or unauthorized access attempts</li>
        <li><strong>Illegal content</strong> — Processing, generating, or storing content that violates applicable laws</li>
        <li><strong>Spam and abuse</strong> — Mass messaging, phishing, or social engineering</li>
        <li><strong>Unauthorized resale</strong> — Reselling DCP compute without written authorization</li>
        <li><strong>Resource abuse</strong> — Intentionally overloading or degrading provider hardware</li>
      </ul>

      <h2>Provider Obligations</h2>
      <p>Providers must ensure their hardware is maintained in good working condition, respond to platform health checks, and not artificially inflate uptime or performance metrics.</p>

      <h2>Enforcement</h2>
      <p>DCP reserves the right to monitor usage patterns for compliance. Violations will result in warnings, temporary suspension, or permanent account termination depending on severity. Appeals may be directed to <a href="mailto:abuse@dcp.sa">abuse@dcp.sa</a>.</p>

      <h2>Reporting Violations</h2>
      <p>If you observe a violation of this policy, please report it to <a href="mailto:abuse@dcp.sa">abuse@dcp.sa</a>.</p>
    </LegalShell>
  )
}
