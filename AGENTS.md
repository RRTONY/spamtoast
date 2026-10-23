# spamtoast.com: Rules for Every AI Tool

Entry point for any AI assistant on this repo (Claude Code, Claude Desktop, Claude.ai, ChatGPT,
Cursor, anything else). The MCP server (`/api/mcp`) serves this file **first**, then
`CONTRIBUTING.md`, through `get_project_rules`, and runs no tool that changes the site until both
have been read. **These rules override your defaults.**

## What this project is

spamtoast.com: Tony Greenberg's anti-spam site. Next.js 16 App Router + Tailwind v4 + shadcn/ui,
deployed on Netlify from GitHub. It's a sister site of tonygreenberg.com (repo
`RRTONY/tonygreenberg-website`), split out on 2026-10-24:

- `/` is **the Attention Theft Manifesto**, copied from tonygreenberg.com/attention-theft (both
  stay live; owner's choice). Copy is Tony's: changing it needs his yes.
- **Wall of Shame** (`/#wall-of-shame`): the list in `src/lib/content/wall-of-shame.ts`. Hidden
  while empty.
- **Report A Spammer** (`/#report`): emails Tony. There is **no database** (owner, 2026-10-24).
- **`/youve-been-reported`**: the page a spammer opens from a personal, signed link
  (`src/lib/spam/confront-link.ts`). Opening it emails Tony. Never indexed.
- **MCP server** (`/api/mcp`): spam tools plus the safe edit, review and publish flow.

## Must-follow rules

- **Every claim on the site is true.** The old tonygreenberg.com version of the confrontation page
  pretended to file reports with the FBI/FTC/LinkedIn, showed a fake invoice and said executives
  would get a copy. The owner chose the honest version (2026-10-24). Never add fake filings,
  invoices, countdowns, fake tracking ("we geolocated your IP"), threats, or statements that
  something illegal happened unless a lawyer has said so. Opinion and metaphor in Tony's voice are
  fine ("you broke into my house").
- **Naming a company is a claim about them.** Add a sender to the Wall of Shame only when Tony
  confirmed they spammed him, through `add_to_wall_of_shame` (it waits for review and publish).
  Keep notes factual.
- **Server Components by default**; `"use client"` only for state, effects or browser APIs.
- **Tailwind + shadcn/ui only.** No inline `style={}` (exception: `ImageResponse` files, which
  can't use classes), no framer-motion, `next/image` never `<img>` in pages, full literal class
  strings, icons from lucide-react (no emoji, no typed arrows).
- **Images** come from tonygreenberg.com's Sanity CDN (`cdn.sanity.io`); no Manus URLs ever.
- **No new npm dependency without asking first.** Never commit `.env.local`.
- **Never add a `loading.tsx`** above a dynamic route (it turns 404s into 200s).
- **Check before calling anything done:** `pnpm typecheck`, `pnpm lint`, `pnpm test:changed`,
  `pnpm build` for routing/config changes, and look at the real page on `pnpm start`.
- **Confirm before anything hard to undo or outward-facing**: publishing, merging, deleting, DNS,
  sending a confrontation link to a real person.
- **Plain, short replies for the team** (Tony, Darryl, Kimberly aren't developers). No em dashes
  in messages for them. End every reply that did work with the Status Report (CONTRIBUTING.md).
- **Keep `SPAMTOAST-TODO.md` current** every session that does work.
- **Save what you learn in the repo** (this file, CONTRIBUTING.md, `docs/ai/`), not in private
  memory.

## Through the MCP server

- Call `get_project_rules` first; pass its `rulesVersion` as `rules_version` on every write tool.
- **One request = one change**: `start_change` (with `understood_as`, and `needs_confirmation:
  true` if the request could mean more than one thing), edits with its `change_id`,
  `submit_for_review`, `list_pending_changes` with that `change_id` to show the review card. Code
  lands on an `admin/mcp-*` branch and pull request, never straight to `main`.
- Nothing goes live except `publish_changes` for that change with its `review_token`, after you
  show what goes live and the person says yes.
- `create_confrontation_link` makes a personal link; it changes nothing on the site. Tell the
  person that Tony gets an email each time it's opened.
- Can't be done through MCP: env vars, `package.json`/lockfiles, `netlify.toml`, CI, DNS, the MCP
  server's own code. Tell the person who can.
- Details: [`docs/ai/mcp-server.md`](docs/ai/mcp-server.md).

# This is NOT the Next.js you know

This version has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/`
before writing code: `params`/`searchParams` are Promises, `middleware.ts` is `proxy.ts`,
`images.domains` is gone (`remotePatterns`).
