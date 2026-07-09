import ModelReadinessPage, { type ModelPageConfig } from '../ModelReadinessPage'

const config: ModelPageConfig = {
  slug: 'qwen-arabic',
  active: '/inference',
  matchTerms: ['qwen'],
  defaultModelId: 'qwen2.5:7b',
  logoSrc: '/logos/qwen.png',
  logoAlt: 'Qwen logo',
  eyebrowEn: 'Qwen family on DCP · live catalog',
  eyebrowAr: 'عائلة Qwen على DCP · كتالوج حي',
  titleEn: 'Qwen-family models for Arabic and coding workloads',
  titleAr: 'نماذج Qwen للأحمال العربية والبرمجية',
  italicEn: 'served rows first, Arabic claims gated',
  italicAr: 'صفوف الخدمة أولاً، وادعاءات العربية مقيدة',
  leadEn: 'DCP uses the live model catalog to show which Qwen-family rows are actually served right now, which rows are catalog-only, and which advanced rails remain gated before Fireworks-style LoRA, batch, cache, or dedicated-deployment claims.',
  leadAr: 'يستخدم DCP الكتالوج الحي لإظهار أي صفوف من عائلة Qwen مخدومة فعلاً الآن، وأيها كتالوج فقط، وأي مسارات متقدمة تبقى مقيدة قبل ادعاءات LoRA أو الدُفعات أو التخزين المؤقت أو النشر المخصص بأسلوب Fireworks.',
  intentEn: 'Qwen is the current served workhorse family. The page can guide developers to live rows while keeping Arabic-quality rankings and future router promises behind benchmark proof.',
  intentAr: 'Qwen هي عائلة العمل المخدومة حالياً. يمكن للصفحة توجيه المطورين إلى الصفوف الحية مع إبقاء ترتيبات الجودة العربية ووعود التوجيه المستقبلية خلف إثبات القياس.',
  promptEn: 'Answer in Arabic and English: create a checklist for a Riyadh support agent.',
  promptAr: 'أجب بالعربية والإنجليزية: أنشئ قائمة تحقق لوكيل دعم في الرياض.',
}

export default function QwenArabicModelPage() {
  return <ModelReadinessPage config={config} />
}
