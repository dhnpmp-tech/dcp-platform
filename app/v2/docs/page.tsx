'use client'

// v2 docs.
// Three-pane docs shell (left nav / content / right TOC) with the Midnight kit.
// The only prototype interactivity is the Quickstart code-tab switcher, here a
// React useState. A language toggle (EN / ع) is added to the header chrome; the
// V2Provider handles dir/lang/palette on <html> globally.

import { useState } from 'react'
import Link from 'next/link'
import { Bi, useV2 } from '@/app/v2/lib/i18n'
import './docs.css'

type QsTab = 'curl' | 'py' | 'node'

export default function DocsPage() {
  const { toggle, lang } = useV2()
  const [qsTab, setQsTab] = useState<QsTab>('curl')

  return (
    <>
      <header className="dx-top">
        <Link href="/v2/home" className="wm">
          DCP<i>∞</i><span className="tag">Docs</span>
        </Link>
        <div className="links">
          <Link href="/v2/home"><Bi en="Home" ar="الرئيسية" /></Link>
          <Link href="/v2/auth"><Bi en="Console" ar="لوحة التحكم" /></Link>
          <Link href="/status"><Bi en="API status" ar="حالة الواجهة" /></Link>
          <button
            type="button"
            className="dx-langpill"
            onClick={toggle}
            aria-label="Toggle language"
          >
            <span className={lang === 'en' ? 'on' : undefined}>EN</span>
            <span className={lang === 'ar' ? 'on' : undefined}>ع</span>
          </button>
        </div>
      </header>

      <div className="dx-grid">

        {/* Left nav */}
        <nav className="dx-nav">
          <div className="sec"><Bi en="Get started" ar="ابدأ هنا" /></div>
          <a href="#intro" className="on"><Bi en="Introduction" ar="مقدمة" /></a>
          <a href="#quickstart"><Bi en="Quickstart" ar="بداية سريعة" /></a>
          <a href="#auth"><Bi en="Authentication" ar="المصادقة" /></a>
          <a href="#billing"><Bi en="Billing & tokens" ar="الفوترة والرموز" /></a>
          <div className="sec"><Bi en="API reference" ar="مرجع الواجهة" /></div>
          <a href="#chat"><Bi en="Chat completions" ar="إكمالات المحادثة" /></a>
          <a href="#embeddings"><Bi en="Embeddings" ar="التضمينات" /></a>
          <a href="#rerank"><Bi en="Reranking" ar="إعادة الترتيب" /></a>
          <a href="#streaming"><Bi en="Streaming" ar="البث" /></a>
          <a href="#errors"><Bi en="Errors & limits" ar="الأخطاء والحدود" /></a>
          <div className="sec"><Bi en="Guides" ar="أدلة" /></div>
          <a href="#arabic"><Bi en="Working in Arabic" ar="العمل بالعربية" /></a>
          <a href="#rag"><Bi en="Build a RAG app" ar="بناء تطبيق RAG" /></a>
          <a href="#residency"><Bi en="Data residency" ar="إقامة البيانات" /></a>
          <div className="sec"><Bi en="Compute" ar="الحوسبة" /></div>
          <a href="#pods"><Bi en="GPU pods" ar="حاويات GPU" /></a>
          <a href="#volumes"><Bi en="Persistent volumes" ar="مساحات تخزين" /></a>
          <div className="sec"><Bi en="Agents" ar="الوكلاء" /></div>
          <a href="#agents"><Bi en="Use DCP from an agent" ar="استخدم DCP من وكيل" /></a>
          <div className="sec"><Bi en="SDKs" ar="حِزم التطوير" /></div>
          <a href="#python-sdk"><Bi en="Python" ar="بايثون" /></a>
          <a href="#node-sdk"><Bi en="Node.js" ar="Node.js" /></a>
          <a href="#curl-rest"><Bi en="cURL / REST" ar="cURL / REST" /></a>
        </nav>

        {/* Content */}
        <main className="dx-main">
          <span className="dx-eyebrow">§ <Bi en="Get started" ar="ابدأ هنا" /></span>
          <h1 id="intro"><Bi en="The DCP API." ar="واجهة DCP." /></h1>
          <p className="lead">
            <Bi
              en="OpenAI-compatible chat completions and model discovery, served from inside the Kingdom. If you’ve used the OpenAI SDK, you already know the core flow — change the base URL and the key, and you’re running Arabic-first inference on KSA-resident hardware, billed per token in Riyal."
              ar="إكمالات محادثة واكتشاف نماذج بتوافق OpenAI، تُقدَّم من داخل المملكة. إن كنت قد استخدمت حزمة OpenAI، فأنت تعرف المسار الأساسي — غيّر عنوان القاعدة والمفتاح، وستشغّل استدلالاً عربياً أولاً على عتاد مقيم بالسعودية، يُحسب لكل رمز بالريال."
            />
          </p>

          <div className="callout">
            <div className="t"><Bi en="Base URL" ar="عنوان القاعدة" /></div>
            <p>
              <code>https://api.dcp.sa/v1</code>{' '}
              <Bi
                en="— drop-in compatible with the OpenAI chat-completions route. Model catalog and RAG endpoints are documented separately below."
                ar="— متوافق مباشرة مع مسار إكمالات المحادثة في OpenAI. كتالوج النماذج ومسارات RAG موثقة أدناه."
              />
            </p>
          </div>

          <h2 id="quickstart"><Bi en="Quickstart" ar="بداية سريعة" /></h2>
          <p>
            <Bi
              en="Install the OpenAI SDK you already use, point it at DCP, and make your first call. Every request is billed per token against your wallet balance; new renter accounts start with SAR 100 of platform credit."
              ar="ثبّت حزمة OpenAI التي تستخدمها، وجّهها إلى DCP، وأجرِ أول طلب لك. يُحسب كل طلب لكل رمز من رصيد محفظتك؛ تبدأ حسابات المستأجر الجديدة برصيد منصة قدره ١٠٠ ريال."
            />
          </p>

          <div className="code-tabs" id="qs-tabs">
            <button type="button" className={qsTab === 'curl' ? 'on' : undefined} onClick={() => setQsTab('curl')}>cURL</button>
            <button type="button" className={qsTab === 'py' ? 'on' : undefined} onClick={() => setQsTab('py')}>Python</button>
            <button type="button" className={qsTab === 'node' ? 'on' : undefined} onClick={() => setQsTab('node')}>Node.js</button>
          </div>

          <div className={qsTab === 'curl' ? 'code-pane on' : 'code-pane'} data-t="curl">
            <pre className="code">$ <span className="k">curl</span> <span className="s">https://api.dcp.sa/v1/chat/completions</span> \
   <span className="k">-H</span> <span className="s">{'"Authorization: Bearer $DCP_KEY"'}</span> \
   <span className="k">-H</span> <span className="s">{'"Content-Type: application/json"'}</span> \
   <span className="k">-d</span> <span className="s">{`'{
     "model": "qwen3-4b",
     "messages": [{"role": "user", "content": "اشرح لي زكاة المال"}]
   }'`}</span></pre>
          </div>

          <div className={qsTab === 'py' ? 'code-pane on' : 'code-pane'} data-t="py">
            <pre className="code"><span className="k">import</span> os
<span className="k">from</span> openai <span className="k">import</span> OpenAI

client = <span className="n">OpenAI</span>(
    base_url=<span className="s">{'"https://api.dcp.sa/v1"'}</span>,
    api_key=os.environ[<span className="s">{'"DCP_KEY"'}</span>],
)

resp = client.chat.completions.create(
    model=<span className="s">{'"qwen3-4b"'}</span>,
    messages=[{`{`}<span className="s">{'"role"'}</span>: <span className="s">{'"user"'}</span>, <span className="s">{'"content"'}</span>: <span className="s">{'"اشرح لي زكاة المال"'}</span>{`}`}],
)
<span className="n">print</span>(resp.choices[<span className="k">0</span>].message.content)</pre>
          </div>

          <div className={qsTab === 'node' ? 'code-pane on' : 'code-pane'} data-t="node">
            <pre className="code"><span className="k">import</span> OpenAI <span className="k">from</span> <span className="s">{'"openai"'}</span>;

<span className="k">const</span> client = <span className="k">new</span> <span className="n">OpenAI</span>({`{`}
  baseURL: <span className="s">{'"https://api.dcp.sa/v1"'}</span>,
  apiKey: process.env.DCP_KEY,
{`}`});

<span className="k">const</span> resp = <span className="k">await</span> client.chat.completions.create({`{`}
  model: <span className="s">{'"qwen3-4b"'}</span>,
  messages: [{`{`} role: <span className="s">{'"user"'}</span>, content: <span className="s">{'"اشرح لي زكاة المال"'}</span> {`}`}],
{`}`});</pre>
          </div>

          <h2 id="auth"><Bi en="Authentication" ar="المصادقة" /></h2>
          <p>
            <Bi
              en="All requests need a bearer token in the "
              ar="تحتاج جميع الطلبات إلى رمز حامل في ترويسة "
            />
            <code>Authorization</code>
            <Bi
              en=" header. Create and manage keys in the console under "
              ar=". أنشئ المفاتيح وأدِرها في وحدة التحكم ضمن "
            />
            <Link className="ln" href="/v2/renter/keys"><Bi en="API keys" ar="مفاتيح الواجهة" /></Link>
            <Bi
              en=". Keys are scoped per workspace; use a separate key per service so you can revoke one without affecting the rest."
              ar=". المفاتيح مقيّدة لكل مساحة عمل؛ استخدم مفتاحاً منفصلاً لكل خدمة حتى تتمكن من إبطال أحدها دون التأثير على البقية."
            />
          </p>
          <pre className="code"><span className="k">Authorization:</span> Bearer $DCP_KEY</pre>

          <h2 id="billing"><Bi en="Billing & tokens" ar="الفوترة والرموز" /></h2>
          <p>
            <Bi
              en="You pay per token — input and output are metered separately, and settled in halala-precision against your wallet. There’s no per-request minimum and no flat platform fee. Failed requests aren’t billed."
              ar="تدفع لكل رمز — يُقاس الإدخال والإخراج بشكل منفصل، ويُسوّى بدقة الهللة من محفظتك. لا يوجد حد أدنى لكل طلب ولا رسوم منصة ثابتة. الطلبات الفاشلة لا تُحتسب."
            />
          </p>
          <ul>
            <li>
              <Bi en="Balance and burn rate live in " ar="الرصيد ومعدل الاستهلاك في " />
              <Link className="ln" href="/v2/renter/wallet"><Bi en="Wallet" ar="المحفظة" /></Link>.
            </li>
            <li>
              <Bi en="Per-job cost and history live in " ar="تكلفة كل مهمة وسجلها في " />
              <Link className="ln" href="/v2/renter/usage"><Bi en="Usage" ar="الاستخدام" /></Link>.
            </li>
            <li>
              <Bi en="Per-job receipts for every charge are listed under " ar="إيصالات كل مهمة لكل عملية خصم مدرجة ضمن " />
              <Link className="ln" href="/v2/renter/invoices"><Bi en="Invoices" ar="الفواتير" /></Link>.
            </li>
          </ul>

          <h2 id="chat"><Bi en="Chat completions" ar="إكمالات المحادثة" /></h2>
          <p>
            <code>POST /v1/chat/completions</code>
            <Bi
              en=" — the primary endpoint for conversational and instruction-following models."
              ar=" — نقطة النهاية الأساسية للنماذج الحوارية والمتّبعة للتعليمات."
            />
          </p>
          <table className="param-tbl">
            <thead>
              <tr>
                <th><Bi en="Parameter" ar="المعامل" /></th>
                <th><Bi en="Type" ar="النوع" /></th>
                <th><Bi en="Description" ar="الوصف" /></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="name">model</td>
                <td className="type">string</td>
                <td className="desc">
                  <Bi en="The model to use, e.g. " ar="النموذج المراد استخدامه، مثل " />
                  <code>qwen3-4b</code>
                  <Bi en=". See the model list in your console." ar=". راجع قائمة النماذج في وحدة التحكم." />
                </td>
              </tr>
              <tr>
                <td className="name">messages</td>
                <td className="type">array</td>
                <td className="desc">
                  <Bi en="The conversation so far, as " ar="المحادثة حتى الآن، على هيئة كائنات " />
                  <code>{'{role, content}'}</code>
                  <Bi en=" objects." ar="." />
                </td>
              </tr>
              <tr>
                <td className="name">stream</td>
                <td className="type">boolean</td>
                <td className="desc">
                  <Bi
                    en="If true, partial tokens are sent as server-sent events. Default "
                    ar="إذا كانت صحيحة، تُرسَل الرموز الجزئية كأحداث من الخادم. الافتراضي "
                  />
                  <code>false</code>.
                </td>
              </tr>
              <tr>
                <td className="name">temperature</td>
                <td className="type">number</td>
                <td className="desc">
                  <Bi
                    en="Sampling temperature, 0–2. Lower is more deterministic. Default "
                    ar="درجة حرارة العيّنات، ٠–٢. الأقل أكثر حتمية. الافتراضي "
                  />
                  <code>0.7</code>.
                </td>
              </tr>
              <tr>
                <td className="name">max_tokens</td>
                <td className="type">integer</td>
                <td className="desc">
                  <Bi en="Maximum tokens to generate in the completion." ar="الحد الأقصى للرموز المولّدة في الإكمال." />
                </td>
              </tr>
            </tbody>
          </table>

          <h2 id="embeddings"><Bi en="Embeddings" ar="التضمينات" /></h2>
          <p>
            <code>GET /api/models/catalog?task=embedding</code>
            <Bi
              en=" — standalone OpenAI-compatible embeddings are not exposed yet. Discover available embedding models through the catalog and use the managed RAG bundle for retrieval workflows."
              ar=" — مسار تضمينات مستقل بتوافق OpenAI غير متاح بعد. اكتشف نماذج التضمين المتاحة عبر الكتالوج واستخدم حزمة RAG المُدارة لتدفقات الاسترجاع."
            />
          </p>
          <pre className="code">$ <span className="k">curl</span> <span className="s">https://dcp.sa/api/models/catalog?task=embedding</span> \
   <span className="k">-H</span> <span className="s">{'"Authorization: Bearer $DCP_KEY"'}</span></pre>

          <h2 id="rerank"><Bi en="Reranking" ar="إعادة الترتيب" /></h2>
          <p>
            <Bi
              en="Reranking is available as part of the Arabic RAG bundle and model catalog. A standalone public /v1/rerank route is not exposed in this frontend yet, so applications should call the managed RAG flow or compose retrieval server-side."
              ar="إعادة الترتيب متاحة ضمن حزمة RAG العربية وكتالوج النماذج. لا يوجد حالياً مسار عام مستقل /v1/rerank في هذه الواجهة، لذلك يجب استخدام تدفق RAG المُدار أو تركيب الاسترجاع من الخادم."
            />
          </p>

          <h2 id="streaming"><Bi en="Streaming" ar="البث" /></h2>
          <p>
            <Bi
              en="Set stream=true on /v1/chat/completions to receive server-sent events. The stream ends with data: [DONE]. If a provider fails after headers are sent, DCP emits a terminal error frame instead of crashing the response."
              ar="اضبط stream=true على /v1/chat/completions لاستقبال أحداث من الخادم. ينتهي البث بـ data: [DONE]. إذا فشل مزوّد بعد إرسال الترويسات، ترسل DCP إطار خطأ نهائي بدلاً من كسر الاستجابة."
            />
          </p>

          <h2 id="errors"><Bi en="Errors & limits" ar="الأخطاء والحدود" /></h2>
          <p>
            <Bi
              en="DCP returns JSON error bodies. The important renter cases are 401 for missing/invalid keys, 402 insufficient_balance when the pre-flight estimate exceeds available balance, 404 for unavailable models, 429 for rate limits, and 503 when no verified provider can serve the model."
              ar="تعيد DCP أجسام أخطاء بصيغة JSON. أهم حالات المستأجرين: 401 للمفاتيح المفقودة أو غير الصالحة، و402 insufficient_balance عندما يتجاوز تقدير ما قبل التنفيذ الرصيد المتاح، و404 للنماذج غير المتاحة، و429 لحدود المعدل، و503 عندما لا يوجد مزوّد موثّق قادر على خدمة النموذج."
            />
          </p>

          <h2 id="rag"><Bi en="Build a RAG app" ar="بناء تطبيق RAG" /></h2>
          <p>
            <Bi
              en="Use the Arabic RAG model bundle for embeddings, reranking, and generation. The bundle endpoint reports whether BGE-M3, the reranker, and Arabic generation models are currently available."
              ar="استخدم حزمة نماذج RAG العربية للتضمين وإعادة الترتيب والتوليد. يعرض مسار الحزمة ما إذا كانت BGE-M3 والمُعيد والنماذج العربية متاحة حالياً."
            />
          </p>
          <pre className="code">$ <span className="k">curl</span> <span className="s">https://dcp.sa/api/models/bundles/arabic-rag</span></pre>

          <h2 id="python-sdk"><Bi en="Python SDK" ar="حزمة Python" /></h2>
          <p>
            <Bi en="Use the official OpenAI Python SDK with DCP's base URL." ar="استخدم حزمة OpenAI الرسمية لـPython مع عنوان DCP." />
          </p>

          <h2 id="node-sdk"><Bi en="Node.js SDK" ar="حزمة Node.js" /></h2>
          <p>
            <Bi en="Use the official OpenAI JavaScript SDK and set baseURL to https://api.dcp.sa/v1." ar="استخدم حزمة OpenAI الرسمية لـJavaScript واضبط baseURL إلى https://api.dcp.sa/v1." />
          </p>

          <h2 id="curl-rest"><Bi en="cURL / REST" ar="cURL / REST" /></h2>
          <p>
            <Bi en="Every SDK call maps to HTTPS requests with Authorization: Bearer $DCP_KEY." ar="كل استدعاء SDK يقابله طلب HTTPS مع Authorization: Bearer $DCP_KEY." />
          </p>

          <h2 id="arabic"><Bi en="Working in Arabic" ar="العمل بالعربية" /></h2>
          <p>
            <Bi
              en="DCP’s models are tuned Arabic-first. You can send Arabic directly in "
              ar="نماذج DCP مضبوطة عربياً أولاً. يمكنك إرسال العربية مباشرة في "
            />
            <code>messages</code>
            <Bi
              en=" — no transliteration, no special encoding. Responses come back in clean Modern Standard Arabic. For mixed workloads, the models handle code-switching between Arabic and English naturally."
              ar=" — دون نقحرة ودون ترميز خاص. تعود الردود بعربية فصحى حديثة نقية. للأحمال المختلطة، تتعامل النماذج مع التبديل بين العربية والإنجليزية بشكل طبيعي."
            />
          </p>

          <div className="callout">
            <div className="t"><Bi en="Data residency" ar="إقامة البيانات" /></div>
            <p>
              <Bi
                en="Every request in this section is served from KSA-resident hardware by default. Cross-border frontier models are off unless you explicitly opt in. See "
                ar="يُقدَّم كل طلب في هذا القسم من عتاد مقيم بالسعودية افتراضياً. النماذج الحدودية العابرة للحدود معطّلة ما لم توافق صراحةً. راجع "
              />
              <a className="ln" href="#residency"><Bi en="Data residency" ar="إقامة البيانات" /></a>.
            </p>
          </div>

          <h2 id="residency"><Bi en="Data residency" ar="إقامة البيانات" /></h2>
          <p>
            <Bi
              en="By default, your prompts, completions, and managed RAG artifacts stay in the Kingdom. Frontier (cross-border) models stay disabled until you turn them on per workspace — and when you do, every such request is marked so you always know where your data went."
              ar="افتراضياً، تبقى مطالباتك وإكمالاتك ومواد RAG المُدارة داخل المملكة. تبقى النماذج الحدودية (العابرة للحدود) معطّلة حتى تشغّلها لكل مساحة عمل — وعند ذلك، يُعلَّم كل طلب من هذا النوع لتعرف دائماً أين ذهبت بياناتك."
            />
          </p>

          <span className="dx-eyebrow">§ <Bi en="Compute" ar="الحوسبة" /></span>
          <h2 id="pods"><Bi en="GPU pods" ar="حاويات GPU" /></h2>
          <p>
            <Bi
              en="Rent a whole GPU with root access, Jupyter, and SSH — prepaid per minute in Riyal, unused time refunded when you stop. Launch returns a pod id; poll it until status is running to get the Jupyter URL and SSH command."
              ar="استأجر بطاقة GPU كاملة مع صلاحيات الجذر وJupyter وSSH — مدفوعة مسبقاً بالدقيقة بالريال، ويُسترد الوقت غير المستخدم عند الإيقاف. يعيد الإطلاق معرّف الحاوية؛ استعلم عنه حتى تصبح الحالة running للحصول على رابط Jupyter وأمر SSH."
            />
          </p>
          <pre className="code">$ <span className="k">curl</span> <span className="s">https://api.dcp.sa/api/pods</span> \
   <span className="k">-H</span> <span className="s">{'"Authorization: Bearer $DCP_KEY"'}</span> \
   <span className="k">-d</span> <span className="s">{"'{\"duration_minutes\": 60}'"}</span>

$ <span className="k">curl</span> <span className="s">https://api.dcp.sa/api/pods/$POD_ID</span>
$ <span className="k">curl</span> <span className="k">-X</span> POST <span className="s">https://api.dcp.sa/api/pods/$POD_ID/extend</span> <span className="k">-d</span> <span className="s">{"'{\"extend_minutes\": 30}'"}</span>
$ <span className="k">curl</span> <span className="k">-X</span> DELETE <span className="s">https://api.dcp.sa/api/pods/$POD_ID</span></pre>

          <h2 id="volumes"><Bi en="Persistent volumes" ar="مساحات تخزين دائمة" /></h2>
          <p>
            <Bi
              en="Rent an exclusive, in-Kingdom persistent volume (10/20/30 GB, billed monthly in Riyal). With an active volume, a pod's /workspace is restored on launch and snapshotted on stop — your files persist across pods and across providers. Without one, pods are ephemeral."
              ar="استأجر مساحة تخزين دائمة وحصرية داخل المملكة (10/20/30 غيغابايت، تُفوتر شهرياً بالريال). مع مساحة نشطة، يُستعاد /workspace عند الإطلاق ويُحفظ عند الإيقاف — فتبقى ملفاتك بين الحاويات وبين المزوّدين. بدونها تكون الحاويات مؤقتة."
            />
          </p>
          <pre className="code">$ <span className="k">curl</span> <span className="s">https://api.dcp.sa/api/volumes/rent</span> <span className="k">-H</span> <span className="s">{'"Authorization: Bearer $DCP_KEY"'}</span> <span className="k">-d</span> <span className="s">{"'{\"size_gb\": 20}'"}</span>
$ <span className="k">curl</span> <span className="s">https://api.dcp.sa/api/volumes/me</span></pre>

          <span className="dx-eyebrow">§ <Bi en="Agents" ar="الوكلاء" /></span>
          <h2 id="agents"><Bi en="Use DCP from an agent" ar="استخدم DCP من وكيل" /></h2>
          <p>
            <Bi
              en="DCP is built to be used by agents and software, not only humans. The inference API is a drop-in OpenAI replacement (point any OpenAI SDK at the base URL above), and an official Model Context Protocol (MCP) server lets an MCP-capable agent — Claude, Cursor, or your own — run inference, rent GPUs, and manage storage through native tool calls."
              ar="بُنيت DCP لتُستخدم من الوكلاء والبرمجيات، لا البشر فقط. واجهة الاستدلال بديل مباشر لـ OpenAI (وجّه أي حزمة OpenAI إلى عنوان القاعدة أعلاه)، وخادم MCP رسمي يتيح لأي وكيل يدعم MCP — Claude أو Cursor أو وكيلك الخاص — تشغيل الاستدلال واستئجار البطاقات وإدارة التخزين عبر استدعاءات أدوات أصلية."
            />
          </p>
          <pre className="code"><span className="c">{'// MCP client config (Claude Desktop / Claude Code / Cursor)'}</span>
{'{ "mcpServers": { "dcp": {'}
   <span className="k">"command"</span>: <span className="s">"npx"</span>, <span className="k">"args"</span>: [<span className="s">"-y"</span>, <span className="s">"@dcp/mcp"</span>],
   <span className="k">"env"</span>: {'{ '}<span className="k">"DCP_API_KEY"</span>: <span className="s">"dcp-renter-..."</span>{' }'}
{'} } }'}</pre>
          <p>
            <Bi
              en="Discovery: agents can read /llms.txt and /.well-known/ai-plugin.json at dcp.sa, plus the OpenAPI spec at /docs/openapi.yaml. MCP tools: list_models, chat, create_pod, get_pod, extend_pod, stop_pod, rent_volume, get_volume, get_balance."
              ar="الاكتشاف: يمكن للوكلاء قراءة /llms.txt و/.well-known/ai-plugin.json على dcp.sa، ومواصفات OpenAPI على /docs/openapi.yaml. أدوات MCP: list_models و chat و create_pod و get_pod و extend_pod و stop_pod و rent_volume و get_volume و get_balance."
            />
          </p>
        </main>

        {/* Right TOC */}
        <aside className="dx-toc">
          <div className="t"><Bi en="On this page" ar="في هذه الصفحة" /></div>
          <a href="#quickstart"><Bi en="Quickstart" ar="بداية سريعة" /></a>
          <a href="#auth"><Bi en="Authentication" ar="المصادقة" /></a>
          <a href="#billing"><Bi en="Billing & tokens" ar="الفوترة والرموز" /></a>
          <a href="#chat"><Bi en="Chat completions" ar="إكمالات المحادثة" /></a>
          <a href="#embeddings"><Bi en="Embeddings" ar="التضمينات" /></a>
          <a href="#rerank"><Bi en="Reranking" ar="إعادة الترتيب" /></a>
          <a href="#streaming"><Bi en="Streaming" ar="البث" /></a>
          <a href="#errors"><Bi en="Errors & limits" ar="الأخطاء والحدود" /></a>
          <a href="#arabic"><Bi en="Working in Arabic" ar="العمل بالعربية" /></a>
          <a href="#rag"><Bi en="Build a RAG app" ar="بناء تطبيق RAG" /></a>
          <a href="#residency"><Bi en="Data residency" ar="إقامة البيانات" /></a>
          <a href="#pods"><Bi en="GPU pods" ar="حاويات GPU" /></a>
          <a href="#volumes"><Bi en="Persistent volumes" ar="مساحات تخزين" /></a>
          <a href="#agents"><Bi en="Use DCP from an agent" ar="استخدم DCP من وكيل" /></a>
        </aside>

      </div>
    </>
  )
}
