export const metadata = {
  title: 'PDPL Policy — DCP',
  description: 'DCP Personal Data Protection Law (PDPL) policy.',
}

export default function PdplPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-dc1-text-primary">
      <h1 className="text-3xl font-bold">PDPL Policy</h1>
      <p className="mt-6 whitespace-pre-line text-dc1-text-secondary">
        {`DCP's Personal Data Protection Law (PDPL) policy is being finalized.

For the current draft or questions about how DCP processes provider data, contact setup@oida.ae.

Data we collect during provider onboarding:
• Full name, phone number, city, country — required by PDPL Article 4 for data-controller obligations
• Your GPU hardware specs and operational telemetry — required to match you to workloads
• Payout wallet address and transaction history — required for settlements

We do not sell or share this data with third parties outside the payout rail and our cloud infrastructure providers.`}
      </p>
    </main>
  )
}
