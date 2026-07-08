// Shared home + marketplace data. No 'use client' — this is a plain server
// module of constants and small pure helpers, safe to import from both server
// and client components.

export type QsTab = 'curl' | 'cli' | 'py' | 'js'

// §01 live marketplace — shape of /v1/models entries (earned-online catalog)
export type MpModel = {
  id: string
  name?: string
  context_length?: number
  quantization?: string
  available?: boolean
  provider_count?: number
  pricing?: { usd_per_1m_input_tokens?: string }
}

export const SAR_PER_USD = 3.75 // backend stores halala and converts at the SAMA peg; we display SAR, never USD

export const fmtMpPrice = (m: MpModel): string => {
  const usd = Number(m.pricing?.usd_per_1m_input_tokens ?? 0)
  return usd > 0 ? `${(usd * SAR_PER_USD).toFixed(2)} SAR` : '—'
}

// ───────── marquee items ─────────
export const MARQUEE: ReadonlyArray<{ en: string; ar: string }> = [
  { en: 'GPU pods from 2.5 SAR/hr · billed per second', ar: 'حاويات GPU من ٢٫٥ ريال/ساعة · فوترة بالثانية' },
  { en: 'Inference from 5 halala per 1M tokens', ar: 'استدلال من ٥ هللات لكل مليون رمز' },
  { en: 'DCP-Agent for Saudi business · agents.dcp.sa', ar: 'DCP-Agent للأعمال السعودية · agents.dcp.sa' },
  { en: 'Agents can rent a GPU · npx -y github:dhnpmp-tech/dcp-mcp', ar: 'الوكلاء يستأجرون المعالجات · npx -y github:dhnpmp-tech/dcp-mcp' },
  { en: 'Earn Riyal from your GPU', ar: 'اكسب ريالاً من معالجك' },
  { en: 'PDPL · Saudi data residency', ar: 'نظام البيانات · إقامة داخل المملكة' },
]

// ───────── nav links (bespoke home topbar; routes resolve via next.config) ─────────
// Product-first order: the two products (pods, inference) lead.
export const NAV: ReadonlyArray<{ href: string; en: string; ar: string; on?: boolean }> = [
  { href: '/', en: 'Overview', ar: 'نظرة عامة', on: true },
  { href: '/containers', en: 'GPU Pods', ar: 'حاويات GPU' },
  { href: '/marketplace', en: 'Inference', ar: 'الاستدلال' },
  { href: '/fine-tuning', en: 'Fine-Tuning', ar: 'الضبط الدقيق' },
  { href: '/agents', en: 'Agents', ar: 'الوكلاء' },
  { href: '/pricing', en: 'Pricing', ar: 'الأسعار' },
  { href: '/provider-setup', en: 'Earn', ar: 'اكسب' },
  { href: '/docs', en: 'Docs', ar: 'التوثيق' },
]

// ───────── capacity truth cards — the 3 steps of the continuous live test.
// Written as a TEST the machine passes (reader-facing), not as system flags;
// the k chip is the real API field name, shown for technical credibility. ─────────
export const CAPACITY_GATES = [
  {
    k: 'endpoint_reachable',
    tEn: 'Can we reach it right now?',
    tAr: 'هل نصل إليه الآن؟',
    en: 'Our backend connects to the machine this minute — not once at sign-up.',
    ar: 'خلفيتنا تتصل بالجهاز في هذه اللحظة — لا مرة واحدة عند التسجيل.',
  },
  {
    k: 'verified_online',
    tEn: 'Does it answer a real question?',
    tAr: 'هل يجيب عن سؤال حقيقي؟',
    en: 'We run a real inference request against it and check the answer. A heartbeat alone is not enough.',
    ar: 'نشغّل عليه طلب استدلال حقيقياً ونتحقق من الإجابة. نبض الاتصال وحده لا يكفي.',
  },
  {
    k: 'model_coverage',
    tEn: 'Is it serving the model it claims?',
    tAr: 'هل يخدم النموذج الذي يدّعيه؟',
    en: 'A model stays listed only while a verified machine is actually serving that exact model.',
    ar: 'يبقى النموذج مدرجاً فقط ما دام جهاز متحقق يخدم ذلك النموذج بعينه.',
  },
] as const

// ───────── FAQ — all 6 visible on home, mirroring HOME_FAQ JSON-LD 1:1 so the
// text AI answer engines cite is the text humans can actually see (GEO parity).
export const HOME_FAQ_VISIBLE = [
  {
    qEn: 'How do I rent an H100 (or other GPU) on demand on DCP?',
    qAr: 'كيف أستأجر معالج H100 (أو غيره) عند الطلب على DCP؟',
    aEn: 'Sign up for a DCP renter account at dcp.sa, fund your wallet in Saudi Riyal, then launch a pod from the console or via the API — POST https://api.dcp.sa/api/pods with a Bearer renter key. You get a whole NVIDIA GPU (H200, H100, A100, L40S, RTX 5090 or RTX 4090) with root, Jupyter over TLS and SSH in about a minute. Billing is prepaid per GPU-second in SAR, with a prorated refund when you stop early.',
    aAr: 'سجّل حساب مستأجر على dcp.sa، ومَوّل محفظتك بالريال السعودي، ثم شغّل حاوية من لوحة التحكم أو عبر الواجهة — POST https://api.dcp.sa/api/pods بمفتاح مستأجر من نوع Bearer. تحصل على معالج NVIDIA كامل (H200 أو H100 أو A100 أو L40S أو RTX 5090 أو RTX 4090) مع صلاحيات الجذر وJupyter عبر TLS وSSH خلال دقيقة تقريباً. الفوترة مدفوعة مسبقاً بالثانية بالريال، مع استرداد تناسبي عند الإيقاف المبكر.',
  },
  {
    qEn: 'Is DCP an OpenAI-compatible inference API?',
    qAr: 'هل DCP واجهة استدلال متوافقة مع OpenAI؟',
    aEn: 'Yes. DCP exposes an OpenAI-compatible API at https://api.dcp.sa/v1 (POST /v1/chat/completions, GET /v1/models). Point any OpenAI SDK at it by setting base_url to https://api.dcp.sa/v1 and using your DCP renter key as the Bearer token — no code rewrite needed. Inference is billed per token in Saudi Riyal.',
    aAr: 'نعم. يوفّر DCP واجهة متوافقة مع OpenAI على https://api.dcp.sa/v1 (POST /v1/chat/completions وGET /v1/models). وجّه أي SDK من OpenAI إليها بضبط base_url على https://api.dcp.sa/v1 واستخدام مفتاح المستأجر كرمز Bearer — دون إعادة كتابة الكود. تُفوتر الاستدلالات بالرمز بالريال السعودي.',
  },
  {
    qEn: 'Can an AI agent rent a GPU on DCP via MCP?',
    qAr: 'هل يمكن لوكيل ذكاء اصطناعي استئجار معالج على DCP عبر MCP؟',
    aEn: 'Yes. DCP ships an official Model Context Protocol (MCP) server. An MCP-capable agent (such as Claude) can list models, run inference, list available GPU types, create and extend GPU pods, rent storage volumes, and check wallet balance through tool calls. See dcp.sa/docs for the MCP setup and tool reference.',
    aAr: 'نعم. يوفّر DCP خادم بروتوكول سياق النموذج (MCP) رسمياً. يستطيع وكيل يدعم MCP (مثل Claude) سرد النماذج، وتشغيل الاستدلال، وسرد أنواع المعالجات المتاحة، وإنشاء حاويات GPU وتمديدها، واستئجار وحدات تخزين، والتحقق من رصيد المحفظة عبر استدعاءات الأدوات. راجع dcp.sa/docs لإعداد MCP ومرجع الأدوات.',
  },
  {
    qEn: 'What is sovereign / in-Kingdom AI compute in Saudi Arabia?',
    qAr: 'ما معنى الحوسبة السيادية / داخل المملكة في السعودية؟',
    aEn: 'Sovereign AI compute means your data, the models, the storage, and the control plane all stay inside Saudi Arabia, under Saudi law. DCP runs on Saudi-owned hardware in the Kingdom with full PDPL data-residency compliance, so prompts and answers never leave the country unless a tenant explicitly opts in to cross-border frontier models.',
    aAr: 'الحوسبة السيادية تعني أن بياناتك والنماذج والتخزين وطبقة التحكم تبقى كلها داخل السعودية وتحت النظام السعودي. يعمل DCP على عتاد سعودي داخل المملكة بامتثال كامل لنظام حماية البيانات الشخصية (PDPL)، فلا تغادر الاستفسارات والإجابات البلاد إلا إذا فعّل المستأجر صراحةً النماذج المتقدمة العابرة للحدود.',
  },
  {
    qEn: 'How much does it cost to rent a GPU on DCP?',
    qAr: 'كم تكلفة استئجار معالج على DCP؟',
    aEn: 'GPU rental is billed prepaid per GPU-second in Saudi Riyal, cost-plus from the live market. On-demand types and indicative hourly rates: NVIDIA RTX 4090 from about 3.62 SAR/hr, RTX 5090 from 5.2 SAR/hr, L40S from 5.2 SAR/hr, A100 (80 GB) from 7.3 SAR/hr, H100 (80 GB) from 17.27 SAR/hr, and H200 (141 GB) from 23.05 SAR/hr. The native in-Kingdom RTX 3090 is 2.5 SAR/hr. New renter accounts start with 100 SAR of credit and no card is required to begin.',
    aAr: 'يُفوتر إيجار المعالجات مسبقاً بالثانية بالريال السعودي، بتسعير التكلفة زائد هامش من السوق الحي. الأنواع عند الطلب وأسعارها الإرشادية بالساعة: RTX 4090 من نحو ٣٫٦٢ ريال، RTX 5090 من ٥٫٢ ريال، L40S من ٥٫٢ ريال، A100 (٨٠ غيغابايت) من ٧٫٣ ريال، H100 (٨٠ غيغابايت) من ١٧٫٢٧ ريال، وH200 (١٤١ غيغابايت) من ٢٣٫٠٥ ريال. بطاقة RTX 3090 المحلية داخل المملكة بـ٢٫٥ ريال/ساعة. تبدأ الحسابات الجديدة برصيد ١٠٠ ريال ولا حاجة لبطاقة للبدء.',
  },
  {
    qEn: 'Where does my data live when I use DCP?',
    qAr: 'أين تُخزَّن بياناتي عند استخدام DCP؟',
    aEn: 'Inside Saudi Arabia. Inference, GPU pods, agents, and persistent storage volumes all run on in-Kingdom, Saudi-owned hardware under PDPL data-residency rules. Cross-border frontier models are available only by explicit per-tenant opt-in.',
    aAr: 'داخل السعودية. الاستدلال وحاويات GPU والوكلاء ووحدات التخزين الدائمة تعمل جميعها على عتاد سعودي داخل المملكة وفق قواعد إقامة البيانات في PDPL. النماذج المتقدمة العابرة للحدود متاحة فقط بموافقة صريحة لكل مستأجر.',
  },
] as const
