# spamtoast.com: Project file

## Current status — 2026-10-24

**Overall:** the site and MCP server are built locally in `~/Desktop/spamtoast`. **Nothing is live
yet**: no GitHub repo, no Netlify site, and spamtoast.com (registered at Namecheap on 2026-10-22,
pointing at Namecheap's default nameservers) doesn't serve it yet.

**Decisions made (owner, 2026-10-24):**
- Copy the Attention Theft page to spamtoast.com and keep tonygreenberg.com/attention-theft too.
- The "You've been reported" page is the honest version (no fake filings, invoice or exec copies).
- MCP server: spam tools plus the edit, review and publish flow.
- No database.

**Waiting on a decision:**
- Should tonygreenberg.com link to spamtoast.com (menu, the manifesto's Report section)? Later,
  maybe redirect `/attention-theft` there. Changes the main site, so it needs its own yes.
- Sender address for emails: keep `trust@tonygreenberg.com` or verify spamtoast.com in Resend.
- Wall of Shame: the first entries (Tony picks; it stays hidden while empty).

**MCP server setup (2026-10-24):** env vars added to `.env.local.example`; a local `.env.local`
was made with the same team emails and sender as psychedelicreadiness and fresh secrets. Still
blank: `RESEND_API_KEY` (paste the same Resend key), `GITHUB_TOKEN` (needs the repo first),
Netlify token. `get_project_rules` now serves this file's status block. Notes:
`docs/ai/mcp-server.md`.

**Next up:** the setup steps below, in order.

---

## Setup (outward-facing: each needs a yes)

- [ ] Create the GitHub repo (`RRTONY/spamtoast`, private) and push `main`.
- [ ] Netlify: new site from that repo, named `spamtoast` (build settings come from `netlify.toml`).
- [ ] Netlify env vars: everything in `.env.local.example` (site, Resend, `CONFRONT_LINK_SECRET`,
      MCP server). Generate the secrets fresh (`openssl rand -base64 32`), never reuse
      tonygreenberg.com's.
- [ ] DNS at Namecheap: add spamtoast.com and www as custom domains in Netlify, then either switch
      the nameservers to Netlify DNS or add the records Netlify shows (apex `A` / `ALIAS`, `www`
      `CNAME` to `spamtoast.netlify.app`). Netlify then issues the HTTPS certificate.
- [ ] Resend: verify spamtoast.com and set `EMAIL_FROM` (optional; until then mail comes from
      `trust@tonygreenberg.com`).
- [ ] Google Search Console: add spamtoast.com, submit `/sitemap.xml`.
- [ ] Connect the MCP server in Claude / ChatGPT (`docs/ai/mcp-server.md`) and run one full test:
      make a link, open it, check Tony's email; make a test edit, review, discard.

## Built (2026-10-24)

- [x] Project set up from tonygreenberg.com's stack (same packages, no new ones).
- [x] `/`: the Attention Theft Manifesto, copied from tonygreenberg.com (copy unchanged; essay
      links go to tonygreenberg.com; "back" links go to tonygreenberg.com).
- [x] Old addresses: `/attention-theft`, `/manifesto`, `/spamtoast` and the section paths
      (`/legal`, `/weapons`, `/report`, `/blocker-finder`, `/attention-theft/economics`...)
      redirect to the matching part of `/`.
- [x] Wall of Shame section (legacy wording), fed by `src/lib/content/wall-of-shame.ts`, hidden
      while empty. Legacy only ever had test entries, so it starts empty.
- [x] Report A Spammer emails Tony (no database).
- [x] `/youve-been-reported`: signed personal links; opening one emails Tony (link scanners
      ignored). Honest content: where anyone can report spam, the laws (from the Legal Arsenal),
      LinkedIn ban stories, legitimate alternatives. Never indexed.
- [x] Site icon (toast with a flame), iPhone icon, share image, titles and descriptions,
      canonical, robots.txt, sitemap, structured data (WebSite + Article by Tony), 404 page.
- [x] MCP server (`/api/mcp`): see `docs/ai/mcp-server.md`.
- [x] Rules for AI tools: `AGENTS.md`, `CONTRIBUTING.md`, `CLAUDE.md`.

## Later / ideas

- [ ] Forward-to-report email address (legacy's `spam@` idea) needs an inbound mail service.
- [ ] Old tonygreenberg.com essays about attention theft could be linked from the manifesto's
      dossier (they are: they open on tonygreenberg.com).
