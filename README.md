# spamtoast.com

Tony Greenberg's anti-spam site: the Attention Theft Manifesto, the Wall of Shame, a Report A
Spammer form, the honest "You've been reported" page, and an MCP server so Claude or ChatGPT can
run the spam tools and make reviewed edits.

Next.js 16 + Tailwind v4 + shadcn/ui, on Netlify. No database: reports and "link opened" alerts
are emails to Tony; the Wall of Shame is a list in code.

```bash
pnpm install
cp .env.local.example .env.local   # fill in
pnpm dev                           # http://localhost:3000
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Rules for people and AI tools: [`AGENTS.md`](AGENTS.md), [`CONTRIBUTING.md`](CONTRIBUTING.md).
Project status and setup steps: [`SPAMTOAST-TODO.md`](SPAMTOAST-TODO.md). MCP server:
[`docs/ai/mcp-server.md`](docs/ai/mcp-server.md).
