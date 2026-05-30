'use client'

// v2 Docs — ported from prototypes/docs/Docs.html.
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
        <div className="search">
          <input type="search" placeholder={lang === 'ar' ? 'ابحث في التوثيق…  /' : 'Search the docs…  /'} />
        </div>
        <div className="links">
          <Link href="/v2/home"><Bi en="Home" ar="الرئيسية" /></Link>
          <Link href="/v2/auth"><Bi en="Console" ar="لوحة التحكم" /></Link>
          <a href="#"><Bi en="API status" ar="حالة الواجهة" /></a>
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
          <a href="#" className="on"><Bi en="Introduction" ar="مقدمة" /></a>
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
          <div className="sec"><Bi en="SDKs" ar="حِزم التطوير" /></div>
          <a href="#"><Bi en="Python" ar="بايثون" /></a>
          <a href="#"><Bi en="Node.js" ar="Node.js" /></a>
          <a href="#"><Bi en="cURL / REST" ar="cURL / REST" /></a>
        </nav>

        {/* Content */}
        <main className="dx-main">
          <span className="dx-eyebrow">§ <Bi en="Get started" ar="ابدأ هنا" /></span>
          <h1><Bi en="The DCP API." ar="واجهة DCP." /></h1>
          <p className="lead">
            <Bi
              en="One OpenAI-compatible endpoint, served from inside the Kingdom. If you’ve used the OpenAI SDK, you already know how to use DCP — change the base URL and the key, and you’re running Arabic-first inference on KSA-resident hardware, billed per token in Riyal."
              ar="نقطة نهاية واحدة متوافقة مع OpenAI، تُقدَّم من داخل المملكة. إن كنت قد استخدمت حزمة OpenAI، فأنت تعرف كيف تستخدم DCP — غيّر عنوان القاعدة والمفتاح، وستشغّل استدلالاً عربياً أولاً على عتاد مقيم بالسعودية، يُحسب لكل رمز بالريال."
            />
          </p>

          <div className="callout">
            <div className="t"><Bi en="Base URL" ar="عنوان القاعدة" /></div>
            <p>
              <code>https://api.dcp.sa/v1</code>{' '}
              <Bi
                en="— drop-in compatible with the OpenAI chat, embeddings, and rerank routes."
                ar="— متوافق مباشرة مع مسارات المحادثة والتضمينات وإعادة الترتيب في OpenAI."
              />
            </p>
          </div>

          <h2 id="quickstart"><Bi en="Quickstart" ar="بداية سريعة" /></h2>
          <p>
            <Bi
              en="Install the OpenAI SDK you already use, point it at DCP, and make your first call. Every request is billed per token against your wallet balance; new accounts start with SAR 20 of free credit."
              ar="ثبّت حزمة OpenAI التي تستخدمها، وجّهها إلى DCP، وأجرِ أول طلب لك. يُحسب كل طلب لكل رمز من رصيد محفظتك؛ تبدأ الحسابات الجديدة برصيد مجاني قدره ٢٠ ريالاً."
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
     "model": "allam-7b",
     "messages": [{"role": "user", "content": "اشرح لي زكاة المال"}]
   }'`}</span></pre>
          </div>

          <div className={qsTab === 'py' ? 'code-pane on' : 'code-pane'} data-t="py">
            <pre className="code"><span className="k">from</span> openai <span className="k">import</span> OpenAI

client = <span className="n">OpenAI</span>(
    base_url=<span className="s">{'"https://api.dcp.sa/v1"'}</span>,
    api_key=<span className="s">{'"sk_live_..."'}</span>,
)

resp = client.chat.completions.create(
    model=<span className="s">{'"allam-7b"'}</span>,
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
  model: <span className="s">{'"allam-7b"'}</span>,
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
          <pre className="code"><span className="k">Authorization:</span> Bearer sk_live_8f3a…c721</pre>

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
              <Bi en="Monthly ZATCA invoices are issued automatically under " ar="تُصدَر فواتير زاتكا الشهرية تلقائياً ضمن " />
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
                  <code>allam-7b</code>
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
            <code>POST /v1/embeddings</code>
            <Bi
              en=" — turn text into vectors for search and retrieval. Strong on mixed Arabic/English corpora."
              ar=" — حوّل النص إلى متجهات للبحث والاسترجاع. قوي على المتون المختلطة عربي/إنجليزي."
            />
          </p>
          <pre className="code">$ <span className="k">curl</span> <span className="s">https://api.dcp.sa/v1/embeddings</span> \
   <span className="k">-H</span> <span className="s">{'"Authorization: Bearer $DCP_KEY"'}</span> \
   <span className="k">-d</span> <span className="s">{`'{"model": "bge-m3", "input": "نص للفهرسة"}'`}</span></pre>

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
              en="By default, your prompts, completions, and embeddings never leave the Kingdom. Frontier (cross-border) models stay disabled until you turn them on per workspace — and when you do, every such request is marked so you always know where your data went."
              ar="افتراضياً، لا تغادر مطالباتك وإكمالاتك وتضميناتك المملكة أبداً. تبقى النماذج الحدودية (العابرة للحدود) معطّلة حتى تشغّلها لكل مساحة عمل — وعند ذلك، يُعلَّم كل طلب من هذا النوع لتعرف دائماً أين ذهبت بياناتك."
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
          <a href="#arabic"><Bi en="Working in Arabic" ar="العمل بالعربية" /></a>
          <a href="#residency"><Bi en="Data residency" ar="إقامة البيانات" /></a>
        </aside>

      </div>
    </>
  )
}
