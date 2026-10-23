import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authenticateMcpToken,
  bearerFromRequest,
  canUseTool,
  findMcpUserByEmail,
  isMcpAuthConfigured,
  parseMcpUsers,
  READ_ONLY_TOOLS,
  WRITE_ONLY_TOOLS,
} from "@/lib/admin/mcp-auth";
import { RULES_GATED_TOOLS } from "@/lib/admin/project-rules";

const T1 = "a".repeat(32);
const T2 = "b".repeat(40);
const USERS = JSON.stringify([
  { name: "Tony", email: "Tony@Example.com", role: "admin", token: T1 },
  { name: "Kim", email: "kim@example.com", role: "edit" },
  { name: "Reader", email: "", role: "read", token: T2 },
]);

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parseMcpUsers", () => {
  it("parses entries and maps admin to write", () => {
    expect(parseMcpUsers(USERS)).toEqual([
      { name: "Tony", email: "Tony@Example.com", role: "write", token: T1 },
      { name: "Kim", email: "kim@example.com", role: "edit", token: "" },
      { name: "Reader", email: "", role: "read", token: T2 },
    ]);
  });

  it("returns [] for empty, invalid JSON or a non-array", () => {
    expect(parseMcpUsers(undefined)).toEqual([]);
    expect(parseMcpUsers("   ")).toEqual([]);
    expect(parseMcpUsers("{not json")).toEqual([]);
    expect(parseMcpUsers('{"name":"x"}')).toEqual([]);
  });

  it("skips entries with no name, an unknown role, a short token, or neither email nor token", () => {
    const raw = JSON.stringify([
      { email: "a@x.com", role: "write" },
      { name: "B", email: "b@x.com", role: "owner" },
      { name: "C", email: "c@x.com", role: "write", token: "short" },
      { name: "D", role: "write" },
      null,
      { name: "Ok", email: "ok@x.com", role: "read" },
    ]);
    expect(parseMcpUsers(raw).map((u) => u.name)).toEqual(["Ok"]);
    expect(console.error).toHaveBeenCalled();
  });
});

describe("authenticateMcpToken", () => {
  beforeEach(() => {
    vi.stubEnv("MCP_ADMIN_USERS", USERS);
  });

  it("returns the user for an exact token, without the token", () => {
    expect(authenticateMcpToken(T1)).toEqual({ name: "Tony", email: "Tony@Example.com", role: "write" });
    expect(authenticateMcpToken(`  ${T2}  `)).toEqual({ name: "Reader", email: "", role: "read" });
  });

  it("refuses empty, wrong, prefix and longer tokens", () => {
    expect(authenticateMcpToken("")).toBeNull();
    expect(authenticateMcpToken(null)).toBeNull();
    expect(authenticateMcpToken(undefined)).toBeNull();
    expect(authenticateMcpToken("c".repeat(32))).toBeNull();
    expect(authenticateMcpToken(T1.slice(0, 31))).toBeNull();
    expect(authenticateMcpToken(`${T1}x`)).toBeNull();
  });

  it("an email-only user can't sign in with an empty token", () => {
    expect(authenticateMcpToken(" ")).toBeNull();
  });

  it("nobody gets in when the list isn't configured", () => {
    vi.stubEnv("MCP_ADMIN_USERS", "");
    expect(isMcpAuthConfigured()).toBe(false);
    expect(authenticateMcpToken(T1)).toBeNull();
  });

  it("isMcpAuthConfigured is true with at least one valid user", () => {
    expect(isMcpAuthConfigured()).toBe(true);
  });
});

describe("findMcpUserByEmail", () => {
  beforeEach(() => {
    vi.stubEnv("MCP_ADMIN_USERS", USERS);
  });

  it("matches case-insensitively and trims", () => {
    expect(findMcpUserByEmail("  tony@example.COM ")).toEqual({ name: "Tony", email: "Tony@Example.com", role: "write" });
  });

  it("returns null for unknown or blank emails (a token-only user has no email)", () => {
    expect(findMcpUserByEmail("someone@example.com")).toBeNull();
    expect(findMcpUserByEmail("")).toBeNull();
    expect(findMcpUserByEmail("   ")).toBeNull();
  });
});

describe("bearerFromRequest", () => {
  const req = (auth?: string) => new Request("https://x/api/mcp", { headers: auth ? { authorization: auth } : {} });
  it("reads a Bearer token", () => {
    expect(bearerFromRequest(req(`Bearer ${T1} `))).toBe(T1);
  });

  it("ignores other schemes and missing headers", () => {
    expect(bearerFromRequest(req(`Basic ${T1}`))).toBe("");
    expect(bearerFromRequest(req(`bearer ${T1}`))).toBe("");
    expect(bearerFromRequest(req())).toBe("");
  });
});

describe("canUseTool", () => {
  it("lets every role use read-only tools", () => {
    for (const role of ["read", "edit", "write"] as const) expect(canUseTool(role, "github_read_file")).toBe(true);
  });

  it("read users can't use any other tool, including unknown new ones", () => {
    for (const tool of ["github_write_file", "start_change", "add_to_wall_of_shame", "publish_changes", "brand_new_tool"]) {
      expect(canUseTool("read", tool)).toBe(false);
    }
  });

  it("edit users can make changes but never publish", () => {
    expect(canUseTool("edit", "github_write_file")).toBe(true);
    expect(canUseTool("edit", "submit_for_review")).toBe(true);
    expect(canUseTool("edit", "publish_changes")).toBe(false);
  });

  it("write users can publish", () => {
    expect(canUseTool("write", "publish_changes")).toBe(true);
  });

  it("no rules-gated (site-changing) tool is classed as read-only", () => {
    for (const tool of RULES_GATED_TOOLS) expect(READ_ONLY_TOOLS.has(tool), tool).toBe(false);
    expect(WRITE_ONLY_TOOLS).toEqual(new Set(["publish_changes"]));
  });

  it("spam tools: links and the list for everyone, adding to the Wall of Shame needs edit", () => {
    for (const tool of ["create_confrontation_link", "list_wall_of_shame"]) {
      for (const role of ["read", "edit", "write"] as const) expect(canUseTool(role, tool), tool).toBe(true);
    }
    expect(canUseTool("read", "add_to_wall_of_shame")).toBe(false);
    expect(canUseTool("edit", "add_to_wall_of_shame")).toBe(true);
    expect(canUseTool("write", "add_to_wall_of_shame")).toBe(true);
  });
});
