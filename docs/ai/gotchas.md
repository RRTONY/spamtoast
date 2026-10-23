# Gotchas found while building spamtoast.com (2026-10-24)

- **Heading font override goes on `<body>`, not `<html>`.** `<html>` carries Playfair's
  next/font class, which also sets `--font-display`; an arbitrary-property class on the same
  element lost, so headings rendered in Playfair instead of Fraunces. On `<body>` it inherits
  correctly. Check with `getComputedStyle(h1).fontFamily`.
- **The homepage must stay static.** Reading `searchParams` in `page.tsx` made `/` dynamic. The
  `?offender=` banner reads it in the browser (`useSearchParams` inside `Suspense`). Look for
  `○ /` in `pnpm build`.
- **Menu anchors are `/#section`, not `#section`**, so they work from `/youve-been-reported` too.
- **Local testing sends real email** if `.env.local` has `RESEND_API_KEY`: opening a signed
  confrontation link in a browser emails Tony. Start the test server with
  `RESEND_API_KEY= pnpm start -p 3100` and look for `[email] RESEND_API_KEY not set` in its log.
  curl is ignored as a bot, so curl checks are safe.
- **`.env.local`'s `NEXT_PUBLIC_SITE_URL`** decides the canonical and sitemap host. Locally it may
  be `localhost`; on Netlify set it to `https://spamtoast.com`.
