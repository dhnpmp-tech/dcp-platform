'use client'

// CodeReceipt — mounts once on a docs-style page and gives every <pre>
// a copy button. The toast is a billing joke that is also true:
// "copied · 0.0000 SAR". Progressive enhancement: no <pre>, no buttons.

import { useEffect } from 'react'
import './code-receipt.css'

const COPIED_LABEL = 'copied · 0.0000 SAR'
const IDLE_LABEL = 'copy'

export function CodeReceipt({ scope = 'main' }: { scope?: string }) {
  useEffect(() => {
    const root: Element | Document = document.querySelector(scope) ?? document
    const pres = Array.from(root.querySelectorAll('pre')).filter(
      (pre) => !pre.querySelector('.code-receipt-btn') && (pre.textContent || '').trim().length > 0,
    )
    const cleanups: Array<() => void> = []
    for (const pre of pres) {
      pre.classList.add('code-receipt-host')
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'code-receipt-btn'
      btn.textContent = IDLE_LABEL
      let timer = 0
      const onClick = async () => {
        try {
          await navigator.clipboard.writeText((pre.textContent || '').replace(COPIED_LABEL, '').replace(IDLE_LABEL, '').trim())
          btn.textContent = COPIED_LABEL
          btn.classList.add('done')
          window.clearTimeout(timer)
          timer = window.setTimeout(() => {
            btn.textContent = IDLE_LABEL
            btn.classList.remove('done')
          }, 1800)
        } catch {
          btn.textContent = 'copy failed'
        }
      }
      btn.addEventListener('click', onClick)
      pre.appendChild(btn)
      cleanups.push(() => {
        window.clearTimeout(timer)
        btn.removeEventListener('click', onClick)
        btn.remove()
        pre.classList.remove('code-receipt-host')
      })
    }
    return () => cleanups.forEach((fn) => fn())
  }, [scope])

  return null
}
