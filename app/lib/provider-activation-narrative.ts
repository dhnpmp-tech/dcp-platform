export interface ProviderActivationNarrative {
  headline: string
  subheadline: string
  valuePoints: string[]
  objections: string[]
  assumptionsTitle: string
  assumptions: string[]
  ctaFlowTitle: string
  ctaFlow: Array<{ label: string; href: string }>
}

const EN_NARRATIVE: ProviderActivationNarrative = {
  headline: 'Activate idle GPUs and start weekly earnings',
  subheadline:
    'Saudi energy pricing + local data demand creates a margin advantage. DCP handles routing, billing, and payout tracking while you focus on uptime.',
  valuePoints: [
    'Fast activation with guided onboarding in minutes',
    'Transparent earnings math with assumptions shown up front',
    'No long-term lock-in: pause or stop anytime',
  ],
  objections: [
    'No extra marketplace integration work required',
    'No hidden fee layers beyond published platform terms',
    'Local support path through provider onboarding and dashboard status',
  ],
  assumptionsTitle: 'Source assumptions',
  assumptions: [
    'Planning baseline: 70% monthly utilization',
    'FX baseline: 1 USD ~= 3.75 SAR',
    'Saudi electricity baseline: USD 0.048-0.053 per kWh',
    'Actual income varies with uptime, demand, workload mix, and GPU tier',
  ],
  ctaFlowTitle: 'Activation flow',
  ctaFlow: [
    { label: 'Open Provider Registration', href: '/setup' },
    { label: 'Open Guided Onboarding', href: '/provider-onboarding' },
  ],
}

const AR_NARRATIVE: ProviderActivationNarrative = {
  headline: 'فعّل وحدات GPU غير المستغلة وابدأ دخلًا أسبوعيًا',
  subheadline:
    'ميزة تكلفة الطاقة في السعودية مع الطلب المحلي على البيانات تمنحك هامشًا أفضل. منصة DCP تدير التوجيه والفوترة وتتبع المدفوعات بينما تركز أنت على الجاهزية.',
  valuePoints: [
    'تفعيل سريع عبر مسار إعداد إرشادي خلال دقائق',
    'شفافية في حساب الأرباح مع عرض الفرضيات بوضوح',
    'بدون التزام طويل: يمكنك الإيقاف أو الإيقاف المؤقت في أي وقت',
  ],
  objections: [
    'لا حاجة لأعمال تكامل إضافية مع السوق',
    'لا توجد طبقات رسوم مخفية خارج الشروط المنشورة',
    'مسار دعم محلي عبر إعداد المزود ولوحة المتابعة',
  ],
  assumptionsTitle: 'فرضيات المصدر',
  assumptions: [
    'خط الأساس للتخطيط: تشغيل شهري بنسبة 70%',
    'سعر الصرف المرجعي: 1 دولار ≈ 3.75 ريال',
    'تكلفة الكهرباء المرجعية في السعودية: 0.048-0.053 دولار لكل كيلوواط/ساعة',
    'الدخل الفعلي يختلف حسب الجاهزية والطلب ونوع المهام وفئة الـ GPU',
  ],
  ctaFlowTitle: 'مسار التفعيل',
  ctaFlow: [
    { label: 'فتح تسجيل المزود', href: '/setup' },
    { label: 'فتح الإعداد الإرشادي', href: '/provider-onboarding' },
  ],
}

export function getProviderActivationNarrative(isArabic: boolean): ProviderActivationNarrative {
  return isArabic ? AR_NARRATIVE : EN_NARRATIVE
}
