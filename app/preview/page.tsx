// /preview — design-review surface for the homepage redesign.
//
// The component lives in ./HomeRedesign so it can be shared with the
// production / route. Do NOT add page-level logic here; this file is
// intentionally a thin route shell.

import HomeRedesign from './HomeRedesign'

export default function PreviewPage() {
  return <HomeRedesign />
}
