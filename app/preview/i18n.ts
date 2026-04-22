// EN/AR dictionary for the /preview homepage redesign.
// Ported verbatim from the Claude Design handover bundle (assets/i18n.js).

export type PreviewLang = 'en' | 'ar'

export interface PreviewStrings {
  nav: {
    platform: string
    marketplace: string
    models: string
    providers: string
    pricing: string
    docs: string
    signin: string
    start: string
  }
  topline: { status: string; live: string; p50: string; ast: string }
  hero: {
    eyebrow: string
    headline_1: string
    headline_2: string
    sub: string
    cta_primary: string
    cta_secondary: string
    watching: string
    trusted: string
  }
  marquee: string
  stats: { providers: string; tokens: string; jobs: string; price: string; vs: string }
  platform: { heading: string; rows: [string, string, string][] }
  market: {
    eyebrow: string
    title: string
    sub: string
    search: string
    f_all: string
    f_ar: string
    f_h100: string
    f_rtx: string
    headers: string[]
    reserve: string
  }
  playground: {
    eyebrow: string
    title: string
    sub: string
    prompt: string
    model: string
    run: string
    stop: string
    tokens: string
    cost: string
    latency: string
    response: string
    empty: string
  }
  models: {
    eyebrow: string
    title: string
    sub: string
    all: string
    ar: string
    chat: string
    image: string
    embed: string
    in: string
    out: string
    per: string
  }
  billing: {
    eyebrow: string
    title: string
    sub: string
    rows: [string, string, string][]
  }
  providers: {
    eyebrow: string
    title: string
    sub: string
    items: string[]
    cta: string
    calc: string
    calc_hint: string
    mo: string
  }
  enterprise: { eyebrow: string; title: string; sub: string; cta: string }
  trust: { eyebrow: string; title: string; items: [string, string][] }
  cta_block: { small: string; big_1: string; big_2: string; body: string; primary: string; secondary: string }
  footer: { tag: string; product: string; dev: string; company: string; legal: string; status: string }
}

export const DCP_I18N: Record<PreviewLang, PreviewStrings> = {
  en: {
    nav: {
      platform: 'Platform', marketplace: 'Marketplace', models: 'Models',
      providers: 'Providers', pricing: 'Pricing', docs: 'Docs',
      signin: 'Console login', start: 'Start renting',
    },
    topline: { status: 'All systems operational', live: 'LIVE', p50: 'p50 38ms', ast: 'AST' },
    hero: {
      eyebrow: 'GPU compute marketplace — earn SAR running AI inference',
      headline_1: 'GPU Marketplace.',
      headline_2: 'Arabic AI.',
      sub: 'The only GPU compute marketplace with Saudi data residency, Arabic AI models, and PDPL compliance. OpenAI-compatible API. Per-token billing.',
      cta_primary: 'Start first workload',
      cta_secondary: 'Register provider node',
      watching: 'watching',
      trusted: 'Models supported across the network',
    },
    marquee: 'SAUDI DATA RESIDENCY — ARABIC AI FIRST-CLASS — PDPL COMPLIANCE — OPENAI-COMPATIBLE API — PER-TOKEN SAR BILLING — WINDOWS · MACOS · LINUX',
    stats: {
      providers: 'Providers registered',
      tokens: 'Tokens / sec (peak)',
      jobs: 'Platforms supported',
      price: 'Consumer GPU tok/s',
      vs: 'range on consumer GPUs',
    },
    platform: {
      heading: 'Platform',
      rows: [
        ['01', 'Saudi energy advantage',  'Structural advantage for sustained AI operations'],
        ['02', 'Arabic AI, first-class',  'ALLaM 7B · Falcon H1 · JAIS 13B · BGE-M3'],
        ['03', '4 MB provider app',       'Auto-detects GPU, installs Ollama / MLX'],
        ['04', 'Runtime settlement',      'Estimate hold in halala · completion-based settle'],
        ['05', 'Containerized execution', 'Approved Docker · NVIDIA Container Toolkit'],
        ['06', 'OpenAI-compatible API',   'Drop-in replacement · api.dcp.sa/v1'],
      ],
    },
    market: {
      eyebrow: 'Live marketplace',
      title: 'Browse live GPU capacity.',
      sub: 'Publish compatible capacity on a Saudi-hosted, container-based marketplace. Filter by region, VRAM, reliability. Jobs are routed when demand and policy align.',
      search: 'Filter by GPU, provider, region…',
      f_all: 'All', f_ar: 'In-Kingdom', f_h100: 'Datacenter', f_rtx: 'Consumer',
      headers: ['GPU', 'Region', 'Provider', 'Util', 'SAR/hr', 'USD/hr', 'Rel.', 'Perf', ''],
      reserve: 'Reserve',
    },
    playground: {
      eyebrow: 'API access in 60 seconds',
      title: 'OpenAI-compatible. Drop in your API key and start generating.',
      sub: 'No setup, no queue. Same SDK you already use — swap the base URL and call Arabic models hosted in Saudi Arabia.',
      prompt: 'Prompt', model: 'Model', run: 'Run inference', stop: 'Stop',
      tokens: 'tok', cost: 'SAR', latency: 'ms',
      response: 'Response',
      empty: 'Run to stream output from the selected model',
    },
    models: {
      eyebrow: 'What you can run',
      title: 'Arabic frontier. Global depth.',
      sub: 'ALLaM, Falcon, JAIS, and Llama alongside SDXL, ControlNet, and BGE-M3. LoRA and QLoRA fine-tuning via Docker templates.',
      all: 'All', ar: 'Arabic AI', chat: 'LLM', image: 'Image', embed: 'Embed',
      in: 'in', out: 'out', per: 'indicative — confirm pricing in console',
    },
    billing: {
      eyebrow: 'How DCP billing works',
      title: 'Estimate hold, then completion-based settlement.',
      sub: 'Before execution, DCP places an estimate hold in halala from your wallet. After completion, final cost is settled from actual runtime — not the estimate. Any unused hold is returned to wallet balance automatically. 100 halala = 1 SAR.',
      rows: [
        ['01', 'Estimate hold',          'Before execution, a halala hold is placed from your wallet.'],
        ['02', 'Runtime settlement',     'Final cost settles from actual runtime, not the estimate.'],
        ['03', 'Automatic return',       'Any unused hold is returned to your wallet in halala.'],
        ['04', 'Provider / platform',    'Final settlement reconciles 75% provider, 25% platform.'],
      ],
    },
    providers: {
      eyebrow: 'Earn SAR with your GPU',
      title: '4 MB desktop app. Zero config.',
      sub: 'Auto-detects your GPU, installs the inference engine (Ollama or MLX), downloads the AI model, and connects to DCP. Windows, macOS Apple Silicon, and Linux.',
      items: [
        'Works on hardware you already own — Windows, macOS, Linux',
        '4 MB installer — not 180 MB like Electron competitors',
        'Auto GPU detection, auto engine install, auto model download',
        '100–270 tok/s on consumer GPUs (RTX 3060 Ti → RTX 5090)',
        'Auto NAT traversal via Cloudflare Tunnel — no port forwarding',
        'Real-time dashboard: GPU temp, utilization, live earnings, job feed',
      ],
      cta: 'Download provider app',
      calc: 'Calculate provider earnings',
      calc_hint: 'RTX 4090 · 16 h/day · 55% util → ',
      mo: '/month',
    },
    enterprise: {
      eyebrow: 'Enterprise support',
      title: 'Procurement, security, and rollout planning.',
      sub: 'Open enterprise intake for teams that need procurement support, security review, or rollout planning across the Kingdom.',
      cta: 'Open enterprise support',
    },
    trust: {
      eyebrow: 'How DCP runs',
      title: 'Platform policy and operating model.',
      items: [
        ['Runtime settlement',      'Estimate hold in halala before execution, then completion-based settlement with unused hold returned automatically.'],
        ['Containerized execution', 'Workloads run in approved Docker runtimes with NVIDIA Container Toolkit and explicit GPU scoping.'],
        ['Arabic AI support',       'Arabic-ready model support includes ALLaM 7B, Falcon H1, JAIS 13B, and BGE-M3.'],
        ['Data residency',          'Data handling is designed for Saudi residency workflows and PDPL-oriented controls.'],
      ],
    },
    cta_block: {
      small: 'List your Saudi GPU',
      big_1: 'Start matching',
      big_2: 'on a Saudi-hosted marketplace.',
      body: 'Publish compatible capacity on a container-based marketplace so jobs are routed when demand and policy align.',
      primary: 'Start renting',
      secondary: 'Connect your GPU',
    },
    footer: {
      tag: 'Infinite compute. Real power. — Saudi energy economics powering GPU inference for builders worldwide. Arabic models included.',
      product: 'Platform', dev: 'Resources', company: 'Support', legal: 'Legal',
      status: 'All systems operational',
    },
  },

  ar: {
    nav: {
      platform: 'المنصة', marketplace: 'السوق', models: 'النماذج',
      providers: 'المزوّدون', pricing: 'الأسعار', docs: 'التوثيق',
      signin: 'دخول المنصة', start: 'ابدأ الاستئجار',
    },
    topline: { status: 'جميع الأنظمة تعمل', live: 'مباشر', p50: 'زمن p50 ‎38‎ مللي', ast: 'ت.السعودية' },
    hero: {
      eyebrow: 'سوق حوسبة GPU — اكسب بالريال من تشغيل استدلال الذكاء الاصطناعي',
      headline_1: 'سوق GPU.',
      headline_2: 'ذكاء اصطناعي عربي.',
      sub: 'السوق الوحيد لحوسبة GPU مع إقامة بيانات سعودية، ونماذج ذكاء اصطناعي عربية، وامتثال لنظام حماية البيانات (PDPL). واجهة متوافقة مع OpenAI وفوترة لكل رمز.',
      cta_primary: 'ابدأ أول مهمة',
      cta_secondary: 'سجّل عقدة مزوّد',
      watching: 'يشاهدون الآن',
      trusted: 'نماذج مدعومة عبر الشبكة',
    },
    marquee: 'إقامة بيانات سعودية — عربية أولاً — امتثال PDPL — API متوافق مع OpenAI — فوترة بالريال لكل رمز — ويندوز · ماك · لينكس',
    stats: {
      providers: 'مزوّدون مسجَّلون',
      tokens: 'رمز / ثانية (ذروة)',
      jobs: 'منصات مدعومة',
      price: 'رمز/ث على GPU استهلاكية',
      vs: 'نطاق على بطاقات استهلاكية',
    },
    platform: {
      heading: 'المنصة',
      rows: [
        ['٠١', 'أفضلية الطاقة السعودية', 'ميزة هيكلية لعمليات الذكاء الاصطناعي المستدامة'],
        ['٠٢', 'عربية من الدرجة الأولى',  'ALLaM 7B · Falcon H1 · JAIS 13B · BGE-M3'],
        ['٠٣', 'تطبيق مزوّد ٤ م.ب',      'كشف GPU تلقائي وتثبيت Ollama / MLX'],
        ['٠٤', 'تسوية بعد التشغيل',      'حجز تقديري بالهللة · تسوية نهائية بعد الإنجاز'],
        ['٠٥', 'تنفيذ في حاويات',         'Docker معتمد · NVIDIA Container Toolkit'],
        ['٠٦', 'API متوافق مع OpenAI',   'بديل مباشر · api.dcp.sa/v1'],
      ],
    },
    market: {
      eyebrow: 'سوق مباشر',
      title: 'تصفّح السعة المباشرة.',
      sub: 'انشر سعة متوافقة على سوق مستضاف في السعودية يعتمد على الحاويات. صفّي حسب المنطقة أو VRAM أو الموثوقية. المهام توجَّه حين يتوافق الطلب والسياسة.',
      search: 'ابحث عن وحدة أو مزوّد أو منطقة…',
      f_all: 'الكل', f_ar: 'داخل المملكة', f_h100: 'مراكز بيانات', f_rtx: 'استهلاكية',
      headers: ['GPU', 'المنطقة', 'المزوّد', 'استخدام', 'ريال/س', 'دولار/س', 'موثوقية', 'أداء', ''],
      reserve: 'احجز',
    },
    playground: {
      eyebrow: 'API خلال ٦٠ ثانية',
      title: 'متوافق مع OpenAI. أدخل مفتاحك وابدأ.',
      sub: 'لا إعداد ولا انتظار. نفس الـ SDK الذي تستخدمه — غيّر الـ base URL فقط ونادِ نماذج عربية داخل السعودية.',
      prompt: 'المدخل', model: 'النموذج', run: 'تشغيل', stop: 'إيقاف',
      tokens: 'رمز', cost: 'ريال', latency: 'مللي',
      response: 'الاستجابة',
      empty: 'شغّل لعرض مخرجات النموذج',
    },
    models: {
      eyebrow: 'ما يمكنك تشغيله',
      title: 'حدود عربية، عمق عالمي.',
      sub: 'ALLaM و Falcon و JAIS و Llama إلى جانب SDXL و ControlNet و BGE-M3. ضبط دقيق LoRA و QLoRA عبر قوالب Docker.',
      all: 'الكل', ar: 'عربي', chat: 'LLM', image: 'صور', embed: 'تضمين',
      in: 'إدخال', out: 'إخراج', per: 'تقديري — تأكّد من الأسعار في المنصة',
    },
    billing: {
      eyebrow: 'آلية الفوترة',
      title: 'حجز تقديري ثم تسوية بعد الإنجاز.',
      sub: 'قبل التنفيذ يحتجز النظام مبلغاً تقديرياً بالهللة من محفظتك. بعد اكتمال المهمة، تُسوَّى التكلفة النهائية من زمن التشغيل الفعلي لا من التقدير. يُعاد أي رصيد غير مستخدم إلى المحفظة تلقائياً. ‎١٠٠‎ هللة = ‎١‎ ريال.',
      rows: [
        ['٠١', 'حجز تقديري',             'قبل التنفيذ يُحتجز مبلغ بالهللة من محفظتك.'],
        ['٠٢', 'تسوية حسب التشغيل',     'التكلفة النهائية تُحسب من زمن التشغيل الفعلي.'],
        ['٠٣', 'استرداد تلقائي',         'أي جزء غير مستخدم من الحجز يعود لمحفظتك بالهللة.'],
        ['٠٤', '٧٥٪ للمزوّد / ٢٥٪ للمنصة', 'التسوية النهائية توزّع الدفعة ٧٥ / ٢٥.'],
      ],
    },
    providers: {
      eyebrow: 'اكسب الريال من كرتك',
      title: 'تطبيق مكتبي ‎٤‎ ميجابايت. بلا إعدادات.',
      sub: 'يكتشف كرتك تلقائياً، يثبّت محرك الاستدلال (Ollama أو MLX)، ينزّل النموذج، ويتصل بـ DCP. ويندوز وماك Apple Silicon ولينكس.',
      items: [
        'يعمل على الأجهزة التي تملكها — ويندوز، ماك، لينكس',
        'مثبّت ‎٤‎ م.ب — لا ‎١٨٠‎ م.ب كمنافسي Electron',
        'كشف تلقائي للـGPU وتثبيت المحرك وتنزيل النموذج',
        '‎١٠٠‎–‎٢٧٠‎ رمز/ث على كروت استهلاكية (‎3060 Ti ← ‎5090)',
        'عبور NAT تلقائي عبر Cloudflare Tunnel — بلا توجيه منافذ',
        'لوحة مباشرة: حرارة GPU، الاستخدام، الأرباح الحية، وسجل المهام',
      ],
      cta: 'نزّل تطبيق المزوّد',
      calc: 'احسب أرباح المزوّد',
      calc_hint: 'RTX 4090 · ‎16‎ ساعة/يوم · استخدام ٥٥٪ → ',
      mo: '/ شهرياً',
    },
    enterprise: {
      eyebrow: 'دعم المؤسسات',
      title: 'المشتريات والأمن وخطط النشر.',
      sub: 'بوابة إدخال للمؤسسات التي تحتاج دعم مشتريات أو مراجعة أمنية أو خطط نشر على مستوى المملكة.',
      cta: 'افتح دعم المؤسسات',
    },
    trust: {
      eyebrow: 'كيف تعمل DCP',
      title: 'سياسات ونموذج تشغيل المنصة.',
      items: [
        ['التسوية بعد التشغيل', 'حجز تقديري بالهللة قبل التنفيذ، ثم تسوية بعد اكتمال المهمة مع إعادة أي جزء غير مستخدم تلقائياً.'],
        ['التنفيذ في حاويات',    'المهام تُشغَّل في بيئات Docker معتمدة مع NVIDIA Container Toolkit ونطاق GPU صريح.'],
        ['دعم العربية',          'دعم نماذج عربية جاهز يشمل ALLaM 7B و Falcon H1 و JAIS 13B و BGE-M3.'],
        ['إقامة البيانات',        'آلية معالجة البيانات مصمّمة للإقامة السعودية وضوابط موجّهة بـ PDPL.'],
      ],
    },
    cta_block: {
      small: 'اطرح كرتك السعودي',
      big_1: 'ابدأ المطابقة',
      big_2: 'على سوق مستضاف في السعودية.',
      body: 'انشر سعة متوافقة على سوق يعتمد على الحاويات ليتم توجيه المهام حين يتوافق الطلب والسياسة.',
      primary: 'ابدأ الاستئجار',
      secondary: 'اربط كرتك',
    },
    footer: {
      tag: 'حوسبة لا نهائية. طاقة حقيقية. — اقتصاديات الطاقة السعودية تُشغِّل استدلال GPU للبُناة حول العالم. النماذج العربية مشمولة.',
      product: 'المنصة', dev: 'موارد', company: 'الدعم', legal: 'قانوني',
      status: 'جميع الأنظمة تعمل',
    },
  },
}
