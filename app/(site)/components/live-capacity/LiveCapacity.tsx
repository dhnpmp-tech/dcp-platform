'use client'

// LiveCapacity — the honest "what's serving right now" island: a demand bar
// fed by /api/health/detailed and a served-model table fed by /v1/models.
// Honest by design: shows whatever is true now (including 0), never simulated.
// Extracted from the old home god-component; lives on /marketplace.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bi, useV2 } from '../../lib/i18n'
import { fmtMpPrice, type MpModel } from '../../(home)/home-data'

interface LiveShape {
  online: number
  serving: number
  catalog: number
}

export function LiveCapacity() {
  const { lang } = useV2()
  const [live, setLive] = useState<LiveShape | null>(null)
  const [catalog, setCatalog] = useState<MpModel[] | null>(null)

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
          catalog: Number(d?.models?.catalog_count ?? 0),
        })
      } catch {
        /* offline — keep prior state, no fabricated numbers */
      }
      try {
        const mres = await fetch('/v1/models', { cache: 'no-store' })
        if (!mres.ok) return
        const md = await mres.json()
        if (alive && Array.isArray(md?.data)) setCatalog(md.data as MpModel[])
      } catch {
        /* offline — keep prior state, no fabricated numbers */
      }
    }
    load()
    const id = window.setInterval(load, 60_000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [])

  const served = (catalog ?? []).filter((m) => m.available)

  return (
    <>
      <div className="demand-v2">
        <div className="left">
          <div className="demand-label">
            <span>
              <Bi
                en="Capacity is published only after live provider verification"
                ar="تُنشر السعة فقط بعد تحقق حي من المزوّد"
              />
            </span>
            <b>
              <Bi en="No simulated telemetry" ar="لا توجد قياسات مصطنعة" />
            </b>
          </div>
          <div
            className="demand-bar"
            aria-label={
              lang === 'ar'
                ? 'لا توجد سعة منشورة حتى يجتاز مزوّد حي فحوصات التحقق'
                : 'No published capacity until a live provider passes verification'
            }
          >
            <span
              id="verified-capacity-bar"
              style={{
                transform: `scaleX(${live ? Math.min(1, live.serving / Math.max(live.online, 1)) : 0})`,
                transformOrigin: 'left',
                transition: 'transform .6s cubic-bezier(.16,1,.3,1)',
              }}
            />
          </div>
        </div>
        <div className="right">
          <span>
            <Bi en="Live availability" ar="التوفر الحي" />
          </span>
          <br />
          <b>
            {live ? (
              <Bi en="Verified live" ar="متحقق حياً" />
            ) : (
              <Bi en="Gated by /status" ar="محكوم عبر /status" />
            )}
          </b>
        </div>
      </div>

      <div className="mp-live">
        <div className="mp-live-head">
          <span>
            <Bi en="Serving right now — live from /v1/models" ar="يُخدم الآن — مباشرة من الكتالوج" />
          </span>
          <span>
            {catalog ? (
              lang === 'ar' ? (
                `${served.length} متاح من ${catalog.length} في الكتالوج`
              ) : (
                `${served.length} available of ${catalog.length} catalog models`
              )
            ) : (
              <Bi en="querying…" ar="جارٍ الاستعلام…" />
            )}
          </span>
        </div>
        {served.length > 0 ? (
          <div className="mp-rows">
            <div className="mp-row mp-row-head" aria-hidden="true">
              <span>
                <Bi en="Model" ar="النموذج" />
              </span>
              <span>
                <Bi en="Context" ar="السياق" />
              </span>
              <span>
                <Bi en="Quant" ar="التكميم" />
              </span>
              <span>
                <Bi en="SAR / 1M tokens" ar="ريال / مليون رمز" />
              </span>
            </div>
            {served.slice(0, 8).map((m) => (
              <div className="mp-row" key={m.id}>
                <span className="mp-model">
                  <b>{m.name || m.id}</b>
                  <i dir="ltr">{m.id}</i>
                </span>
                <span>{m.context_length ? `${Math.round(m.context_length / 1024)}K` : '—'}</span>
                <span>{m.quantization || '—'}</span>
                <span>{fmtMpPrice(m)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="mp-empty">
            <span>
              <Bi
                en="No verified capacity is serving right now, so nothing is listed. That is the honest state — not an error."
                ar="لا توجد سعة متحققة تعمل الآن، لذلك لا يُعرض شيء. هذه هي الحالة الصادقة — وليست خطأ."
              />
            </span>
            <Link href="/status">
              <Bi en="Watch live status →" ar="تابع الحالة الحية ←" />
            </Link>
          </div>
        )}
      </div>
    </>
  )
}