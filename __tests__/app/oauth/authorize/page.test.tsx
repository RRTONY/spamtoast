import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderServer, pageProps } from "@tests/helpers/render";
import AuthorizePage, { metadata, dynamic } from "@/app/oauth/authorize/page";
import { validateAuthorizeRequest } from "@/lib/admin/mcp-oauth";

vi.mock("@/lib/admin/mcp-oauth", () => ({ validateAuthorizeRequest: vi.fn() }));
const validate = vi.mocked(validateAuthorizeRequest);
type Props = Parameters<typeof AuthorizePage>[0];
const props = (sp: Record<string, string | string[]> = {}) => pageProps({}, sp) as unknown as Props;
const OK = {
  appName: "Claude",
  params: { clientId: "cid", redirectUri: "https://claude.ai/cb", state: "st", codeChallenge: "cc", scope: "mcp", resource: undefined },
};

describe("/oauth/authorize", () => {
  it("is noindex and rendered per request", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(dynamic).toBe("force-dynamic");
  });

  it("explains a bad link instead of showing the form", async () => {
    validate.mockResolvedValue({ error: "Unknown app." } as never);
    await renderServer(AuthorizePage(props({ client_id: "x" })));
    expect(screen.getByText("Can't sign in from this link")).toBeInTheDocument();
    expect(screen.getByText("Unknown app.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  });

  it("shows the ?invalid reason without re-validating", async () => {
    await renderServer(AuthorizePage(props({ invalid: "Link expired." })));
    expect(screen.getByText("Link expired.")).toBeInTheDocument();
    expect(validate).not.toHaveBeenCalled();
  });

  it("shows a sign-in form that posts the OAuth fields (no empty ones) to /api/oauth/authorize", async () => {
    validate.mockResolvedValue(OK as never);
    const { container } = await renderServer(AuthorizePage(props({ client_id: ["cid", "other"] })));
    expect(validate).toHaveBeenCalledWith({ client_id: "cid" });
    expect(screen.getByText("Connect Claude to SpamToast")).toBeInTheDocument();
    const form = container.querySelector("form")!;
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", "/api/oauth/authorize");
    const hidden = Object.fromEntries([...form.querySelectorAll('input[type="hidden"]')].map((i) => [i.getAttribute("name"), i.getAttribute("value")]));
    expect(hidden).toEqual({
      response_type: "code",
      client_id: "cid",
      redirect_uri: "https://claude.ai/cb",
      state: "st",
      code_challenge: "cc",
      code_challenge_method: "S256",
      scope: "mcp",
    });
    expect(screen.getByLabelText("Password")).toBeRequired();
  });

  it("explains a wrong password or a lockout and keeps the email filled in", async () => {
    validate.mockResolvedValue(OK as never);
    await renderServer(AuthorizePage(props({ error: "invalid", email: "d@example.com" })));
    expect(screen.getByRole("alert")).toHaveTextContent("don't match a team member");
    expect(screen.getByLabelText("Email")).toHaveValue("d@example.com");
    validate.mockResolvedValue(OK as never);
    await renderServer(AuthorizePage(props({ error: "locked" })));
    expect(screen.getAllByRole("alert")[1]).toHaveTextContent(/Too many attempts/);
  });
});
