import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderServer } from "@tests/helpers/render";
import { CRUSADE_ARTICLES, WEAPONS } from "@/lib/content/attention-theft";
import { navigation } from "@tests/helpers/next";
import HomePage, { metadata } from "@/app/page";

// A big page: give each render room on a busy machine.
vi.setConfig({ testTimeout: 45_000 });

// The offender banner reads ?offender in the browser (useSearchParams).
const renderPage = (search: Record<string, string | string[]> = {}) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(search)) for (const one of [v].flat()) q.append(k, one);
  navigation.searchParams = q;
  return renderServer(HomePage());
};

describe("/ (the manifesto)", () => {
  it("has its own title, description and canonical", () => {
    expect(metadata.title).toEqual({ absolute: "SpamToast | Attention Theft: The Manifesto" });
    expect(metadata.description).toMatch(/why your inbox is a crime scene/);
    expect(metadata.alternates?.canonical).toBe("/");
  });

  it("renders one H1 and the real manifesto copy", async () => {
    const { container } = await renderPage();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Defend The Cathedral\.\s*Burn The Heresy\./);
    expect(container).toHaveTextContent("Email is sacred infrastructure. They're desecrating it. We're stopping them.");
    expect(container).toHaveTextContent("This is not a rant. This is a crusade.");
  });

  it("has every section the nav jumps to, with all ten weapons", async () => {
    const { container } = await renderPage();
    for (const id of ["heresy", "weapons", "legal", "blocker-finder", "report"]) expect(container.querySelector(`#${id}`)).not.toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "The 10 Weapons" })).toBeInTheDocument();
    expect(WEAPONS).toHaveLength(10);
    for (const w of WEAPONS) expect(container).toHaveTextContent(w.title);
    expect(screen.getByRole("link", { name: /Arm Yourself/ })).toHaveAttribute("href", "#weapons");
  });

  it("hides the Wall of Shame while it's empty", async () => {
    const { container } = await renderPage();
    expect(container.querySelector("#wall-of-shame")).toBeNull();
  });

  it("links the related crusade essays to their posts on tonygreenberg.com", async () => {
    await renderPage();
    const first = CRUSADE_ARTICLES[0];
    expect(screen.getAllByRole("link", { name: new RegExp(first.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) })[0]).toHaveAttribute(
      "href",
      `https://tonygreenberg.com/blog/${first.slug}`,
    );
  });

  it("shows no offender banner without ?offender", async () => {
    await renderPage();
    expect(screen.queryByText(/Someone sent you this link because/)).not.toBeInTheDocument();
  });

  it("calls out the named offender from ?offender as plain text, and can be dismissed", async () => {
    const user = userEvent.setup();
    const { container } = await renderPage({ offender: "<b>Acme Spam Co</b>" });
    expect(screen.getByRole("heading", { level: 2, name: "<b>Acme Spam Co</b>" })).toBeInTheDocument();
    expect(container.querySelector("b")).toBeNull();
    expect(container).toHaveTextContent("has been called out for attention theft");
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(/Someone sent you this link because/)).not.toBeInTheDocument();
  });

  it("uses the first value when ?offender is repeated", async () => {
    await renderPage({ offender: ["First Co", "Second Co"] });
    expect(screen.getByRole("heading", { level: 2, name: "First Co" })).toBeInTheDocument();
    expect(screen.queryByText("Second Co")).not.toBeInTheDocument();
  });
});
