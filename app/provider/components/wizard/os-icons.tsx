// Monochrome, emoji-free OS glyphs for the provider onboarding wizard.
// Designed to sit on the dc1-surface cards — all strokes use currentColor so
// the parent's text color drives them (active = dc1-amber, idle = muted).

import type { SVGProps } from 'react'
import type { DetectedOS } from './os-detect'

type IconProps = SVGProps<SVGSVGElement>

const base = 'h-7 w-7'

export function WindowsGlyph({ className, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? base}
      aria-hidden="true"
      {...rest}
    >
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1" />
      <rect x="13" y="3.5" width="7.5" height="7.5" rx="1" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="1" />
      <rect x="13" y="13" width="7.5" height="7.5" rx="1" />
    </svg>
  )
}

export function MacOSGlyph({ className, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? base}
      aria-hidden="true"
      {...rest}
    >
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M8 20h8" />
      <path d="M12 17v3" />
      <path d="M8.5 11.5a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Z" fill="currentColor" stroke="none" />
      <path d="M15.5 11.5a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Z" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function LinuxGlyph({ className, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? base}
      aria-hidden="true"
      {...rest}
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7.5 9.5 10 12l-2.5 2.5" />
      <path d="M12 15h4.5" />
    </svg>
  )
}

export function UnknownGlyph({ className, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? base}
      aria-hidden="true"
      {...rest}
    >
      <rect x="3" y="4.5" width="18" height="13" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17.5V21" />
      <path d="M10.25 10.25a1.75 1.75 0 1 1 2.5 1.58c-.6.27-.75.6-.75 1.17" />
      <circle cx="12" cy="15" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function OSGlyph({ os, className }: { os: DetectedOS; className?: string }) {
  switch (os) {
    case 'windows':
      return <WindowsGlyph className={className} />
    case 'macos':
      return <MacOSGlyph className={className} />
    case 'linux':
      return <LinuxGlyph className={className} />
    default:
      return <UnknownGlyph className={className} />
  }
}
