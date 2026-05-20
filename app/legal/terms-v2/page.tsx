import LegalPage from '../../components/layout/LegalPage'
import DraftBanner from '../../components/layout/DraftBanner'

export const metadata = {
  title: 'Terms of Service (Draft v2) | DCP',
  description:
    'PDPL-aligned Terms of Service draft for DC Power Solutions Company (dcp.sa). Pending Saudi legal counsel review — not the effective ToS.',
  robots: { index: false, follow: false },
}

export default function TermsV2DraftPage() {
  return (
    <LegalPage title="Terms of Service — Draft v2" lastUpdated="2026-05-20">
      <DraftBanner />

      <p>
        <strong>Effective Date:</strong> [TBD]
        <br />
        <strong>Company:</strong> DC Power Solutions Company, registered Saudi LLC (Riyadh), Commercial
        Registration No. 7053667775
        <br />
        <strong>Contact:</strong> <a href="mailto:legal@dcp.sa">legal@dcp.sa</a>
      </p>

      <h2>1. Definitions</h2>
      <ul>
        <li>
          <strong>&ldquo;DCP&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;:</strong> DC Power Solutions Company, a Saudi
          Limited Liability Company registered in the Kingdom of Saudi Arabia under Commercial Registration No.
          7053667775, with offices at [TBD].
        </li>
        <li>
          <strong>&ldquo;Service&rdquo;:</strong> the GPU inference marketplace operated at dcp.sa, including the
          api.dcp.sa endpoint.
        </li>
        <li>
          <strong>&ldquo;Renter&rdquo;:</strong> a person or entity that purchases inference compute via the Service.
        </li>
        <li>
          <strong>&ldquo;Provider&rdquo;:</strong> a person or entity that supplies GPU compute capacity to the
          Service under a separate Provider Agreement.
        </li>
        <li>
          <strong>&ldquo;Inference Job&rdquo;:</strong> a single API request submitted by a Renter and routed to a
          Provider for execution.
        </li>
        <li>
          <strong>&ldquo;User&rdquo;:</strong> any natural person interacting with the Service, whether Renter or
          Provider representative.
        </li>
        <li>
          <strong>&ldquo;Personal Data&rdquo;:</strong> as defined under the Saudi Personal Data Protection Law.
        </li>
        <li>
          <strong>&ldquo;PDPL&rdquo;:</strong> the Saudi Personal Data Protection Law (Royal Decree M/19 of 1443H,
          as amended).
        </li>
        <li>
          <strong>&ldquo;Content&rdquo;:</strong> any prompt, input, output, file, or data submitted to or generated
          by the Service.
        </li>
      </ul>

      <h2>2. Acceptance and Eligibility</h2>
      <p>2.1 By creating an account or using the Service, you agree to these Terms.</p>
      <p>
        2.2 <strong>Eligibility:</strong> You must be (a) at least 18 years old, (b) legally able to enter contracts
        under KSA law, and (c) if registering on behalf of a company, duly authorised to bind that company.
      </p>
      <p>
        2.3 <strong>Commercial users</strong> registering as a business must provide a valid Saudi Commercial
        Registration (CR) number or equivalent foreign business registration. DCP may verify CR status via the
        Ministry of Commerce.
      </p>
      <p>2.4 DCP reserves the right to refuse service to any User without stating reasons, subject to PDPL Art. 4.</p>

      <h2>3. The Service</h2>
      <p>
        3.1 DCP operates a <strong>marketplace</strong> connecting Renters who need GPU inference with Providers who
        supply it. <strong>DCP is not the provider of compute capacity itself; Providers are independent third
        parties.</strong>
      </p>
      <p>
        3.2 DCP routes each Inference Job to a Provider machine located in the Kingdom of Saudi Arabia, connected via
        the DCP secure mesh network.
      </p>
      <p>
        3.3 <strong>Data residency commitment:</strong> All Inference Jobs are processed on Provider machines
        physically located in KSA. Prompt content and outputs do not leave KSA in the course of routing. (Backups,
        observability, and aggregated analytics may use KSA-based infrastructure only — see Privacy Policy.)
      </p>

      <h2>4. Acceptable Use Policy</h2>
      <p>
        4.1 <strong>Prohibited Content.</strong> Users shall not submit, generate, or distribute via the Service any
        Content that:
      </p>
      <ul>
        <li>(a) violates Islamic Sharia principles or the laws and regulations of the Kingdom of Saudi Arabia;</li>
        <li>(b) is blasphemous, insulting to Islam or any prophet, the Quran, or the Prophetic Sunnah;</li>
        <li>(c) promotes or facilitates atheism in the form prohibited under KSA law;</li>
        <li>(d) promotes alcohol, illicit drugs, pork products, gambling, pornography, or prostitution;</li>
        <li>
          (e) constitutes harassment, defamation, or invasion of privacy of any natural or legal person, including
          members of the Saudi Royal Family;
        </li>
        <li>
          (f) is critical of the Kingdom, its institutions, leadership, official religion, or national symbols, in a
          manner prohibited by KSA law (including the Anti-Cyber Crime Law and the Press and Publications Law);
        </li>
        <li>(g) supports terrorism, extremism, or any organisation designated by KSA authorities;</li>
        <li>(h) infringes any third-party intellectual property right;</li>
        <li>
          (i) contains malware, exploits, or is used to attack, scrape, reverse-engineer, or overload the Service or
          any third-party system;
        </li>
        <li>(j) violates the Saudi Anti-Cyber Crime Law (Royal Decree M/17 of 1428H);</li>
        <li>(k) violates PDPL — including processing of third-party personal data without lawful basis;</li>
        <li>
          (l) is used to generate synthetic identification documents, deepfakes of real persons without consent, or
          content intended to deceive any KSA government entity.
        </li>
      </ul>
      <p>
        4.2 <strong>Sensitive use cases.</strong> Healthcare, financial advisory, legal advisory, and minor-targeted
        content require Renter to confirm a separate compliance attestation. DCP may decline such use without
        notice.
      </p>
      <p>
        4.3 <strong>Content responsibility.</strong> Renter is solely responsible for the Content it submits and the
        outputs it relies on. DCP does not pre-screen Content. DCP may suspend any account where prohibited Content
        is detected via abuse monitoring or third-party complaint.
      </p>

      <h2>5. Pricing and Payment</h2>
      <p>
        5.1 <strong>Pricing.</strong> Inference is priced per token, per second of GPU time, or per request, as
        published at dcp.sa/pricing. All prices are in <strong>Saudi Riyals (SAR)</strong> and inclusive of
        applicable VAT (15% as of the date of these Terms).
      </p>
      <p>
        5.2 <strong>Minimum top-up:</strong> SAR 5.
      </p>
      <p>
        5.3 <strong>Payment methods:</strong> Payments are processed via Moyasar or other SAMA-licensed payment
        service providers. DCP does not store full card details; tokenised references only.
      </p>
      <p>
        5.4 <strong>Refunds.</strong> Prepaid credit is refundable for <strong>30 days</strong> from the date of
        purchase, less any inference consumed, less a processing fee not exceeding 2.5% (passed through from the
        payment gateway). After 30 days, prepaid credit is non-refundable but does not expire for 12 months from
        last activity. <strong>Saudi lawyer to confirm — KSA consumer protection law may require a longer refund
        window for natural-person consumers.</strong>
      </p>
      <p>
        5.5 <strong>Taxes.</strong> Renter is responsible for any taxes, withholdings, or duties imposed by
        jurisdictions outside KSA. KSA VAT is collected and remitted by DCP.
      </p>
      <p>
        5.6 <strong>Disputed charges</strong> must be raised within 60 days via <a href="mailto:billing@dcp.sa">billing@dcp.sa</a>.
      </p>

      <h2>6. Renter Obligations</h2>
      <p>6.1 Comply with Section 4 (Acceptable Use).</p>
      <p>
        6.2 Keep API keys confidential. Renter is liable for all usage under its keys until DCP receives a revocation
        notice.
      </p>
      <p>
        6.3 Comply with PDPL when submitting prompts containing personal data of third parties — Renter is the{' '}
        <strong>Controller</strong> of such data; DCP is the <strong>Processor</strong>.
      </p>
      <p>6.4 Do not exceed published rate limits or attempt to circumvent them.</p>

      <h2>7. Intellectual Property</h2>
      <p>
        7.1 <strong>Renter owns its inputs and outputs.</strong> All prompts submitted by Renter and all outputs
        generated for Renter remain Renter&rsquo;s property, subject to underlying model licences.
      </p>
      <p>
        7.2 <strong>No training on Renter Content.</strong> DCP and its Providers shall not use Renter prompts or
        outputs to train, fine-tune, or otherwise improve any AI model, except where Renter has explicitly opted in
        via a separate written agreement.
      </p>
      <p>
        7.3 <strong>DCP IP.</strong> The Service, API, and documentation are owned by DCP and licensed to Renter on
        a non-exclusive, revocable basis for use of the Service.
      </p>
      <p>
        7.4 <strong>Open-source model licences.</strong> Some models routed via DCP are subject to upstream licences
        (Apache 2.0, Llama Community Licence, etc.). Renter is responsible for compliance with the licence of the
        specific model selected.
      </p>

      <h2>8. Liability</h2>
      <p>
        8.1 <strong>Liability cap.</strong> To the maximum extent permitted by applicable law, DCP&rsquo;s total
        cumulative liability for any claim arising out of or related to the Service shall not exceed the{' '}
        <strong>greater of (a) the fees paid by Renter to DCP in the 12 months preceding the event giving rise to
        the claim, or (b) SAR 1,000</strong>. <strong>Saudi lawyer to confirm — KSA courts may reduce or set aside
        contractual liability caps for gross negligence or wilful misconduct, and may not honour them at all against
        natural-person consumers.</strong>
      </p>
      <p>
        8.2 <strong>Excluded losses.</strong> DCP is not liable for indirect, consequential, special, or punitive
        damages, lost profits, lost data, or business interruption.
      </p>
      <p>
        8.3 <strong>Service &ldquo;as is&rdquo;.</strong> The Service is provided on an &ldquo;as available&rdquo;
        basis without warranties of fitness for a particular purpose. Model outputs are non-deterministic and may be
        inaccurate. Renter is responsible for validating outputs before relying on them in any high-stakes decision.
      </p>
      <p>
        8.4 <strong>Indemnity.</strong> Renter shall indemnify DCP against any third-party claim arising from
        Renter&rsquo;s Content or use of outputs in violation of Section 4.
      </p>

      <h2>9. Suspension and Termination</h2>
      <p>
        9.1 DCP may suspend or terminate any account immediately upon: (a) breach of Section 4, (b) payment failure,
        (c) order of a KSA regulator or court, (d) reasonable suspicion of fraud, or (e) 12 months of inactivity.
      </p>
      <p>9.2 Renter may terminate at any time via account settings. Outstanding balances may be refunded per Section 5.4.</p>
      <p>9.3 Upon termination, DCP will delete Renter data within 30 days subject to legal retention obligations (Section 12).</p>

      <h2>10. Force Majeure</h2>
      <p>
        Neither party is liable for failure to perform caused by events beyond reasonable control, including natural
        disasters, war, civil unrest, government action, telecommunications failure, or actions of internet service
        providers. DCP will use reasonable efforts to maintain service and provide notice of material disruptions.
      </p>

      <h2>11. Modifications</h2>
      <p>
        11.1 DCP may amend these Terms by posting the revised version at dcp.sa/terms and providing{' '}
        <strong>30 days&rsquo; notice</strong> to Renter via email for material changes. Continued use after the
        effective date constitutes acceptance.
      </p>
      <p>11.2 Pricing changes apply only to top-ups made after the effective date.</p>

      <h2>12. Data Protection</h2>
      <p>
        12.1 DCP&rsquo;s processing of personal data is governed by the Privacy Policy at dcp.sa/privacy, which
        forms part of these Terms.
      </p>
      <p>
        12.2 <strong>Roles under PDPL:</strong>
      </p>
      <ul>
        <li>(a) For Renter account data — DCP is <strong>Controller</strong>.</li>
        <li>
          (b) For Content (prompts/outputs) submitted by Renter — Renter is <strong>Controller</strong>, DCP is{' '}
          <strong>Processor</strong>, Providers are <strong>Sub-Processors</strong>.
        </li>
      </ul>
      <p>
        12.3 DCP and its Providers undertake to process such Content only on Renter&rsquo;s documented instructions
        (i.e., to fulfil the requested Inference Job).
      </p>

      <h2>13. Governing Law and Dispute Resolution</h2>
      <p>13.1 These Terms are governed by the laws and regulations of the Kingdom of Saudi Arabia.</p>
      <p>
        13.2 <strong>Disputes</strong> shall be resolved in good faith by negotiation. Failing that, disputes shall
        be referred to the <strong>Commercial Court of Riyadh</strong>. <strong>Saudi lawyer to confirm whether
        arbitration via the Saudi Center for Commercial Arbitration (SCCA) is preferable for B2B Renters, and
        whether the Banking Disputes Committee at SAMA has jurisdiction over any payment-related disputes.</strong>
      </p>
      <p>13.3 Nothing in this clause prevents either party from seeking interim relief in any competent court.</p>

      <h2>14. Notices</h2>
      <p>14.1 Notices to DCP: <a href="mailto:legal@dcp.sa">legal@dcp.sa</a> with copy to [physical address TBD].</p>
      <p>14.2 Notices to Renter: the email address registered to the account.</p>

      <h2>15. Miscellaneous</h2>
      <p>
        15.1 <strong>Entire agreement.</strong> These Terms plus the Privacy Policy plus any signed order form
        constitute the entire agreement.
      </p>
      <p>15.2 <strong>Severability.</strong> Invalid provisions are severed; the remainder remains in force.</p>
      <p>15.3 <strong>No waiver.</strong> Failure to enforce a right is not a waiver.</p>
      <p>
        15.4 <strong>Assignment.</strong> Renter may not assign without DCP&rsquo;s written consent. DCP may assign
        in a corporate reorganisation.
      </p>
      <p>
        15.5 <strong>Language.</strong> The Arabic version is the controlling version in case of conflict with this
        English version. <strong>Saudi lawyer to translate.</strong>
      </p>
    </LegalPage>
  )
}
