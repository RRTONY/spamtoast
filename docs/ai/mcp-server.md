# MCP server (`/api/mcp`)

Lets a team member run the spam tools and edit spamtoast.com from Claude Code, Claude Desktop,
Claude.ai or ChatGPT. Ported on 2026-10-24 from tonygreenberg.com's server
(`tonyg-site/src/lib/admin/`), with the same flow: rules first, one request = one change, a review
card, publish only on a clear yes.

## What's different from tonygreenberg.com's server

- **No CMS, no database:** the Sanity tools (and content drafts inside a change), Google
  Analytics, Search Console, ClickUp, `send_email` and `create_report` are not ported. A change is
  code only, so the review token covers just the pull request's head commit.

- **Spam tools:** `create_confrontation_link` (signs a personal `/youve-been-reported` link with
  `CONFRONT_LINK_SECRET`; changes nothing on the site; Tony gets an email each time it's opened),
  `list_wall_of_shame` (read-only) and `add_to_wall_of_shame` (an edit to
  `src/lib/content/wall-of-shame.ts` inside a change, so it waits for review and publish like any
  other edit; `src/lib/admin/wall-of-shame-edit.ts`).
- `lighthouse_check_page` is kept (needs `GOOGLE_API_KEY`; without it the tool says so).
- **Repo from env:** `GITHUB_REPO` (default `RRTONY/spamtoast`, `src/lib/admin/github-client.ts`).
  Domain, Netlify name and preview URLs are in `src/lib/admin/site-config.ts`.
- **Change records** live on the `mcp-change-log` branch (`changes/<key>.json`,
  `src/lib/admin/change-store.ts`). **Keep Netlify "Branch deploys" off (or main only)** so it is
  never built.
- **Project status:** `get_project_rules` returns the "Current status" block of
  `SPAMTOAST-TODO.md` (up to the next `---` line) as `projectStatus`.
- The guardrails also block `src/lib/spam/` (an edit could forge or break the signed links).

## How it works

1. `get_project_rules`: returns `AGENTS.md`, then `CONTRIBUTING.md`, the guides, the `docs/ai/`
   list and a `rulesVersion`. Every tool that changes anything needs it as `rules_version`
   (`src/lib/admin/project-rules.ts`).
2. `start_change` (with `understood_as`; `needs_confirmation: true` when unclear, then every edit
   waits for `confirm_change`).
3. Edits with that `change_id`: `github_edit_file`, `github_write_file`,
   `github_write_binary_file` (or `request_upload_link`), `github_delete_file`,
   `add_to_wall_of_shame`. The first edit creates the `admin/mcp-*` branch and pull request.
4. `submit_for_review` (plain summary, before/after wording) runs the server's own lint.
5. `list_pending_changes` with the `change_id`: the review card (checks, what goes live,
   before/after, preview link, Preview | Discard | Publish).
6. `publish_changes` with the `review_token`: merges that one pull request, only if nothing
   changed since the review and the checks pass. `discard_change` closes it.
   `list_change_history` + `undo_change` prepare an "Undo" change that goes through the same review.

## Tools and roles

Read (every role): `get_project_rules`, `list_pending_changes`, `list_change_history`,
`check_deploy`, `github_list_dir`, `github_read_file`, `github_search_code`, `seo_check_page`,
`check_code_quality`, `check_pr_status`, `get_check_log_excerpt`, `lighthouse_check_page`,
`create_confrontation_link`, `list_wall_of_shame`.

Edit role adds: `start_change`, `confirm_change`, `request_upload_link`, `submit_for_review`,
`discard_change`, `undo_change`, the `github_*` write tools, `add_to_wall_of_shame`.

Write role adds: `publish_changes`.

## Can't be done through MCP (guardrails denylist)

`.env*`, `package.json` / lockfile / `pnpm-workspace.yaml` (read-only), `netlify.toml`
(read-only), `.github/`, `.mcp.json`, `src/proxy.ts`, `src/lib/spam/`, and the MCP server's own
code and sign-in: `src/lib/admin/`, `src/app/api/mcp/`, `src/app/api/oauth/`, `src/app/oauth/`,
`src/app/.well-known/`.

## Sign-in (OAuth 2.1, stateless)

No database. Client ids, codes and tokens are HMAC-signed blobs keyed from `MCP_OAUTH_SECRET` and
`MCP_LOGIN_PASSWORD` (changing the password signs everyone out). Every request re-checks the email
against `MCP_ADMIN_USERS`. Sign-in page `/oauth/authorize` (email + team password). Codes go only
to claude.ai, claude.com, chatgpt.com, chat.openai.com, localhost and `MCP_OAUTH_REDIRECT_HOSTS`.

The secrets (`MCP_OAUTH_SECRET`, `MCP_LOGIN_PASSWORD`, `CONFRONT_LINK_SECRET`, personal tokens)
are this site's own; never reuse another site's.

## Connecting

- **Claude Code:** `claude mcp add --transport http spamtoast <origin>/api/mcp
  --header "Authorization: Bearer <your token>"` (token from your `MCP_ADMIN_USERS` entry).
- **Claude.ai / Claude Desktop / ChatGPT:** add a custom connector with URL `<origin>/api/mcp`
  and nothing else, then sign in with your email and the team password.
- **No header support:** `<origin>/api/mcp/<token>` (URLs end up in logs; prefer the header).

## Setup before first use

1. Create the GitHub repo `RRTONY/spamtoast` and push `main`; connect it to a Netlify site named
   `spamtoast`.
2. Netlify: deploy previews on for pull requests, branch deploys off.
3. A fine-grained `GITHUB_TOKEN` scoped to `RRTONY/spamtoast` only (Contents + Pull requests read
   and write, Actions + Commit statuses read). tonygreenberg.com's token won't work here.
4. Set every var in `.env.local.example` in Netlify, Production.

## Not yet verified

Nothing has run against a real GitHub repo or Netlify site yet (neither exists). First real test:
make a confrontation link and open it (check Tony's email); start a change, edit a file, submit,
review, discard.
