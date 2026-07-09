'use client'

// GPU Pods product page — replaces the static public/gpu-containers.html one-pager.
// Reuses the home design system (home.css) + docs chrome (docs.css); no new CSS.

import { useEffect, useState } from 'react'
import SiteHeader from '@/app/(site)/components/chrome/SiteHeader'
import Link from 'next/link'
import { Bi, BiX, useV2 } from '@/app/(site)/lib/i18n'
import { EggWord } from '@/app/(site)/components/boot-egg/EggWord'
import GpuAvailability from '@/app/(site)/components/gpu-availability/GpuAvailability'
import '../(home)/home.css'
import '../docs/docs.css'

type ReadinessStatus = 'idle' | 'loading' | 'ready' | 'error'

interface PodImageReadinessResponse {
  object?: string
  version?: string
  current_mode?: string
  contract_check?: {
    status?: string
    command?: string
    local_roadmap_gate?: string
    image_count?: number
  }
  lora_image?: {
    alias?: string
    tag?: string
    required_packages?: string[]
    required_smoke_modules?: string[]
  } | null
  provider_host_acceptance?: {
    status?: string
    command?: string
    live_acceptance_gate?: string
    blocked_on?: string[]
  }
  build_plan?: {
    build_command?: string
    repo_verify_command?: string
  }
  claim_guards?: {
    claims_lora_pod_image_gpu_ready?: boolean
    claims_fine_tuning_ready_pods?: boolean
    launches_pod?: boolean
    mutates_balance?: boolean
    changes_billing?: boolean
  }
}

interface PodTrialRoutingReadinessResponse {
  object?: string
  version?: string
  current_mode?: string
  account_classification?: {
    explicit_trial_account_tag_live?: boolean
    trial_credit_source?: string
  }
  routing_policy?: {
    trial_capacity_copy?: string
    high_demand_capacity_copy?: string
    provider_visibility?: {
      exposes_provider_id_to_renter?: boolean
      exposes_vendor_to_renter?: boolean
      exposes_supply_tier_to_renter?: boolean
      renter_selects_gpu_type_not_machine?: boolean
    }
  }
  infrastructure_proofs?: {
    workspace_pod_contract?: {
      status?: string
      command?: string
    }
    workspace_live_acceptance?: {
      status?: string
      command?: string
      blocked_on?: string[]
    }
    lora_pod_image_provider_host?: {
      status?: string
      command?: string
      blocked_on?: string[]
    }
  }
  claim_guards?: {
    changes_provider_selection?: boolean
    changes_billing?: boolean
    changes_trial_accounting?: boolean
    launches_pod?: boolean
    mutates_balance?: boolean
    exposes_vendor_or_provider?: boolean
    claims_workspace_live_acceptance?: boolean
    claims_lora_pod_image_gpu_ready?: boolean
    claims_fine_tuning_ready_pods?: boolean
  }
}

export default function ContainersPage() {
  const { toggle, lang } = useV2()
  const [live, setLive] = useState<{ online: number; serving: number } | null>(null)
  const [podReadinessStatus, setPodReadinessStatus] = useState<ReadinessStatus>('idle')
  const [podImageReadiness, setPodImageReadiness] = useState<PodImageReadinessResponse | null>(null)
  const [podTrialRouting, setPodTrialRouting] = useState<PodTrialRoutingReadinessResponse | null>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch('/api/health/detailed', { cache: 'no-store' })
        if (!res.ok) return
        const d = await res.json()
        if (!alive) return
        setLive({
          online: Number(d?.providers?.online ?? 0),
          serving: Number(d?.providers?.serving ?? 0),
        })
      } catch { /* offline — show nothing fabricated */ }
    }
    load()
    const id = window.setInterval(load, 60_000)
    return () => { alive = false; window.clearInterval(id) }
  }, [])

  useEffect(() => {
    let alive = true

    const load = async () => {
      setPodReadinessStatus('loading')
      try {
        const [imageRes, trialRes] = await Promise.all([
          fetch('/api/pods/images/readiness', { cache: 'no-store' }),
          fetch('/api/pods/trial-routing/readiness', { cache: 'no-store' }),
        ])
        if (!alive) return

        if (imageRes.ok) {
          setPodImageReadiness(await imageRes.json())
        }
        if (trialRes.ok) {
          setPodTrialRouting(await trialRes.json())
        }
        setPodReadinessStatus(imageRes.ok || trialRes.ok ? 'ready' : 'error')
      } catch {
        if (alive) setPodReadinessStatus('error')
      }
    }

    load()
    return () => { alive = false }
  }, [])

  const imageContractStatus = podImageReadiness?.contract_check?.status || 'checking'
  const imageCount = podImageReadiness?.contract_check?.image_count || 0
  const loraImageTag = podImageReadiness?.lora_image?.tag || 'dcp-compute:lora'
  const loraImageCommand = podImageReadiness?.provider_host_acceptance?.command || 'npm run proof:lora-pod-image'
  const loraImageStatus = podImageReadiness?.provider_host_acceptance?.status || 'blocked_external'
  const workspaceContractStatus = podTrialRouting?.infrastructure_proofs?.workspace_pod_contract?.status || 'checking'
  const workspaceLiveCommand = podTrialRouting?.infrastructure_proofs?.workspace_live_acceptance?.command || 'DCP_WORKSPACE_POD_ALLOW_LAUNCH=1 npm run proof:workspace-pod'
  const workspaceLiveStatus = podTrialRouting?.infrastructure_proofs?.workspace_live_acceptance?.status || 'blocked_external'
  const explicitTrialTagLive = podTrialRouting?.account_classification?.explicit_trial_account_tag_live === true
  const trialAccountCopy = explicitTrialTagLive
    ? 'Trial-account tag live'
    : 'Trial accounts use grant-credit provenance'
  const trialCapacityCopy = podTrialRouting?.routing_policy?.trial_capacity_copy || 'Trial credit covers DCP/community capacity.'
  const highDemandCapacityCopy = podTrialRouting?.routing_policy?.high_demand_capacity_copy || 'High-demand capacity requires paid credit.'
  const noProviderExposure = podTrialRouting?.routing_policy?.provider_visibility?.exposes_provider_id_to_renter === false &&
    podTrialRouting?.routing_policy?.provider_visibility?.exposes_vendor_to_renter === false &&
    podTrialRouting?.routing_policy?.provider_visibility?.exposes_supply_tier_to_renter === false
  const podClaimGuardsSynced = podImageReadiness?.claim_guards?.claims_lora_pod_image_gpu_ready === false &&
    podImageReadiness?.claim_guards?.claims_fine_tuning_ready_pods === false &&
    podImageReadiness?.claim_guards?.launches_pod === false &&
    podImageReadiness?.claim_guards?.mutates_balance === false &&
    podTrialRouting?.claim_guards?.claims_workspace_live_acceptance === false &&
    podTrialRouting?.claim_guards?.changes_trial_accounting === false &&
    podTrialRouting?.claim_guards?.exposes_vendor_or_provider === false

  return (
    <>
      <SiteHeader active="/pods" />

      {/* ─── Hero ─── */}
      <section className="hero" style={{ borderTop: 0, padding: 0 }}>
        <div className="hero-bg hero-bg--photo" aria-hidden="true">
          <img src="/home/pods.webp" alt="" width={1600} height={894} decoding="async" />
        </div>
        <div className="wrap" style={{ paddingTop: 72, paddingBottom: 8 }}>
          <div className="section-meta">
            <span className="idx"><Bi en="Raw compute · interactive GPU pods" ar="حوسبة خام · حاويات GPU تفاعلية" /></span>
            <span>
              {live
                ? <Bi en="Verified capacity, live" ar="سعة متحققة، حياً" />
                : <Bi en="Live capacity on /status" ar="السعة الحية في /status" />}
            </span>
          </div>
          <h1 style={{ fontFamily: 'var(--serif, "Instrument Serif", serif)', fontWeight: 400, fontSize: 'clamp(2.4rem, 1.2rem + 4vw, 4.4rem)', lineHeight: 1.05, maxWidth: 900, margin: '18px 0 18px' }}>
            <BiX
              en={<>A whole Saudi <EggWord>GPU</EggWord>. Yours in about a minute.</>}
              ar={<>‏<EggWord>معالج</EggWord> سعودي كامل. لك خلال دقيقة تقريباً.</>}
            />
          </h1>
          <p style={{ maxWidth: 640, fontSize: 16, lineHeight: 1.65, color: 'var(--mut)' }}>
            <Bi
              en="Pick an image, get Jupyter in your browser and root SSH on a dedicated GPU — train, fine-tune, or serve, then tear it down. No queue, no commitment, data in the Kingdom."
              ar="اختر صورة، واحصل على Jupyter في متصفحك و SSH جذري على معالج مخصص — درّب أو خصّص أو شغّل، ثم أوقفها. لا طابور، لا التزام، والبيانات داخل المملكة."
            />
          </p>
          <div style={{ marginTop: 26, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link className="btn" href="/renter/pods"><Bi en="Launch a pod →" ar="شغّل حاوية ←" /></Link>
            <Link className="btn ghost" href="/status"><Bi en="See live capacity" ar="شاهد السعة الحية" /></Link>
          </div>
        </div>
      </section>

      {/* ─── GPU types available to rent ─── */}
      <section id="availability">
        <div className="wrap" style={{ paddingTop: 8 }}>
          <div className="section-meta">
            <span className="idx"><Bi en="Available to rent · whole GPUs" ar="متاح للإيجار · معالجات كاملة" /></span>
            <span><Bi en="Type + VRAM · spun up on click" ar="النوع + الذاكرة · تُشغَّل عند النقر" /></span>
          </div>
          <GpuAvailability variant="marketplace" />
        </div>
      </section>

      {/* ─── § 00 Readiness gates ─── */}
      <section id="readiness">
        <div className="wrap">
          <div className="section-meta">
            <span className="idx"><Bi en="§ 00 · Proof-backed readiness" ar="§ ٠٠ · جاهزية مدعومة بالإثبات" /></span>
            <span>
              {podReadinessStatus === 'ready'
                ? <Bi en="Live contracts · public read-only" ar="عقود حية · قراءة عامة فقط" />
                : podReadinessStatus === 'loading'
                  ? <Bi en="Checking pod readiness…" ar="جارٍ فحص جاهزية الحاويات…" />
                  : <Bi en="Readiness falls back to guarded copy" ar="الجاهزية تعود إلى نص محمي" />}
            </span>
          </div>
          <div className="capacity-truth" aria-label={lang === 'ar' ? 'جاهزية الحاويات العامة' : 'Public pod readiness'}>
            <div className="capacity-copy">
              <span className="truth-label"><Bi en="What is ready vs coming next" ar="ما هو جاهز وما القادم" /></span>
              <h3>
                <Bi
                  en="Pod images and trial routing are contract-backed. LoRA GPU-host acceptance is still coming next."
                  ar="صور الحاويات ومسار التجربة مدعومان بعقود. قبول LoRA على مضيف GPU لا يزال قادماً."
                />
              </h3>
              <p>
                <Bi
                  en={`${podImageReadiness?.version || 'dcp.pod_image_readiness.v1'} and ${podTrialRouting?.version || 'dcp.pod_trial_routing_readiness.v1'} are public read-only readiness packets. They do not launch pods, mutate billing, change trial accounting, expose provider identity, or claim fine-tuning-ready pod images before provider-host proof.`}
                  ar="عقود الجاهزية العامة للقراءة فقط. لا تشغّل حاويات ولا تغيّر الفوترة أو حسابات التجربة ولا تكشف هوية المزوّد ولا تدّعي جاهزية صور الضبط قبل إثبات مضيف GPU."
                />
              </p>
              <div className="callout" style={{ marginTop: 18 }}>
                <p>
                  <Bi
                    en="API sources: GET /api/pods/images/readiness and GET /api/pods/trial-routing/readiness."
                    ar="مصادر الواجهة: GET /api/pods/images/readiness و GET /api/pods/trial-routing/readiness."
                  />
                </p>
              </div>
            </div>
            <div className="capacity-gates">
              <div className="capacity-gate">
                <span className="gate-n">01</span>
                <span className="gate-k">image_contract</span>
                <p>
                  <Bi
                    en={`${imageContractStatus === 'ci_safe' ? 'CI-safe' : imageContractStatus} pod image contract${imageCount ? ` · ${imageCount} aliases` : ''}. ${podImageReadiness?.contract_check?.command || 'npm run pod-images:verify-contracts'}.`}
                    ar="عقد صور الحاويات آمن في CI ويُفحص بأمر المستودع."
                  />
                </p>
              </div>
              <div className="capacity-gate">
                <span className="gate-n">02</span>
                <span className="gate-k">lora_image_coming_next</span>
                <p>
                  <Bi
                    en={`${loraImageTag}: ${loraImageStatus}. Coming next: run ${loraImageCommand} on a provider GPU host before claiming fine-tuning-ready pods.`}
                    ar="صورة LoRA تنتظر إثبات مضيف GPU قبل ادعاء جاهزية حاويات الضبط."
                  />
                </p>
              </div>
              <div className="capacity-gate">
                <span className="gate-n">03</span>
                <span className="gate-k">workspace_live_gate</span>
                <p>
                  <Bi
                    en={`Workspace contract: ${workspaceContractStatus}. Live file visibility: ${workspaceLiveStatus}; ${workspaceLiveCommand}.`}
                    ar="عقد مساحة العمل جاهز في CI؛ إثبات الملفات الحي ينتظر نافذة GPU ممولة."
                  />
                </p>
              </div>
              <div className="capacity-gate">
                <span className="gate-n">04</span>
                <span className="gate-k">trial_and_paid_credit</span>
                <p>
                  <Bi
                    en={`${trialAccountCopy}. ${trialCapacityCopy} ${highDemandCapacityCopy}`}
                    ar="حسابات التجربة تعتمد على مصدر رصيد المنحة؛ السعة عالية الطلب تحتاج رصيداً مدفوعاً."
                  />
                </p>
              </div>
              <div className="capacity-gate">
                <span className="gate-n">05</span>
                <span className="gate-k">claim_guards</span>
                <p>
                  <Bi
                    en={`${podClaimGuardsSynced ? 'False-claim guards synced' : 'False-claim guards checking'} · ${noProviderExposure ? 'no provider identity exposed' : 'provider visibility checking'}.`}
                    ar="حراس الادعاءات متزامنون ولا تُعرض هوية المزوّد للمستأجر."
                  />
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── § 01 The 60-second path ─── */}
      <section id="quickstart">
        <div className="wrap">
          <div className="section-meta">
            <span className="idx"><Bi en="§ 01 · The 60-second path" ar="§ ٠١ · مسار الستين ثانية" /></span>
            <span><Bi en="CLI · API · web console — same rails" ar="سطر الأوامر · الواجهة · الموقع — نفس المسار" /></span>
          </div>
          <div className="capacity-truth">
            <div className="capacity-copy">
              <span className="truth-label"><Bi en="From your terminal" ar="من سطر الأوامر" /></span>
              <h3><Bi en="Three commands. No account manager, no sales call." ar="ثلاثة أوامر. بلا مدير حساب وبلا مكالمة مبيعات." /></h3>
              <pre className="code" dir="ltr" style={{ marginTop: 18 }}>{`# install the dc1 SDK + CLI
curl -sL https://api.dcp.sa/installers/dc1-sdk.tar.gz | tar xz && cd dc1-sdk && ./install.sh

# launch: dedicated GPU, PyTorch image, 2 hours
dcp pod create --image pytorch --duration 120

#   → access_url:  https://api.dcp.sa:41xxx/?token=…   (Jupyter, TLS)
#   → ssh_command: ssh -p 42xxx root@api.dcp.sa`}</pre>
              <p style={{ marginTop: 16 }}>
                <Bi
                  en="Prefer clicking? The web console launches the same pod. Prefer raw HTTP? POST /api/pods with your renter key. All three paths hit the same verified scheduler."
                  ar="تفضّل النقر؟ لوحة التحكم تشغّل الحاوية نفسها. تفضّل HTTP مباشرة؟ أرسل POST /api/pods بمفتاحك. المسارات الثلاثة تمر عبر نفس المجدول المتحقق."
                />
              </p>
            </div>
            <div className="capacity-gates" aria-label="How a pod boots">
              <div className="capacity-gate">
                <span className="gate-n">01</span>
                <span className="gate-k">choose_image</span>
                <p><Bi en="PyTorch, vLLM, CUDA, Ubuntu — or any public Docker image. Unknown images get SSH bootstrapped automatically." ar="PyTorch أو vLLM أو CUDA أو Ubuntu — أو أي صورة Docker عامة. الصور غير المعروفة تُجهَّز بـ SSH تلقائياً." /></p>
              </div>
              <div className="capacity-gate">
                <span className="gate-n">02</span>
                <span className="gate-k">verified_machine_boots</span>
                <p><Bi en="The scheduler only considers providers that just passed live Docker, CUDA, and GPU-health probes." ar="المجدول لا يفكر إلا في مزوّدين اجتازوا للتو فحوصات حية لـ Docker و CUDA وصحة المعالج." /></p>
              </div>
              <div className="capacity-gate">
                <span className="gate-n">03</span>
                <span className="gate-k">jupyter_tls + root_ssh</span>
                <p><Bi en="Your access URL and SSH command arrive in about a minute. One-time credentials, shown once, stored nowhere." ar="يصلك رابط الوصول وأمر SSH خلال دقيقة تقريباً. بيانات دخول لمرة واحدة، تُعرض مرة، ولا تُخزَّن في أي مكان." /></p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── § 02 Why DCP pods ─── */}
      <section id="why">
        <div className="wrap">
          <div className="section-meta">
            <span className="idx"><Bi en="§ 02 · Why rent here" ar="§ ٠٢ · لماذا تستأجر هنا" /></span>
            <span><Bi en="What you actually get" ar="ما تحصل عليه فعلاً" /></span>
          </div>
          <div className="mg-grid">
            <div className="mg">
              <span className="org">zero_setup · ≤ 60s</span>
              <h4 className="nm"><Bi en="From idea to training in a minute" ar="من الفكرة إلى التدريب خلال دقيقة" /></h4>
              <p><Bi
                en="Open Jupyter in the browser or SSH straight in. Nothing to install, no ticket queue, no GPU waitlist — the machine is already provisioned, probed, and waiting."
                ar="افتح Jupyter في المتصفح أو ادخل مباشرة عبر SSH. لا شيء للتثبيت ولا طابور تذاكر ولا قائمة انتظار — الجهاز مجهّز ومفحوص وينتظر."
              /></p>
            </div>
            <div className="mg">
              <span className="org">--gpus all · pinned driver</span>
              <h4 className="nm"><Bi en="The whole card is yours" ar="البطاقة كلها لك" /></h4>
              <p><Bi
                en="No sharing, no throttling, no noisy neighbors. Benchmarks run at bare-metal speed and reproduce tomorrow — we freeze driver updates mid-rental so the ground doesn't move under you."
                ar="لا مشاركة ولا تقييد ولا جيران مزعجين. تعمل اختباراتك بسرعة المعدن الخام وتتكرر نتائجها غداً — نجمّد تحديثات التعريف أثناء الإيجار حتى لا تتحرك الأرض من تحتك."
              /></p>
            </div>
            <div className="mg">
              <span className="org">hard deadline · restart-proof reaper</span>
              <h4 className="nm"><Bi en="It ends when you said it ends" ar="ينتهي عندما قلت إنه ينتهي" /></h4>
              <p><Bi
                en="The host machine itself enforces your rental's deadline — even across crashes and reboots. A forgotten pod can never squat a GPU or surprise you later."
                ar="الجهاز المضيف نفسه يفرض موعد نهاية الإيجار — حتى عبر الأعطال وإعادة التشغيل. لا يمكن لحاوية منسية أن تحتل معالجاً أو تفاجئك لاحقاً."
              /></p>
            </div>
            <div className="mg">
              <span className="org">wireguard mesh · nvml gates</span>
              <h4 className="nm"><Bi en="Verified Saudi machines only" ar="أجهزة سعودية متحققة فقط" /></h4>
              <p><Bi
                en="Pods land exclusively on hardware that just passed live health probes — the same earned-online discipline behind our inference catalog. Your data stays in the Kingdom."
                ar="تهبط الحاويات حصرياً على عتاد اجتاز للتو فحوصات صحية حية — نفس انضباط «الاتصال المُكتسب» وراء كتالوج الاستدلال. بياناتك تبقى داخل المملكة."
              /></p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── § 03 What runs well ─── */}
      <section id="workloads">
        <div className="wrap">
          <div className="section-meta">
            <span className="idx"><Bi en="§ 03 · What runs well on 24 GB" ar="§ ٠٣ · ما يعمل جيداً على ٢٤ جيجابايت" /></span>
            <span><Bi en="Consumer GPUs, honestly framed" ar="معالجات استهلاكية، بصراحة" /></span>
          </div>
          <div className="mg-grid">
            <div className="mg">
              <span className="org">unsloth · lora · qlora</span>
              <h4 className="nm"><Bi en="Fine-tuning 7–13B models" ar="تخصيص نماذج ٧–١٣ مليار" /></h4>
              <p><Bi en="LoRA and QLoRA runs on RTX-class cards are the sweet spot — hours, not days, at a fraction of hyperscaler cost." ar="تخصيص LoRA و QLoRA على بطاقات RTX هو الاستخدام الأمثل — ساعات لا أيام، وبجزء من تكلفة السحابات الكبرى." /></p>
            </div>
            <div className="mg">
              <span className="org">pytorch · cuda 12 · shm tuned</span>
              <h4 className="nm"><Bi en="Research & experiments" ar="البحث والتجارب" /></h4>
              <p><Bi en="A real CUDA box you fully control — profile kernels, pin versions, break things, reset in seconds." ar="جهاز CUDA حقيقي تتحكم به بالكامل — حلّل الأداء وثبّت الإصدارات وجرّب بحرية، وأعد الضبط خلال ثوانٍ." /></p>
            </div>
            <div className="mg">
              <span className="org">vllm · llama.cpp · ollama</span>
              <h4 className="nm"><Bi en="Private model serving" ar="تشغيل نماذج خاصة" /></h4>
              <p><Bi en="Serve your own checkpoint behind your own endpoint — quantized 7–32B models run well on a dedicated 24 GB card." ar="شغّل نموذجك الخاص خلف واجهتك الخاصة — النماذج المكممة من ٧ إلى ٣٢ مليار تعمل جيداً على بطاقة ٢٤ جيجابايت مخصصة." /></p>
            </div>
            <div className="mg">
              <span className="org">any public docker ref</span>
              <h4 className="nm"><Bi en="Anything Docker runs" ar="كل ما يعمل على Docker" /></h4>
              <p><Bi en="Rendering, scientific compute, CI with GPU tests — if it's a container that wants a GPU, it boots here." ar="معالجة الرسوميات والحوسبة العلمية واختبارات CI على المعالج — إن كانت حاوية تحتاج معالجاً، فهي تعمل هنا." /></p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── § 04 Honest engineering ─── */}
      <section id="honesty">
        <div className="wrap">
          <div className="section-meta">
            <span className="idx"><Bi en="§ 04 · Honest engineering" ar="§ ٠٤ · هندسة صادقة" /></span>
            <span><Bi en="What we promise — and what we don't, yet" ar="ما نعد به — وما لا نعد به بعد" /></span>
          </div>
          <div className="capacity-truth">
            <div className="capacity-copy">
              <span className="truth-label"><Bi en="Promised today" ar="مضمون اليوم" /></span>
              <h3><Bi en="Every claim on this page is enforced by code you can audit." ar="كل ادعاء في هذه الصفحة يفرضه كود يمكنك تدقيقه." /></h3>
              <p><Bi
                en="Health-gated scheduling, TLS on the Jupyter relay, deadline enforcement on the host, server-measured usage, one-time credentials. Capacity numbers on this site come from live probes — never from static copy."
                ar="جدولة محكومة بفحوصات الصحة، TLS على وسيط Jupyter، فرض المواعيد على المضيف، قياس الاستخدام على الخادم، بيانات دخول لمرة واحدة. أرقام السعة في هذا الموقع تأتي من فحوصات حية — لا من نص ثابت أبداً."
              /></p>
            </div>
            <div className="capacity-gates" aria-label="Not promised yet">
              <div className="capacity-gate">
                <span className="gate-n">!1</span>
                <span className="gate-k">host_pinned</span>
                <p><Bi en="Pods live and die with their host machine. There is no live migration or cross-host failover — checkpoint your work." ar="تعيش الحاوية وتموت مع جهازها المضيف. لا يوجد ترحيل مباشر أو تحويل بين الأجهزة — احفظ نقاط تقدمك." /></p>
              </div>
              <div className="capacity-gate">
                <span className="gate-n">!2</span>
                <span className="gate-k">container_isolation</span>
                <p><Bi en="Isolation is hardened Docker today; VM-grade sandboxing (gVisor) is on the roadmap before general availability." ar="العزل اليوم عبر Docker مُحصَّن؛ والعزل بمستوى الأجهزة الافتراضية (gVisor) على الخارطة قبل الإتاحة العامة." /></p>
              </div>
              <div className="capacity-gate">
                <span className="gate-n">!3</span>
                <span className="gate-k">small_verified_fleet</span>
                <p><Bi en="The mesh is young. Capacity is small and stated honestly — check /status before planning a large run." ar="الشبكة فتية. السعة صغيرة ومعلنة بصدق — راجع /status قبل التخطيط لتشغيل كبير." /></p>
              </div>
            </div>
          </div>

          <div className="callout" style={{ marginTop: 32 }}>
            {lang === 'ar' ? (
              <>
                <b>جاهز؟</b> شغّل حاويتك الأولى من لوحة التحكم، أو ابدأ بقراءة التوثيق. وإن كان لديك معالج خامل — مسار المزوّد يدفع لك مقابل وقته.
              </>
            ) : (
              <>
                <b>Ready?</b> Launch your first pod from the console, or start with the docs. And if you have an idle GPU — the provider path pays you for its time.
              </>
            )}
          </div>
          <div className="mp-foot">
            <span><Bi en="Questions about the rails? The renter docs cover pods, keys, and billing." ar="أسئلة عن البنية؟ توثيق المستأجر يغطي الحاويات والمفاتيح والفوترة." /></span>
            <Link href="/docs"><Bi en="Read the docs →" ar="اقرأ التوثيق ←" /></Link>
          </div>
        </div>
      </section>
    </>
  )
}
