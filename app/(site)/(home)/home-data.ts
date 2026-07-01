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
  { en: 'Inference and agents, in the Kingdom', ar: 'استدلال ووكلاء، داخل المملكة' },
  { en: 'Pay per token · Saudi Riyal', ar: 'ادفع لكل رمز · بالريال السعودي' },
  { en: 'DCP-Agent for Saudi business · agents.dcp.sa', ar: 'DCP-Agent للأعمال السعودية · agents.dcp.sa' },
  { en: 'Agents can rent a GPU · npx -y github:dhnpmp-tech/dcp-mcp', ar: 'الوكلاء يستأجرون المعالجات · npx -y github:dhnpmp-tech/dcp-mcp' },
  { en: 'Earn Riyal from your GPU', ar: 'اكسب ريالاً من معالجك' },
  { en: 'PDPL · Saudi data residency', ar: 'نظام البيانات · إقامة داخل المملكة' },
]

// ───────── nav links (bespoke home topbar; routes resolve via next.config) ─────────
export const NAV: ReadonlyArray<{ href: string; en: string; ar: string; on?: boolean }> = [
  { href: '/', en: 'Overview', ar: 'نظرة عامة', on: true },
  { href: '/marketplace', en: 'Marketplace', ar: 'السوق' },
  { href: '/containers', en: 'GPU Pods', ar: 'حاويات GPU' },
  { href: '/agents', en: 'Agents', ar: 'الوكلاء' },
  { href: '/provider-setup', en: 'Earn', ar: 'اكسب' },
  { href: '/pricing', en: 'Pricing', ar: 'الأسعار' },
  { href: '/docs', en: 'Docs', ar: 'التوثيق' },
]

// ───────── capacity truth cards ─────────
export const CAPACITY_GATES = [
  {
    k: 'endpoint_reachable',
    tEn: 'We can reach it',
    tAr: 'نستطيع الوصول إليه',
    en: 'Our backend connects to the machine over the private mesh — right now, not at sign-up time.',
    ar: 'خلفيتنا تتصل بالجهاز عبر الشبكة الخاصة — الآن، لا عند التسجيل.',
  },
  {
    k: 'verified_online',
    tEn: 'It really answers',
    tAr: 'يجيب فعلاً',
    en: 'We send the machine a real question and verify a real answer comes back. A heartbeat alone earns nothing.',
    ar: 'نرسل للجهاز سؤالاً حقيقياً ونتحقق من عودة إجابة حقيقية. نبض الاتصال وحده لا يكفي.',
  },
  {
    k: 'model_coverage',
    tEn: 'It serves what it claims',
    tAr: 'يقدّم ما يدّعيه',
    en: 'A model is listed only while a verified machine is actually serving that exact model.',
    ar: 'يُعرض النموذج فقط ما دام جهاز متحقق يخدم ذلك النموذج بعينه.',
  },
] as const

// ───────── FAQ — visible top 3 on home (full set lives in HOME_FAQ JSON-LD) ─────────
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
] as const