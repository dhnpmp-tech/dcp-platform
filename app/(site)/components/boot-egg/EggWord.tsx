'use client'

// EggWord — wraps a word (e.g. the "GPU" in the hero headline) and makes it
// a secret door: click or Enter fires the BootEgg terminal via a window
// event. Subtle dashed-underline affordance on hover so curious cursors
// find it without shouting.

import type { ReactNode } from 'react'

export const BOOT_EGG_EVENT = 'dcp:boot-egg'

export function EggWord({ children }: { children: ReactNode }) {
  const fire = () => window.dispatchEvent(new CustomEvent(BOOT_EGG_EVENT))
  return (
    <span
      className="egg-word"
      role="button"
      tabIndex={0}
      aria-label="Open the DCP boot terminal"
      onClick={fire}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          fire()
        }
      }}
    >
      {children}
    </span>
  )
}
