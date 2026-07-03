'use client'

// v2 agent-first product + explainer page (/agents).
//
// Written for BOTH humans (narrative, why-it-matters) and agents (copy-paste
// curl, MCP config, the verified end-to-end recipe). Server-rendered JSON-LD
// (HowTo + FAQPage) lives in the co-located layout.tsx so crawlers parse it.
//
// SHIPPED REALITY this page describes (all live on api.dcp.sa as of 2026-06-19):
//   - Zero-human onboarding: POST /api/renters/agent-register → dcp-renter- key
//     + 20 SAR trial. (The 100 SAR trial is the human email-signup path.)
//   - OpenAI-compatible inference at https://api.dcp.sa/v1.
//   - Official MCP server: npx -y github:dhnpmp-tech/dcp-mcp (11 tools incl. register_agent + list_gpus).
//   - Cost-plus GPU "from" floors; HTTP 402 funding signal; Idempotency-Key.
//
// INVISIBILITY: only public NVIDIA gpu_type names — never the GPU vendor,
// provider/peer id, machine/node name, IP, or counts.

import Link from 'next/link'
import { Bi, useV2 } from '@/app/(site)/lib/i18n'
import { ROUTES } from '@/app/lib/routes'
import '@/app/(site)/docs/docs.css'
import './agents.css'

// GPU "from" floors — mirror the home #pricing GPU table and GPU_SKUS in
// app/lib/structured-data.ts exactly. Cost-plus floors that float; "from".
// Apple Silicon (M2) is inference-only and has no SAR/hr rental price, so it is
// deliberately absent from this rentable-pod catalog.
const GPU_FLOORS: ReadonlyArray<{
  model: string
  vram: number
  sar: number
  usd: number
  tier: 'on-demand' | 'native'
}> = [
  { model: 'NVIDIA H200', vram: 141, sar: 23.05, usd: 6.15, tier: 'on-demand' },
  { model: 'NVIDIA H100', vram: 80, sar: 17.27, usd: 4.61, tier: 'on-demand' },
  { model: 'NVIDIA A100', vram: 80, sar: 7.3, usd: 1.95, tier: 'on-demand' },
  { model: 'NVIDIA L40S', vram: 48, sar: 5.2, usd: 1.39, tier: 'on-demand' },
  { model: 'NVIDIA RTX 5090', vram: 32, sar: 5.2, usd: 1.39, tier: 'on-demand' },
  { model: 'NVIDIA RTX 4090', vram: 24, sar: 3.62, usd: 0.97, tier: 'on-demand' },
  { model: 'NVIDIA RTX 3090', vram: 24, sar: 0.5, usd: 0.13, tier: 'native' },
]

// The 11 MCP tools exactly as index.js exposes them (register_agent first).
const MCP_TOOLS: ReadonlyArray<{ name: string; en: string; ar: string }> = [
  {
    name: 'register_agent',
    en: 'Self-register a new renter account in one call — a real API key + a 20 SAR trial credit, no human, no email. Use first when DCP_API_KEY is unset.',
    ar: 'سجّل حساب مستأجر جديد في استدعاء واحد — مفتاح حقيقي + رصيد تجريبي ٢٠ ريالاً، دون بشر ودون بريد. استخدمه أولاً عند غياب المفتاح.',
  },
  {
    name: 'list_models',
    en: 'List models serveable right now (OpenAI-style; only available=true are live).',
    ar: 'يسرد النماذج القابلة للخدمة الآن (بأسلوب OpenAI؛ المتاح فقط available=true).',
  },
  {
    name: 'chat',
    en: 'Run an OpenAI-compatible chat completion — sovereign, in-Kingdom inference.',
    ar: 'يشغّل إكمال محادثة متوافقاً مع OpenAI — استدلال سيادي داخل المملكة.',
  },
  {
    name: 'get_balance',
    en: 'Get the renter wallet balance (SAR). Inference, pods and volumes prepay from it.',
    ar: 'يجلب رصيد محفظة المستأجر (بالريال). الاستدلال والحاويات والمساحات تُدفع منه مسبقاً.',
  },
  {
    name: 'list_gpus',
    en: 'List rentable GPU TYPES now (gpu_type + vram_gb + available + on_demand). Pick a gpu_type for create_pod.',
    ar: 'يسرد أنواع المعالجات القابلة للإيجار الآن (النوع + الذاكرة + التوفر). اختر نوعاً لـ create_pod.',
  },
  {
    name: 'create_pod',
    en: 'Rent a whole GPU as an interactive pod (root + Jupyter + SSH), prepaid per second. Optional gpu_type.',
    ar: 'يستأجر معالجاً كاملاً كحاوية تفاعلية (جذر + Jupyter + SSH)، مدفوعاً بالثانية. نوع المعالج اختياري.',
  },
  {
    name: 'get_pod',
    en: "Get a pod's status + access details (status, access_url, ssh_command, ends_at, seconds_remaining).",
    ar: 'يجلب حالة الحاوية وتفاصيل الوصول (الحالة، الرابط، أمر SSH، النهاية، الثواني المتبقية).',
  },
  {
    name: 'extend_pod',
    en: 'Add time to a running pod without restart; same rate, workspace + token unchanged.',
    ar: 'يضيف وقتاً لحاوية قيد التشغيل دون إعادة تشغيل؛ نفس السعر، ومساحة العمل والرمز كما هما.',
  },
  {
    name: 'stop_pod',
    en: 'Stop a pod early; unused prepaid time is refunded to the wallet.',
    ar: 'يوقف الحاوية مبكراً؛ يُسترد الوقت غير المستخدم إلى المحفظة.',
  },
  {
    name: 'rent_volume',
    en: 'Rent an exclusive in-Kingdom persistent volume (10/20/30 GB) so /workspace persists across pods.',
    ar: 'يستأجر مساحة تخزين دائمة حصرية داخل المملكة (١٠/٢٠/٣٠ غ.ب) ليبقى /workspace بين الحاويات.',
  },
  {
    name: 'get_volume',
    en: "Get the renter's active persistent volume (size, usage, price, pool availability).",
    ar: 'يجلب مساحة التخزين الدائمة النشطة للمستأجر (الحجم، الاستخدام، السعر، التوفر).',
  },
]

export default function AgentsPage() {
  const { toggle, lang } = useV2()

  return (
    <div className="ag-page">
      {/* Shared docs header chrome */}
      <header className="dx-top">
        <Link href={ROUTES.home} className="wm">
          DCP<i>∞</i>
          <span className="tag">
            <Bi en="For agents" ar="للوكلاء" />
          </span>
        </Link>
        <div className="links">
          <Link href={ROUTES.home}>
            <Bi en="Home" ar="الرئيسية" />
          </Link>
          <Link href={ROUTES.docs}>
            <Bi en="Docs" ar="التوثيق" />
          </Link>
          <Link href={ROUTES.pricing}>
            <Bi en="Pricing" ar="الأسعار" />
          </Link>
          <button type="button" className="dx-langpill" onClick={toggle} aria-label="Toggle language">
            <span className={lang === 'en' ? 'on' : undefined}>EN</span>
            <span className={lang === 'ar' ? 'on' : undefined}>ع</span>
          </button>
        </div>
      </header>

      {/* ═══════════════ HERO ═══════════════ */}
      <section className="ag-hero" aria-labelledby="ag-heading">
        <div className="ag-photo" aria-hidden="true">
          <img src="/home/swarm.webp" alt="" width={1800} height={1005} decoding="async" />
        </div>
        <div className="ag-glyph" aria-hidden="true">
          ∞
        </div>
        <div className="wrap">
          <span className="ag-eyebrow">
            <Bi
              en="§ DCP for agents · sovereign compute · zero human in the loop"
              ar="§ DCP للوكلاء · حوسبة سيادية · دون تدخل بشري"
            />
          </span>
          <h1 id="ag-heading">
            {lang === 'ar' ? (
              <>
                حوسبة <em>تستأجرها</em> الوكلاء بنفسها.
              </>
            ) : (
              <>
                Compute an agent <em>rents itself.</em>
              </>
            )}
          </h1>
          <p className="lead">
            <Bi
              en="DCP is Saudi Arabia's sovereign AI compute platform — an OpenAI-compatible inference API and on-demand whole-GPU rental, served from Saudi-owned hardware inside the Kingdom. It is built to be driven by software: an agent can register, get a real key with a SAR trial, rent a GPU, run inference, and stop — with no human and no vendor to manage."
              ar="DCP منصة الحوسبة السيادية للذكاء الاصطناعي في السعودية — واجهة استدلال متوافقة مع OpenAI وإيجار معالجات كاملة عند الطلب، تُقدَّم من عتاد سعودي داخل المملكة. مصمَّمة لتقودها البرمجيات: يستطيع الوكيل أن يسجّل، ويحصل على مفتاح حقيقي برصيد تجريبي بالريال، ويستأجر معالجاً، ويشغّل الاستدلال، ثم يوقفه — دون بشر ودون مورّد يُدار."
            />
          </p>
          <div className="ag-cta">
            <a className="ag-btn primary" href="#flow">
              <Bi en="The zero-human flow ↓" ar="مسار بلا بشر ↓" />
            </a>
            <a className="ag-btn ghost" href="#mcp">
              <Bi en="Install the MCP server" ar="ثبّت خادم MCP" />
            </a>
            <Link className="ag-btn ghost" href={ROUTES.docs}>
              <Bi en="Full docs →" ar="التوثيق الكامل ←" />
            </Link>
          </div>
          <div className="ag-residency">
            <span className="ag-badge ksa">
              🇸🇦 <Bi en="Inference · KSA" ar="الاستدلال · المملكة" />
            </span>
            <span className="ag-badge ksa">
              🇸🇦 <Bi en="GPUs · KSA" ar="المعالجات · المملكة" />
            </span>
            <span className="ag-badge ksa">
              🇸🇦 <Bi en="Storage · KSA" ar="التخزين · المملكة" />
            </span>
            <span className="ag-badge">
              🌐 <Bi en="Frontier · opt-in only" ar="متقدم · بإذن فقط" />
            </span>
          </div>
        </div>
      </section>

      <main className="ag-body">
        {/* ═══════════════ WHAT DCP IS ═══════════════ */}
        <section className="ag-sec" id="what" aria-labelledby="what-h">
          <div className="ag-sec-meta">
            <span className="idx">
              <Bi en="§ 01 · What DCP is" ar="§ ٠١ · ما هي DCP" />
            </span>
            <span className="kick" id="what-h">
              <Bi en="One sovereign runtime, two products" ar="بيئة تشغيل سيادية، منتجان" />
            </span>
          </div>
          <p className="intro">
            <Bi
              en="DCP is not a token pipe. It is sovereign, in-Kingdom AI compute: data, models, storage, and the control plane all stay inside Saudi Arabia under Saudi law (PDPL). One renter wallet — prepaid in Saudi Riyal — pays for everything."
              ar="DCP ليست مجرد أنبوب رموز. إنها حوسبة سيادية للذكاء الاصطناعي داخل المملكة: البيانات والنماذج والتخزين ومستوى التحكم كلها داخل السعودية وفق النظام السعودي (نظام حماية البيانات). محفظة مستأجر واحدة — مدفوعة مسبقاً بالريال — تموّل كل شيء."
            />
          </p>
          <div className="ag-cards">
            <div className="ag-card">
              <span className="k">
                <Bi en="Product 1 · tokens" ar="المنتج ١ · رموز" />
              </span>
              <h3>
                <Bi en="OpenAI-compatible inference" ar="استدلال متوافق مع OpenAI" />
              </h3>
              <p>
                <Bi
                  en="Point any OpenAI SDK at api.dcp.sa/v1 and run Arabic-first models on KSA-resident GPUs, billed per token in SAR. No rewrite."
                  ar="وجّه أي حزمة OpenAI إلى api.dcp.sa/v1 وشغّل نماذج عربية أولاً على معالجات داخل المملكة، بالرمز بالريال. دون إعادة كتابة."
                />
              </p>
            </div>
            <div className="ag-card">
              <span className="k">
                <Bi en="Product 2 · whole GPUs" ar="المنتج ٢ · معالجات كاملة" />
              </span>
              <h3>
                <Bi en="On-demand GPU pods" ar="حاويات GPU عند الطلب" />
              </h3>
              <p>
                <Bi
                  en="Rent a whole NVIDIA GPU with root, Jupyter and SSH in about a minute, prepaid per second in SAR. No vendor accounts, no quotas, no cluster to manage."
                  ar="استأجر معالج NVIDIA كاملاً مع جذر وJupyter وSSH خلال دقيقة تقريباً، مدفوعاً بالثانية بالريال. دون حسابات مورّدين ولا حصص ولا عنقود يُدار."
                />
              </p>
            </div>
            <div className="ag-card">
              <span className="k">
                <Bi en="The interface · agents" ar="الواجهة · الوكلاء" />
              </span>
              <h3>
                <Bi en="Agent-native by design" ar="موجَّه للوكلاء بالتصميم" />
              </h3>
              <p>
                <Bi
                  en="Plain HTTPS or an official MCP server. Self-register, machine-readable funding signals, and idempotent money routes mean an agent can run the whole loop unattended."
                  ar="HTTPS بسيط أو خادم MCP رسمي. التسجيل الذاتي وإشارات التمويل القابلة للقراءة آلياً والمسارات المالية الآمنة تعني أن الوكيل يدير الدورة كاملة دون إشراف."
                />
              </p>
            </div>
          </div>
        </section>

        {/* ═══════════════ ZERO-HUMAN FLOW ═══════════════ */}
        <section className="ag-sec" id="flow" aria-labelledby="flow-h">
          <div className="ag-sec-meta">
            <span className="idx">
              <Bi en="§ 02 · Zero human in the loop" ar="§ ٠٢ · دون تدخل بشري" />
            </span>
            <span className="kick" id="flow-h">
              <Bi en="Key → GPU → answer → stop" ar="مفتاح ← معالج ← إجابة ← إيقاف" />
            </span>
          </div>
          <p className="intro">
            <Bi
              en="An agent runs the whole lifecycle with no human and no email click. Every value below is real and verified live against api.dcp.sa."
              ar="ينفّذ الوكيل الدورة كاملة دون بشر ودون نقر بريد. كل قيمة أدناه حقيقية ومتحقَّق منها مباشرةً مقابل api.dcp.sa."
            />
          </p>

          <div className="ag-flow">
            <div className="ag-step">
              <span className="num">01</span>
              <div>
                <h3>
                  <Bi en="Self-register — get a key + 20 SAR trial" ar="سجّل ذاتياً — مفتاح + رصيد تجريبي ٢٠ ريالاً" />
                </h3>
                <p>
                  <Bi
                    en="POST /api/renters/agent-register (no auth). Returns 201 with a real dcp-renter- key and a 20 SAR trial credit — no human, no verification email. Abuse-guarded (3 per IP/hour)."
                    ar="POST /api/renters/agent-register (دون مصادقة). يعيد 201 مع مفتاح dcp-renter- حقيقي ورصيد تجريبي ٢٠ ريالاً — دون بشر ودون بريد تحقق. محميّ من الإساءة (٣ لكل IP في الساعة)."
                  />{' '}
                  <Bi
                    en="The fuller 100 SAR trial stays behind human email-verified signup."
                    ar="الرصيد التجريبي الأكبر ١٠٠ ريال يبقى خلف التسجيل البشري الموثّق بالبريد."
                  />
                </p>
              </div>
            </div>
            <div className="ag-step">
              <span className="num">02</span>
              <div>
                <h3>
                  <Bi en="List GPU types" ar="اسرد أنواع المعالجات" />
                </h3>
                <p>
                  <Bi
                    en="GET /api/renters/available-providers returns rentable GPU TYPES with VRAM and live availability — only the public NVIDIA label, never a vendor or machine. Pick a gpu_type string."
                    ar="GET /api/renters/available-providers يعيد أنواع المعالجات القابلة للإيجار مع الذاكرة والتوفر الحي — التسمية العامة فقط، دون مورّد أو جهاز. اختر نوعاً."
                  />
                </p>
              </div>
            </div>
            <div className="ag-step">
              <span className="num">03</span>
              <div>
                <h3>
                  <Bi en="Rent a whole GPU (idempotent)" ar="استأجر معالجاً كاملاً (آمن للتكرار)" />
                </h3>
                <p>
                  <Bi
                    en="POST /api/pods with { gpu_type, duration_minutes } and an Idempotency-Key header so a retry never double-charges. Root, Jupyter over TLS and SSH come up in about a minute."
                    ar="POST /api/pods مع { gpu_type, duration_minutes } وترويسة Idempotency-Key حتى لا تُكرَّر المحاسبة. الجذر وJupyter عبر TLS وSSH خلال دقيقة تقريباً."
                  />
                </p>
              </div>
            </div>
            <div className="ag-step">
              <span className="num">04</span>
              <div>
                <h3>
                  <Bi en="Run inference or use the pod" ar="شغّل الاستدلال أو استخدم الحاوية" />
                </h3>
                <p>
                  <Bi
                    en="Call POST /v1/chat/completions for OpenAI-compatible inference, or poll GET /api/pods/{id} for the access_url and ssh_command and drive the GPU directly."
                    ar="استدعِ POST /v1/chat/completions للاستدلال المتوافق مع OpenAI، أو استعلم GET /api/pods/{id} للرابط وأمر SSH وقُد المعالج مباشرة."
                  />
                </p>
              </div>
            </div>
            <div className="ag-step">
              <span className="num">05</span>
              <div>
                <h3>
                  <Bi en="Stop early — unused time refunded" ar="أوقف مبكراً — يُسترد الوقت غير المستخدم" />
                </h3>
                <p>
                  <Bi
                    en="DELETE /api/pods/{id} stops the pod and refunds unused prepaid minutes to the wallet. The host enforces a hard deadline even across reboots, so a forgotten pod can never squat a GPU."
                    ar="DELETE /api/pods/{id} يوقف الحاوية ويعيد الدقائق غير المستخدمة إلى المحفظة. المضيف يفرض موعداً نهائياً صارماً حتى عبر إعادة التشغيل."
                  />
                </p>
              </div>
            </div>
          </div>

          {/* Copy-paste shell recipe — verified live 2026-06-19 */}
          <div style={{ marginTop: '1.75rem' }}>
            <p className="ag-code-cap">
              <Bi
                en="Copy-paste recipe — verified live against api.dcp.sa"
                ar="وصفة جاهزة للّصق — متحقَّق منها مباشرةً مقابل api.dcp.sa"
              />
            </p>
            <pre className="ag-code">
              <span className="c"># 1 · Self-register — no human, no email click</span>
              {'\n'}
              <span className="k">curl</span> -s -X POST <span className="s">https://api.dcp.sa/api/renters/agent-register</span> \{'\n'}
              {'  '}-H <span className="s">{'"Content-Type: application/json"'}</span> -d <span className="s">{"'{\"label\":\"research-bot\"}'"}</span>
              {'\n'}
              <span className="c">{'# → 201 { "success": true, "api_key": "dcp-renter-…", "trial_credit_sar": 20, "balance_sar": 20 }'}</span>
              {'\n'}
              <span className="k">export</span> DCP_KEY=<span className="s">dcp-renter-…</span>
              {'\n\n'}
              <span className="c"># 2 · List rentable GPU TYPES (public NVIDIA labels only)</span>
              {'\n'}
              <span className="k">curl</span> -s <span className="s">https://api.dcp.sa/api/renters/available-providers</span> \{'\n'}
              {'  '}-H <span className="s">{'"Authorization: Bearer $DCP_KEY"'}</span>
              {'\n\n'}
              <span className="c"># 3 · Rent a whole GPU — idempotent, prepaid per second</span>
              {'\n'}
              <span className="k">curl</span> -s -X POST <span className="s">https://api.dcp.sa/api/pods</span> \{'\n'}
              {'  '}-H <span className="s">{'"Authorization: Bearer $DCP_KEY"'}</span> \{'\n'}
              {'  '}-H <span className="s">{'"Idempotency-Key: $(uuidgen)"'}</span> -H <span className="s">{'"Content-Type: application/json"'}</span> \{'\n'}
              {'  '}-d <span className="s">{"'{\"gpu_type\":\"RTX 4090\",\"duration_minutes\":30}'"}</span>
              {'\n'}
              <span className="c">{'# → { "pod_id": "pod-…", "status": "starting" }   (or HTTP 402 with topup_url, no pod)'}</span>
              {'\n\n'}
              <span className="c"># 4 · OpenAI-compatible inference (qwen2.5:7b returns a clean answer)</span>
              {'\n'}
              <span className="k">curl</span> -s -X POST <span className="s">https://api.dcp.sa/v1/chat/completions</span> \{'\n'}
              {'  '}-H <span className="s">{'"Authorization: Bearer $DCP_KEY"'}</span> -H <span className="s">{'"Content-Type: application/json"'}</span> \{'\n'}
              {'  '}-d <span className="s">{"'{\"model\":\"qwen2.5:7b\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply with exactly: OK\"}],\"max_tokens\":20}'"}</span>
              {'\n'}
              <span className="c">{'# → 200 { choices:[{ message:{ content:"OK" }, finish_reason:"stop" }], usage:{ pricing:{ sar_total:"0.0200" } } }'}</span>
              {'\n\n'}
              <span className="c"># 5 · Stop early — unused minutes refunded</span>
              {'\n'}
              <span className="k">curl</span> -s -X DELETE <span className="s">https://api.dcp.sa/api/pods/$POD_ID</span> \{'\n'}
              {'  '}-H <span className="s">{'"Authorization: Bearer $DCP_KEY"'}</span>
            </pre>
          </div>
        </section>

        {/* ═══════════════ MCP ═══════════════ */}
        <section className="ag-sec" id="mcp" aria-labelledby="mcp-h">
          <div className="ag-sec-meta">
            <span className="idx">
              <Bi en="§ 03 · MCP server" ar="§ ٠٣ · خادم MCP" />
            </span>
            <span className="kick" id="mcp-h">
              <Bi en="The native way for an agent to use DCP" ar="الطريقة الأصلية لاستخدام DCP من وكيل" />
            </span>
          </div>
          <p className="intro">
            <Bi
              en="The official Model Context Protocol server runs over stdio via npx — nothing to install globally. It exposes eleven native tools, starting with register_agent so an agent can bootstrap its own key with DCP_API_KEY unset."
              ar="خادم بروتوكول سياق النموذج الرسمي يعمل عبر stdio بواسطة npx — لا شيء يُثبَّت عالمياً. يكشف إحدى عشرة أداة أصلية، تبدأ بـ register_agent ليبدأ الوكيل بمفتاحه دون ضبط DCP_API_KEY مسبقاً."
            />
          </p>

          <div className="ag-grid-2">
            <div>
              <p className="ag-code-cap">
                <Bi
                  en=".mcp.json (Claude Code) · claude_desktop_config.json (Claude Desktop) · Cursor"
                  ar=".mcp.json (Claude Code) · claude_desktop_config.json (Claude Desktop) · Cursor"
                />
              </p>
              <pre className="ag-code">
                {'{'}
                {'\n  '}
                <span className="k">{'"mcpServers"'}</span>: {'{'}
                {'\n    '}
                <span className="k">{'"dcp"'}</span>: {'{'}
                {'\n      '}
                <span className="k">{'"command"'}</span>: <span className="s">{'"npx"'}</span>,
                {'\n      '}
                <span className="k">{'"args"'}</span>: [<span className="s">{'"-y"'}</span>, <span className="s">{'"github:dhnpmp-tech/dcp-mcp"'}</span>],
                {'\n      '}
                <span className="k">{'"env"'}</span>: {'{ '}
                <span className="k">{'"DCP_API_KEY"'}</span>: <span className="s">{'"dcp-renter-…"'}</span>
                {' }'}
                {'\n    '}
                {'}'}
                {'\n  '}
                {'}'}
                {'\n'}
                {'}'}
              </pre>
              <div className="ag-note" style={{ marginTop: '1rem' }}>
                <div className="t">
                  <Bi en="Install line" ar="سطر التثبيت" />
                </div>
                <p>
                  <code>npx -y github:dhnpmp-tech/dcp-mcp</code>{' '}
                  <Bi
                    en="is the live install command — it runs the connector straight from GitHub, no npm account needed (the npm package @dcp/mcp is coming soon). Agents that already know DCP can also hit the API directly with the curl recipe above. DCP_API_KEY accepts both dcp-renter- and dc1-sk- keys, via Bearer or x-renter-key."
                    ar="هو أمر التثبيت المباشر — يشغّل الموصِّل مباشرةً من GitHub دون الحاجة إلى حساب npm (حزمة npm باسم ‎@dcp/mcp قادمة قريباً). يمكن للوكلاء الذين يعرفون DCP أيضاً استخدام الواجهة مباشرةً بوصفة curl أعلاه. يقبل DCP_API_KEY مفاتيح dcp-renter- وdc1-sk- معاً، عبر Bearer أو x-renter-key."
                  />
                </p>
              </div>
            </div>

            <div className="ag-tablewrap">
              <table className="param-tbl">
                <thead>
                  <tr>
                    <th>
                      <Bi en="Tool" ar="الأداة" />
                    </th>
                    <th>
                      <Bi en="What it does" ar="ماذا تفعل" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {MCP_TOOLS.map((t) => (
                    <tr key={t.name}>
                      <td className="name">{t.name}</td>
                      <td className="desc">
                        <Bi en={t.en} ar={t.ar} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ═══════════════ INFERENCE ═══════════════ */}
        <section className="ag-sec" id="inference" aria-labelledby="inf-h">
          <div className="ag-sec-meta">
            <span className="idx">
              <Bi en="§ 04 · OpenAI-compatible inference" ar="§ ٠٤ · استدلال متوافق مع OpenAI" />
            </span>
            <span className="kick" id="inf-h">
              <Bi en="Change base_url, keep your code" ar="غيّر base_url وأبقِ شيفرتك" />
            </span>
          </div>
          <p className="intro">
            <Bi
              en="Base URL https://api.dcp.sa/v1. GET /v1/models returns OpenAI-style entries, each with an available flag — call only models with available=true. Each completion carries per-call usage pricing in both USD and SAR."
              ar="عنوان القاعدة https://api.dcp.sa/v1. يعيد GET /v1/models إدخالات بأسلوب OpenAI، لكل منها علامة available — استدعِ النماذج المتاحة فقط. كل إكمال يحمل تسعير الاستخدام بالدولار والريال."
            />
          </p>
          <pre className="ag-code">
            <span className="k">from</span> openai <span className="k">import</span> OpenAI
            {'\n'}
            client = <span className="n">OpenAI</span>(base_url=<span className="s">{'"https://api.dcp.sa/v1"'}</span>, api_key=<span className="s">{'"dcp-renter-…"'}</span>)
            {'\n\n'}
            resp = client.chat.completions.create(
            {'\n  '}model=<span className="s">{'"qwen2.5:7b"'}</span>,  <span className="c"># GET /v1/models → pick one with available=true</span>
            {'\n  '}messages=[{'{'}<span className="s">{'"role"'}</span>: <span className="s">{'"user"'}</span>, <span className="s">{'"content"'}</span>: <span className="s">{'"اشرح لي زكاة المال"'}</span>{'}'}],
            {'\n'}
            )
            {'\n'}
            <span className="n">print</span>(resp.choices[<span className="k">0</span>].message.content)
          </pre>
          <div className="ag-note" style={{ marginTop: '1rem' }}>
            <div className="t">
              <Bi en="Pick the right model" ar="اختر النموذج المناسب" />
            </div>
            <p>
              <Bi
                en="qwen2.5:7b is a crisp non-thinking model — good for a first deterministic call. The docs default qwen3-4b is a thinking model: it emits reasoning into content and can truncate mid-thought with a small max_tokens. Availability is honest — a model is listed only while a verified provider serves it."
                ar="qwen2.5:7b نموذج موجز غير مُفكِّر — مناسب لأول استدعاء حتمي. النموذج الافتراضي qwen3-4b مُفكِّر: يُظهر تفكيره ضمن المحتوى وقد يُقتطع مع max_tokens صغير. التوفر صادق — يُعرض النموذج فقط ما دام مزوّد متحقق يخدمه."
              />
            </p>
          </div>
        </section>

        {/* ═══════════════ GPU CATALOG + PRICING ═══════════════ */}
        <section className="ag-sec" id="catalog" aria-labelledby="cat-h">
          <div className="ag-sec-meta">
            <span className="idx">
              <Bi en="§ 05 · GPU catalog · cost-plus" ar="§ ٠٥ · كتالوج المعالجات · تكلفة زائد هامش" />
            </span>
            <span className="kick" id="cat-h">
              <Bi en="Whole GPUs, priced from the live market" ar="معالجات كاملة، مسعّرة من السوق الحي" />
            </span>
          </div>
          <p className="intro">
            <Bi
              en="On-demand types spin up a whole, dedicated NVIDIA GPU in about a minute. Rates are cost-plus from the live market — each is a 'from' floor that floats. The native RTX 3090 is an in-Kingdom community card. USD ≈ SAR ÷ 3.75; billing is in SAR."
              ar="الأنواع عند الطلب تشغّل معالج NVIDIA كاملاً مخصصاً خلال دقيقة تقريباً. الأسعار تكلفة زائد هامش من السوق الحي — كل سعر هو حد أدنى «اعتباراً من» متغيّر. RTX 3090 الأصلية بطاقة مجتمعية داخل المملكة. الدولار ≈ الريال ÷ ٣٫٧٥؛ الفوترة بالريال."
            />
          </p>
          <div className="ag-tablewrap">
            <table className="ag-gpu">
              <thead>
                <tr>
                  <th>
                    <Bi en="GPU type" ar="نوع المعالج" />
                  </th>
                  <th>
                    <Bi en="VRAM" ar="الذاكرة" />
                  </th>
                  <th>
                    <Bi en="Tier" ar="الفئة" />
                  </th>
                  <th style={{ textAlign: 'right' }}>
                    <Bi en="from SAR/hr" ar="من ريال/ساعة" />
                  </th>
                  <th style={{ textAlign: 'right' }}>
                    <Bi en="≈ USD/hr" ar="≈ دولار/ساعة" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {GPU_FLOORS.map((g) => (
                  <tr key={g.model}>
                    <td>{g.model}</td>
                    <td className="num">{g.vram} GB</td>
                    <td>{g.tier}</td>
                    <td className="num rate">
                      {g.tier === 'on-demand' ? 'from ' : ''}
                      {g.sar.toFixed(2)}
                    </td>
                    <td className="num">{g.usd.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: 'var(--ink-2)' }}>
            <Bi
              en="Live availability per type: GET https://api.dcp.sa/api/renters/available-providers. Full per-token and subscription pricing lives on the pricing page."
              ar="التوفر الحي لكل نوع: GET https://api.dcp.sa/api/renters/available-providers. التسعير الكامل بالرمز والاشتراكات في صفحة الأسعار."
            />{' '}
            <Link className="dx-main" style={{ color: 'var(--teal)' }} href={ROUTES.pricing}>
              <Bi en="See pricing →" ar="عرض الأسعار ←" />
            </Link>
          </p>
        </section>

        {/* ═══════════════ MONEY SIGNALS ═══════════════ */}
        <section className="ag-sec" id="money" aria-labelledby="money-h">
          <div className="ag-sec-meta">
            <span className="idx">
              <Bi en="§ 06 · Safe retries & funding" ar="§ ٠٦ · إعادة آمنة وتمويل" />
            </span>
            <span className="kick" id="money-h">
              <Bi en="Money routes an agent can trust" ar="مسارات مالية يثق بها الوكيل" />
            </span>
          </div>
          <p className="intro">
            <Bi
              en="Two machine-readable guarantees make money safe for autonomous callers: an Idempotency-Key so a retry never double-spends, and an HTTP 402 funding signal that says exactly how much is needed and where to top up — and creates no pod or charge."
              ar="ضمانان قابلان للقراءة آلياً يجعلان المال آمناً للوكلاء: ترويسة Idempotency-Key حتى لا تُكرَّر المحاسبة، وإشارة تمويل HTTP 402 تقول بدقة كم يلزم وأين يُشحن — ولا تنشئ حاوية أو خصماً."
            />
          </p>
          <div className="ag-grid-2">
            <div className="ag-note">
              <div className="t">
                <Bi en="Idempotency-Key — safe retries" ar="Idempotency-Key — إعادة آمنة" />
              </div>
              <p>
                <Bi
                  en="POST /api/pods, POST /api/pods/{id}/extend and POST /api/volumes/rent accept an Idempotency-Key header. A retry with the same key returns the SAME pod / charge — so a flaky network or a retried tool call never double-spends the wallet."
                  ar="تقبل POST /api/pods و POST /api/pods/{id}/extend و POST /api/volumes/rent ترويسة Idempotency-Key. إعادة المحاولة بنفس المفتاح تعيد الحاوية/الخصم نفسه — فلا تتكرر المحاسبة أبداً."
                />
              </p>
            </div>
            <div>
              <p className="ag-code-cap">
                <Bi en="HTTP 402 — the fund-here signal (verified live)" ar="HTTP 402 — إشارة «موّل هنا» (متحقَّقة حياً)" />
              </p>
              <pre className="ag-code">
                <span className="c"># POST /api/pods H100 / 600 min over a 20 SAR wallet → no pod created</span>
                {'\n'}
                {'{'}
                {'\n  '}
                <span className="k">{'"error"'}</span>: <span className="s">{'"insufficient_balance"'}</span>,
                {'\n  '}
                <span className="k">{'"code"'}</span>: <span className="s">{'"insufficient_balance"'}</span>,
                {'\n  '}
                <span className="k">{'"currency"'}</span>: <span className="s">{'"SAR"'}</span>,
                {'\n  '}
                <span className="k">{'"required_sar"'}</span>: <span className="n">172.73</span>,
                {'\n  '}
                <span className="k">{'"balance_sar"'}</span>: <span className="n">20</span>,
                {'\n  '}
                <span className="k">{'"topup_url"'}</span>: <span className="s">{'"https://dcp.sa/renter/wallet"'}</span>,
                {'\n  '}
                <span className="k">{'"retryable"'}</span>: <span className="n">true</span>
                {'\n'}
                {'}'}
              </pre>
            </div>
          </div>
        </section>

        {/* ═══════════════ SOVEREIGNTY ═══════════════ */}
        <section className="ag-sec" id="sovereignty" aria-labelledby="sov-h">
          <div className="ag-sec-meta">
            <span className="idx">
              <Bi en="§ 07 · Sovereignty · PDPL" ar="§ ٠٧ · السيادة · نظام البيانات" />
            </span>
            <span className="kick" id="sov-h">
              <Bi en="Your data never leaves the Kingdom" ar="بياناتك لا تغادر المملكة" />
            </span>
          </div>
          <p className="intro">
            <Bi
              en="Inference, GPU pods, and persistent volumes all run on Saudi-owned hardware inside the Kingdom under full PDPL data-residency. Cross-border frontier models are off unless a tenant explicitly opts in — and when they do, every such request is marked. This is the structural advantage no foreign API can match for KSA and Gulf workloads."
              ar="الاستدلال وحاويات GPU ومساحات التخزين الدائمة كلها على عتاد سعودي داخل المملكة وفق نظام حماية البيانات. النماذج المتقدمة العابرة للحدود معطّلة ما لم يوافق العميل صراحةً — وعندها يُعلَّم كل طلب. هذه ميزة هيكلية لا تضاهيها واجهة أجنبية لأحمال المملكة والخليج."
            />
          </p>
          <div className="ag-note">
            <div className="t">
              <Bi en="Invisibility by design" ar="الإخفاء بالتصميم" />
            </div>
            <p>
              <Bi
                en="DCP only ever exposes the public NVIDIA GPU type (e.g. H100, RTX 4090). The underlying GPU vendor, the machine, its location, and how many there are are never surfaced through the API, the MCP server, or this page — a deliberate sovereignty and privacy property, not an omission."
                ar="لا تكشف DCP سوى نوع معالج NVIDIA العام (مثل H100 أو RTX 4090). مورّد المعالج والجهاز وموقعه وعددها لا تظهر أبداً عبر الواجهة أو خادم MCP أو هذه الصفحة — خاصية سيادة وخصوصية متعمّدة، لا إغفال."
              />
            </p>
          </div>
        </section>

        {/* ═══════════════ FAQ ═══════════════ */}
        <section className="ag-sec" id="faq" aria-labelledby="faq-h" style={{ borderBottom: 0 }}>
          <div className="ag-sec-meta">
            <span className="idx">
              <Bi en="§ 08 · FAQ" ar="§ ٠٨ · أسئلة شائعة" />
            </span>
            <span className="kick" id="faq-h">
              <Bi en="Questions humans and agents ask" ar="أسئلة يطرحها البشر والوكلاء" />
            </span>
          </div>
          <div className="ag-faq">
            <details open>
              <summary>
                <Bi en="What is DCP?" ar="ما هي DCP؟" />
              </summary>
              <p>
                <Bi
                  en="Saudi Arabia's sovereign AI compute platform: an OpenAI-compatible inference API, on-demand whole-GPU rental, in-Kingdom persistent storage, and an official MCP server — all on Saudi-owned hardware under PDPL, billed prepaid in Saudi Riyal."
                  ar="منصة الحوسبة السيادية للذكاء الاصطناعي في السعودية: واجهة استدلال متوافقة مع OpenAI، وإيجار معالجات كاملة عند الطلب، وتخزين دائم داخل المملكة، وخادم MCP رسمي — كلها على عتاد سعودي وفق نظام البيانات، مدفوعة مسبقاً بالريال."
                />
              </p>
            </details>
            <details>
              <summary>
                <Bi en="How does an AI agent get a key with no human?" ar="كيف يحصل الوكيل على مفتاح دون بشر؟" />
              </summary>
              <p>
                <Bi
                  en="POST https://api.dcp.sa/api/renters/agent-register (no auth). It returns 201 with a real dcp-renter- key and a 20 SAR trial credit — no email click. The MCP equivalent is register_agent. The full 100 SAR trial is the human email-verified signup path."
                  ar="POST https://api.dcp.sa/api/renters/agent-register (دون مصادقة). يعيد 201 مع مفتاح dcp-renter- حقيقي ورصيد تجريبي ٢٠ ريالاً — دون نقر بريد. ومكافئه في MCP هو register_agent. والرصيد الكامل ١٠٠ ريال هو مسار التسجيل البشري الموثّق بالبريد."
                />
              </p>
            </details>
            <details>
              <summary>
                <Bi en="How do I start a GPU on DCP?" ar="كيف أشغّل معالجاً على DCP؟" />
              </summary>
              <p>
                <Bi
                  en="List types (GET /api/renters/available-providers or list_gpus), then POST /api/pods with { gpu_type, duration_minutes } and an optional Idempotency-Key. A whole NVIDIA GPU comes up with root, Jupyter and SSH in about a minute, billed per second in SAR."
                  ar="اسرد الأنواع (GET /api/renters/available-providers أو list_gpus)، ثم POST /api/pods مع { gpu_type, duration_minutes } وترويسة Idempotency-Key اختيارية. يأتي معالج NVIDIA كامل بجذر وJupyter وSSH خلال دقيقة تقريباً، بالثانية بالريال."
                />
              </p>
            </details>
            <details>
              <summary>
                <Bi en="What happens on insufficient balance?" ar="ماذا يحدث عند نقص الرصيد؟" />
              </summary>
              <p>
                <Bi
                  en="The money routes return HTTP 402 with { code: insufficient_balance, required_sar, balance_sar, currency, topup_url, retryable: true } and create no pod or charge — so an agent can read required_sar, top up, and retry safely with the same Idempotency-Key."
                  ar="تعيد المسارات المالية HTTP 402 مع { code: insufficient_balance, required_sar, balance_sar, currency, topup_url, retryable: true } دون إنشاء حاوية أو خصم — فيقرأ الوكيل required_sar ويشحن ويعيد المحاولة بأمان بنفس Idempotency-Key."
                />
              </p>
            </details>
          </div>

          <div className="ag-cta" style={{ marginTop: '2.5rem' }}>
            <Link className="ag-btn primary" href={ROUTES.docs}>
              <Bi en="Read the full docs →" ar="اقرأ التوثيق الكامل ←" />
            </Link>
            <Link className="ag-btn ghost" href={ROUTES.renterSignup}>
              <Bi en="Human signup (100 SAR trial) →" ar="تسجيل بشري (تجربة ١٠٠ ريال) ←" />
            </Link>
            <a className="ag-btn ghost" href="/llms.txt">
              <Bi en="Machine manifest · llms.txt" ar="بيان آلي · llms.txt" />
            </a>
          </div>
        </section>
      </main>
    </div>
  )
}
