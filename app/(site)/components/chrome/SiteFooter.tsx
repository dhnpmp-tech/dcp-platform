'use client'

// Shared NEW footer — the editorial-luxury sitemap footer used to wrap EVERY
// page in the app/(site) group. Lifted from the redesigned home so re-shelled
// legacy pages render the SAME footer instead of the old layout/Footer.tsx.

import Link from 'next/link'
import { Bi } from '@/app/(site)/lib/i18n'

export default function SiteFooter() {
  return (
    <footer className="site foot">
      <div className="foot-grid">
        <div>
          <div className="brand">
            DCP<i>∞</i>
          </div>
          <p className="desc">
            <Bi
              en="Sovereign Arabic AI — inference, agents, and a KSA GPU mesh. Built by DC Power Solutions Co., Riyadh."
              ar="ذكاء اصطناعي عربي سيادي — استدلال ووكلاء وشبكة معالجات داخل المملكة. من بناء DC Power Solutions Co.، الرياض."
            />
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="residency-badge ksa">
              <span className="flag">🇸🇦</span> <span><Bi en="KSA-resident" ar="داخل المملكة" /></span>
            </span>
            <span className="residency-badge">
              <span className="flag">∞</span> <span><Bi en="agents.dcp.sa" ar="agents.dcp.sa" /></span>
            </span>
          </div>
        </div>

        <div>
          <h4><Bi en="Product" ar="المنتج" /></h4>
          <ul>
            <li><Link href="/"><Bi en="Overview" ar="نظرة عامة" /></Link></li>
            <li><Link href="/pods"><Bi en="GPU Pods" ar="حاويات GPU" /></Link></li>
            <li><Link href="/inference"><Bi en="Inference" ar="الاستدلال" /></Link></li>
            <li><Link href="/fine-tuning"><Bi en="Fine-Tuning" ar="الضبط الدقيق" /></Link></li>
            <li><Link href="/batch"><Bi en="Batch" ar="الدُفعات" /></Link></li>
            <li><Link href="/dedicated-deployments"><Bi en="Deployments" ar="النشر" /></Link></li>
            <li><Link href="/benchmarks"><Bi en="Benchmarks" ar="القياسات" /></Link></li>
            <li><Link href="/agents"><Bi en="Agents" ar="الوكلاء" /></Link></li>
            <li><Link href="/architecture"><Bi en="Architecture" ar="البنية" /></Link></li>
            <li><Link href="/pricing"><Bi en="Pricing" ar="الأسعار" /></Link></li>
          </ul>
        </div>

        <div>
          <h4><Bi en="Build" ar="البناء" /></h4>
          <ul>
            <li><Link href="/docs"><Bi en="API docs" ar="توثيق الواجهة" /></Link></li>
            <li><Link href="/setup"><Bi en="Get an API key" ar="احصل على مفتاح" /></Link></li>
            <li><Link href="/renter/playground"><Bi en="Playground" ar="بيئة الاختبار" /></Link></li>
            <li><Link href="/status"><Bi en="Status" ar="الحالة" /></Link></li>
          </ul>
        </div>

        <div>
          <h4><Bi en="Renters" ar="المستخدمون" /></h4>
          <ul>
            <li><Link href="/setup"><Bi en="Sign up" ar="اشترك" /></Link></li>
            <li><Link href="/auth"><Bi en="Sign in" ar="دخول" /></Link></li>
            <li><Link href="/renter/dashboard"><Bi en="Console" ar="لوحة التحكم" /></Link></li>
            <li><Link href="/renter/usage"><Bi en="Usage" ar="الاستخدام" /></Link></li>
            <li><Link href="/renter/wallet"><Bi en="Wallet" ar="المحفظة" /></Link></li>
          </ul>
        </div>

        <div>
          <h4><Bi en="Company" ar="الشركة" /></h4>
          <ul>
            <li><Link href="/provider-setup"><Bi en="Become a provider" ar="كن مزوّداً" /></Link></li>
            <li><Link href="/support"><Bi en="Support" ar="الدعم" /></Link></li>
            <li><Link href="/trust-center"><Bi en="Trust center" ar="مركز الثقة" /></Link></li>
            <li><Link href="/security"><Bi en="Security" ar="الأمن" /></Link></li>
            <li><Link href="/terms"><Bi en="Terms" ar="الشروط" /></Link></li>
            <li><Link href="/privacy"><Bi en="Privacy" ar="الخصوصية" /></Link></li>
            <li><Link href="/acceptable-use"><Bi en="Acceptable use" ar="الاستخدام المقبول" /></Link></li>
          </ul>
        </div>
      </div>

      <div className="foot-bottom">
        <span>§ DC Power Solutions Company · CR 7053667775 · VAT 311102233400003</span>
        <div className="badges">
          <span className="residency-badge ksa" style={{ fontSize: 10, padding: '3px 8px' }}>PDPL</span>
          <span className="residency-badge ksa" style={{ fontSize: 10, padding: '3px 8px' }}>KSA-resident</span>
          <span className="residency-badge ksa" style={{ fontSize: 10, padding: '3px 8px' }}>ZATCA</span>
        </div>
        <span>© 2026 · Riyadh · KSA</span>
      </div>
    </footer>
  )
}
