import { redirect } from 'next/navigation'

// Stale-link gravestone.
//
// Until 2026-05-09 this was the Supabase magic-link callback page: the
// browser landed here with `#access_token=…` in the URL hash and the page
// exchanged it for a DCP API key. The new auth flow uses native magic-link
// tokens delivered to /auth/verify?token=…, so this URL only ever sees:
//   • old emails sent before the migration (15-min TTL — long since dead)
//   • bookmarks / pasted links from before today
//
// Either way the right outcome is "this link is stale, request a new one",
// not a silent failure. Server-side 301 to /login with a clear reason code.

export default function AuthCallbackPage() {
  redirect('/login?reason=stale_link')
}
