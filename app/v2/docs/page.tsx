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
          <Link href="/v2/agents"><Bi en="Agent product guide ↗" ar="دليل منتج الوكلاء ↗" /></Link>
          <a href="#agents"><Bi en="Use DCP from an agent" ar="استخدم DCP من وكيل" /></a>
          <a href="#mcp-install"><Bi en="Install (MCP)" ar="التثبيت (MCP)" /></a>
          <a href="#mcp-tools"><Bi en="Tools" ar="الأدوات" /></a>
          <a href="#mcp-rent-gpu"><Bi en="Agent rents a GPU" ar="وكيل يستأجر معالجاً" /></a>
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
          <h2 id="agents"><Bi en="Use DCP from an agent (MCP)" ar="استخدم DCP من وكيل (MCP)" /></h2>
          <p className="lead">
            <Bi
              en="DCP is agent-first: it is built to be driven by agents and software, not only humans. An official Model Context Protocol (MCP) server lets any MCP-capable agent — Claude Desktop, Claude Code, Cursor, or your own — run sovereign in-Kingdom inference, rent a whole GPU, and keep persistent storage through native tool calls. Everything is prepaid in Riyal from one renter wallet."
              ar="DCP مصمَّمة للوكلاء أولاً: بُنيت لتُقاد من الوكلاء والبرمجيات، لا البشر فقط. خادم MCP رسمي يتيح لأي وكيل يدعم MCP — Claude Desktop أو Claude Code أو Cursor أو وكيلك الخاص — تشغيل استدلال سيادي داخل المملكة، واستئجار معالج كامل، والاحتفاظ بتخزين دائم عبر استدعاءات أدوات أصلية. كل شيء مدفوع مسبقاً بالريال من محفظة مستأجر واحدة."
            />
          </p>
          <div className="callout">
            <div className="t"><Bi en="Zero human in the loop" ar="دون تدخل بشري" /></div>
            <p>
              <Bi
                en="An agent can mint its own key with no human: POST /api/renters/agent-register (no auth) returns a real dcp-renter- key plus a 20 SAR trial credit. Money routes accept an Idempotency-Key for safe retries and return a machine-readable HTTP 402 (insufficient_balance, required_sar, topup_url) when the wallet is short. The full narrative + copy-paste recipe live on the "
                ar="يستطيع الوكيل صنع مفتاحه دون بشر: POST /api/renters/agent-register (دون مصادقة) يعيد مفتاح dcp-renter- حقيقياً ورصيداً تجريبياً ٢٠ ريالاً. المسارات المالية تقبل Idempotency-Key لإعادة آمنة وتعيد HTTP 402 قابلاً للقراءة آلياً (insufficient_balance، required_sar، topup_url) عند نقص الرصيد. السرد الكامل والوصفة الجاهزة على "
              />
              <Link className="ln" href="/v2/agents"><Bi en="agent product page" ar="صفحة منتج الوكلاء" /></Link>.
            </p>
          </div>

          <h3 id="mcp-install"><Bi en="Install" ar="التثبيت" /></h3>
          <p>
            <Bi
              en="The server runs over stdio via npx — there is nothing to install globally. Add it to your MCP client config ("
              ar="يعمل الخادم عبر stdio بواسطة npx — لا شيء يُثبَّت عالمياً. أضِفه إلى إعدادات عميل MCP لديك ("
            />
            <code>.mcp.json</code>
            <Bi en=" for Claude Code, " ar=" لـ Claude Code، و" />
            <code>claude_desktop_config.json</code>
            <Bi
              en=" for Claude Desktop, or your client's equivalent). Set DCP_API_KEY to your renter API key — both "
              ar=" لـ Claude Desktop، أو ما يعادله في عميلك). اضبط DCP_API_KEY على مفتاح المستأجر الخاص بك — كلا البادئتين "
            />
            <code>dcp-renter-</code>
            <Bi en=" and " ar=" و" />
            <code>dc1-sk-</code>
            <Bi
              en=" prefixes are accepted (via Bearer or x-renter-key). Create one in the console under "
              ar=" مقبولتان (عبر Bearer أو x-renter-key). أنشئ مفتاحاً في وحدة التحكم ضمن "
            />
            <Link className="ln" href="/v2/renter/keys"><Bi en="API keys" ar="مفاتيح الواجهة" /></Link>
            <Bi en=", or let an agent mint one with no human via register_agent — see the " ar="، أو دع الوكيل يصنع مفتاحاً دون بشر عبر register_agent — راجع " />
            <Link className="ln" href="/v2/agents"><Bi en="agent guide" ar="دليل الوكلاء" /></Link>.
          </p>
          <pre className="code"><span className="c">{'// .mcp.json (Claude Code) · claude_desktop_config.json (Claude Desktop) · Cursor'}</span>
{'{'}
  <span className="k">"mcpServers"</span>: {'{'}
    <span className="k">"dcp"</span>: {'{'}
      <span className="k">"command"</span>: <span className="s">"npx"</span>,
      <span className="k">"args"</span>: [<span className="s">"-y"</span>, <span className="s">"github:dhnpmp-tech/dcp-mcp"</span>],
      <span className="k">"env"</span>: {'{ '}<span className="k">"DCP_API_KEY"</span>: <span className="s">"dc1-sk-..."</span>{' }'}
    {'}'}
  {'}'}
{'}'}</pre>
          <div className="callout">
            <div className="t"><Bi en="Environment" ar="البيئة" /></div>
            <p>
              <code>DCP_API_KEY</code>
              <Bi
                en=" — your renter API key (required). "
                ar=" — مفتاح المستأجر الخاص بك (مطلوب). "
              />
              <code>DCP_API_BASE</code>
              <Bi
                en=" — API host, defaults to https://api.dcp.sa. Fund the wallet (SAR) and create a key at dcp.sa first."
                ar=" — مضيف الواجهة، الافتراضي https://api.dcp.sa. موّل المحفظة (بالريال) وأنشئ مفتاحاً على dcp.sa أولاً."
              />
            </p>
          </div>

          <h3 id="mcp-tools"><Bi en="Tools" ar="الأدوات" /></h3>
          <p>
            <Bi
              en="The server exposes eleven native tools. The first, register_agent, is unauthenticated — an agent calls it with no key to mint its own (zero human). Inference is OpenAI-compatible; pods and volumes are prepaid per minute / per month in Riyal, with unused pod time refunded on stop."
              ar="يكشف الخادم إحدى عشرة أداة أصلية. الأولى، register_agent، دون مصادقة — يستدعيها الوكيل بلا مفتاح ليصنع مفتاحه (دون بشر). الاستدلال متوافق مع OpenAI؛ والحاويات والمساحات مدفوعة مسبقاً بالدقيقة / بالشهر بالريال، مع استرداد وقت الحاوية غير المستخدم عند الإيقاف."
            />
          </p>
          <table className="param-tbl">
            <thead>
              <tr>
                <th><Bi en="Tool" ar="الأداة" /></th>
                <th><Bi en="What it does" ar="ماذا تفعل" /></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="name">register_agent</td>
                <td className="desc"><Bi en="Self-register a new renter account in one unauthenticated call — a real dcp-renter- key plus a 20 SAR trial credit, no human and no email. Use first when no key is set." ar="يسجّل حساب مستأجر جديد في استدعاء واحد دون مصادقة — مفتاح dcp-renter- حقيقي ورصيد تجريبي ٢٠ ريالاً، دون بشر ودون بريد. استخدمه أولاً عند غياب المفتاح." /></td>
              </tr>
              <tr>
                <td className="name">list_models</td>
                <td className="desc"><Bi en="List the models serveable right now (OpenAI-style entries; only available=true are live)." ar="يسرد النماذج القابلة للخدمة الآن (إدخالات بأسلوب OpenAI؛ المتاح فقط هو available=true)." /></td>
              </tr>
              <tr>
                <td className="name">chat</td>
                <td className="desc"><Bi en="Run an OpenAI-compatible chat completion — sovereign, in-Kingdom inference. Pick a model id from list_models." ar="يشغّل إكمال محادثة متوافقاً مع OpenAI — استدلال سيادي داخل المملكة. اختر معرّف نموذج من list_models." /></td>
              </tr>
              <tr>
                <td className="name">get_balance</td>
                <td className="desc"><Bi en="Get the renter wallet balance (SAR). Inference, pods, and volumes are all prepaid from it." ar="يجلب رصيد محفظة المستأجر (بالريال). الاستدلال والحاويات والمساحات كلها مدفوعة مسبقاً منها." /></td>
              </tr>
              <tr>
                <td className="name">list_gpus</td>
                <td className="desc"><Bi en="List rentable GPU TYPES right now (gpu_type + vram_gb + available + on_demand). Pick a gpu_type string to pass to create_pod — only the public NVIDIA label, no machine or vendor." ar="يسرد أنواع المعالجات القابلة للإيجار الآن (النوع + الذاكرة + التوفر). اختر نوعاً لتمرّره إلى create_pod — التسمية العامة فقط، دون جهاز أو مورّد." /></td>
              </tr>
              <tr>
                <td className="name">create_pod</td>
                <td className="desc"><Bi en="Rent a whole GPU as an interactive pod (root + Jupyter + SSH), prepaid per minute in SAR. Optional gpu_type (from list_gpus, e.g. 'H100'); omit to auto-pick." ar="يستأجر معالجاً كاملاً كحاوية تفاعلية (جذر + Jupyter + SSH)، مدفوعاً مسبقاً بالدقيقة بالريال. النوع اختياري (من list_gpus، مثل 'H100')؛ احذفه للاختيار التلقائي." /></td>
              </tr>
              <tr>
                <td className="name">get_pod</td>
                <td className="desc"><Bi en="Get a pod's status and access details: status, access_url (Jupyter), ssh_command, ends_at, seconds_remaining." ar="يجلب حالة الحاوية وتفاصيل الوصول: الحالة، وaccess_url (Jupyter)، وssh_command، وends_at، وseconds_remaining." /></td>
              </tr>
              <tr>
                <td className="name">extend_pod</td>
                <td className="desc"><Bi en="Add time to a running pod without restarting it; the workspace and Jupyter token are unchanged." ar="يضيف وقتاً لحاوية قيد التشغيل دون إعادة تشغيلها؛ مساحة العمل ورمز Jupyter يبقيان كما هما." /></td>
              </tr>
              <tr>
                <td className="name">stop_pod</td>
                <td className="desc"><Bi en="Stop a pod early. Unused prepaid time is refunded to the wallet." ar="يوقف الحاوية مبكراً. يُسترد الوقت المدفوع غير المستخدم إلى المحفظة." /></td>
              </tr>
              <tr>
                <td className="name">rent_volume</td>
                <td className="desc"><Bi en="Rent an exclusive, in-Kingdom persistent volume (10/20/30 GB) so a pod's /workspace persists across pods and providers." ar="يستأجر مساحة تخزين دائمة حصرية داخل المملكة (10/20/30 غيغابايت) ليبقى /workspace بين الحاويات والمزوّدين." /></td>
              </tr>
              <tr>
                <td className="name">get_volume</td>
                <td className="desc"><Bi en="Get the renter's active persistent volume (size, usage, price, pool availability)." ar="يجلب مساحة التخزين الدائمة النشطة للمستأجر (الحجم، الاستخدام، السعر، توفر المجمّع)." /></td>
              </tr>
            </tbody>
          </table>

          <h3 id="mcp-rent-gpu"><Bi en="Example: an agent rents a GPU" ar="مثال: وكيل يستأجر معالجاً" /></h3>
          <p>
            <Bi
              en="Once the server is wired in, the agent rents and uses a GPU in three tool calls — no human in the loop. Describe the goal in plain language and the agent picks the tools."
              ar="بمجرد ربط الخادم، يستأجر الوكيل معالجاً ويستخدمه في ثلاثة استدعاءات أدوات — دون تدخل بشري. صِف الهدف بلغة طبيعية ويختار الوكيل الأدوات."
            />
          </p>
          <pre className="code"><span className="c"># 1 · Rent a whole GPU for 30 minutes (prepaid in SAR)</span>
create_pod({'{ '}<span className="k">duration_minutes</span>: <span className="n">30</span>{' }'})
   <span className="c">{'// → { pod_id: "pod-...", status: "starting", quoted_sar: ... }'}</span>

<span className="c"># 2 · Poll until it is running, then open Jupyter / SSH</span>
get_pod({'{ '}<span className="k">pod_id</span>: <span className="s">"pod-..."</span>{' }'})
   <span className="c">{'// → { status: "running", access_url: "https://api.dcp.sa:.../?token=...",'}</span>
   <span className="c">{'//     ssh_command: "ssh ...", seconds_remaining: 1800 }'}</span>

<span className="c"># 3 · Stop early when done — unused minutes are refunded</span>
stop_pod({'{ '}<span className="k">pod_id</span>: <span className="s">"pod-..."</span>{' }'})
   <span className="c">{'// → { status: "stopped", refunded_sar: ... }'}</span></pre>
          <div className="callout">
            <div className="t"><Bi en="Discovery" ar="الاكتشاف" /></div>
            <p>
              <Bi
                en="Agents can also self-discover DCP without MCP: read "
                ar="يمكن للوكلاء أيضاً اكتشاف DCP ذاتياً دون MCP: اقرأ "
              />
              <code>/llms.txt</code>
              <Bi en=" and " ar=" و" />
              <code>/.well-known/ai-plugin.json</code>
              <Bi en=" at dcp.sa, plus the OpenAPI spec at " ar=" على dcp.sa، إضافةً إلى مواصفات OpenAPI على " />
              <code>/docs/openapi.yaml</code>
              <Bi en=". The inference API is a drop-in OpenAI replacement at the base URL above." ar=". واجهة الاستدلال بديل مباشر لـ OpenAI على عنوان القاعدة أعلاه." />
            </p>
          </div>
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
          <a href="#mcp-install"><Bi en="Install (MCP)" ar="التثبيت (MCP)" /></a>
          <a href="#mcp-tools"><Bi en="MCP tools" ar="أدوات MCP" /></a>
          <a href="#mcp-rent-gpu"><Bi en="Agent rents a GPU" ar="وكيل يستأجر معالجاً" /></a>
        </aside>

      </div>
    </>
  )
}
