import ModelReadinessPage, { type ModelPageConfig } from '../ModelReadinessPage'

const config: ModelPageConfig = {
  slug: 'allam',
  active: '/inference',
  matchTerms: ['allam'],
  defaultModelId: 'ALLaM-AI/ALLaM-7B-Instruct-preview',
  logoSrc: '/arabic-ai-logos/allam-humain.png',
  logoAlt: 'ALLaM and HUMAIN logo',
  eyebrowEn: 'ALLaM on DCP · catalog-aware',
  eyebrowAr: 'ALLaM على DCP · واعي بالكتالوج',
  titleEn: 'ALLaM for Saudi Arabic workloads',
  titleAr: 'ALLaM لأحمال اللغة العربية السعودية',
  italicEn: 'shown only as far as the live fleet proves',
  italicAr: 'كما يثبته الأسطول الحي فقط',
  leadEn: 'This page packages the ALLaM path honestly: read /v1/models for availability, pricing, context, and feature readiness; use the page as a developer landing surface, not as a promise that ALLaM is currently served when provider_count is zero.',
  leadAr: 'تغلف هذه الصفحة مسار ALLaM بصدق: اقرأ /v1/models للتوفر والأسعار والسياق وجاهزية الميزات؛ استخدم الصفحة كسطح مطور، لا كوعد بأن ALLaM مخدوم حالياً عندما يكون provider_count صفراً.',
  intentEn: 'ALLaM is the local Arabic anchor, but DCP should only send traffic when the model has verified providers. Dedicated deployment and LoRA serving stay gated by strict load proof.',
  intentAr: 'ALLaM هو مرتكز العربية المحلية، لكن يجب أن يرسل DCP الحركة فقط عندما يملك النموذج مزودين مثبتين. يبقى النشر المخصص وخدمة LoRA مقيدين بإثبات تحميل صارم.',
  promptEn: 'Answer in Arabic: summarize this Saudi customer support ticket.',
  promptAr: 'أجب بالعربية: لخّص تذكرة دعم سعودية.',
}

export default function AllamModelPage() {
  return <ModelReadinessPage config={config} />
}
