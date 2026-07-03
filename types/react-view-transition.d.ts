// Type shim for React's experimental <ViewTransition> component.
//
// next.config.js sets `experimental.viewTransition: true`, which makes Next.js
// alias `react` (App Router only) to its vendored react-experimental build —
// that build exports `unstable_ViewTransition` at runtime, but the stable
// @types/react package does not declare it yet. Remove this file once the
// export lands in @types/react.
import 'react'

declare module 'react' {
  interface ViewTransitionProps {
    children?: React.ReactNode
    /** view-transition-name; defaults to an auto-generated unique name. */
    name?: string
    /** Class applied via view-transition-class during an enter animation. */
    enter?: string
    /** Class applied via view-transition-class during an exit animation. */
    exit?: string
    /** Class applied via view-transition-class during an update animation. */
    update?: string
    /** Class applied via view-transition-class during a share animation. */
    share?: string
    default?: string
    onEnter?: (instance: unknown, types: string[]) => void
    onExit?: (instance: unknown, types: string[]) => void
    onUpdate?: (instance: unknown, types: string[]) => void
    onShare?: (instance: unknown, types: string[]) => void
  }

  export const unstable_ViewTransition: React.ComponentType<ViewTransitionProps>
}
