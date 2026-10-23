import type { Metadata } from "next";
import Link from "next/link";
import { Flame } from "lucide-react";
import { validateAuthorizeRequest } from "@/lib/admin/mcp-oauth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in to connect",
  description: "Team sign-in for connecting Claude or ChatGPT to the SpamToast admin tools.",
  robots: { index: false, follow: false },
};

// The MCP server's sign-in page (OAuth 2.1, see src/lib/admin/mcp-oauth.ts).
// Claude or ChatGPT opens it when a team member adds https://spamtoast.com/api/mcp
// as a connector. A plain form (no client JS) posting to /api/oauth/authorize,
// which checks the email against MCP_ADMIN_USERS and the shared
// MCP_LOGIN_PASSWORD, then sends the browser back to the app with a one-time
// code. Plain elements rather than shadcn primitives so the page stands on
// its own.

const ERRORS: Record<string, string> = {
  invalid: "That email and password don't match a team member.",
  locked: "Too many attempts. Wait 15 minutes, then try again.",
};

const inputClass =
  "h-11 w-full rounded-md border border-border bg-white px-3 text-base text-foreground outline-none focus:border-crusade-red/50 focus:ring-2 focus:ring-crusade-red/20";

function flat(params: Record<string, string | string[] | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex min-h-11 items-center justify-center gap-2">
          <Flame aria-hidden="true" className="size-6 text-crusade-red" />
          <span className="font-heading text-2xl font-bold text-foreground">SpamToast</span>
        </Link>
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">{children}</div>
        <p className="mt-6 text-center font-mono text-xs tracking-wide text-muted-foreground">Team members only.</p>
      </div>
    </main>
  );
}

export default async function AuthorizePage({ searchParams }: PageProps<"/oauth/authorize">) {
  const q = flat(await searchParams);
  const checked = q.invalid ? { error: q.invalid } : await validateAuthorizeRequest(q);

  if ("error" in checked) {
    return (
      <Shell>
        <h1 className="font-heading text-xl font-bold">Can&apos;t sign in from this link</h1>
        <p className="mt-2 text-sm text-muted-foreground">{checked.error}</p>
        <p className="mt-4 text-sm text-muted-foreground">Go back to Claude or ChatGPT and connect again from there.</p>
      </Shell>
    );
  }

  const error = q.error ? ERRORS[q.error] : undefined;
  const hidden = {
    response_type: "code",
    client_id: checked.params.clientId,
    redirect_uri: checked.params.redirectUri,
    state: checked.params.state,
    code_challenge: checked.params.codeChallenge,
    code_challenge_method: "S256",
    scope: checked.params.scope,
    resource: checked.params.resource,
  };

  return (
    <Shell>
      <p className="font-mono text-xs tracking-[0.2em] text-crusade-red uppercase">Sign in</p>
      <h1 className="mt-1 font-heading text-xl font-bold sm:text-2xl">Connect {checked.appName} to SpamToast</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Sign in with your team email to let {checked.appName} work on the website for you.
      </p>
      {error && (
        <p role="alert" className="mt-4 rounded-md border border-crusade-red/40 bg-crusade-red/10 px-3 py-2 text-sm text-foreground">
          {error}
        </p>
      )}
      <form method="post" action="/api/oauth/authorize" className="mt-5 space-y-4">
        {Object.entries(hidden).map(([name, value]) =>
          value ? <input key={name} type="hidden" name={name} value={value} /> : null,
        )}
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input id="email" name="email" type="email" required autoComplete="username" defaultValue={q.email ?? ""} className={inputClass} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input id="password" name="password" type="password" required autoComplete="current-password" className={inputClass} />
        </div>
        <button
          type="submit"
          className="h-11 w-full rounded-md bg-crusade-red px-4 text-sm font-semibold text-white transition-colors hover:bg-crusade-crimson"
        >
          Sign in and connect
        </button>
      </form>
    </Shell>
  );
}
