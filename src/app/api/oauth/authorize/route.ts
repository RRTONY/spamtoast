import {
  clientIp,
  isLoginLocked,
  issueAuthCode,
  login,
  recordLoginFailure,
  validateAuthorizeRequest,
  publicOrigin,
} from "@/lib/admin/mcp-oauth";

// The sign-in form on /oauth/authorize posts here. On success the browser
// goes straight back to ChatGPT/Claude with a one-time code; on failure it
// goes back to the sign-in page with an error (the password is never put in
// a URL).
export async function POST(req: Request): Promise<Response> {
  const form = Object.fromEntries(
    new URLSearchParams(await req.text()).entries(),
  );
  const checked = await validateAuthorizeRequest(form);
  const origin = publicOrigin(req);
  if ("error" in checked) {
    return Response.redirect(
      `${origin}/oauth/authorize?invalid=${encodeURIComponent(checked.error)}`,
      303,
    );
  }

  const back = new URL(`${origin}/oauth/authorize`);
  for (const key of [
    "response_type",
    "client_id",
    "redirect_uri",
    "state",
    "code_challenge",
    "code_challenge_method",
    "scope",
    "resource",
  ]) {
    if (form[key]) back.searchParams.set(key, form[key]);
  }

  const email = (form.email ?? "").trim();
  const ip = clientIp(req);
  if (isLoginLocked(ip, email)) {
    back.searchParams.set("error", "locked");
    return Response.redirect(back.toString(), 303);
  }

  const user = login(email, form.password ?? "");
  if (!user) {
    recordLoginFailure(ip, email);
    console.log(`[mcp-oauth] failed sign-in for ${email || "(no email)"}`);
    back.searchParams.set("error", "invalid");
    back.searchParams.set("email", email);
    return Response.redirect(back.toString(), 303);
  }

  console.log(`[mcp-oauth] ${user.name} <${user.email}> signed in`);
  const target = new URL(checked.params.redirectUri);
  target.searchParams.set("code", issueAuthCode(checked.params, user.email));
  if (checked.params.state)
    target.searchParams.set("state", checked.params.state);
  target.searchParams.set("iss", origin);
  return Response.redirect(target.toString(), 303);
}
