import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ManifestoNav } from "@/components/manifesto/manifesto-nav";

function section(id: string, top: number) {
  const el = document.createElement("section");
  el.id = id;
  el.getBoundingClientRect = vi.fn(() => ({ top }) as DOMRect);
  document.body.appendChild(el);
  return el;
}

describe("ManifestoNav", () => {
  it("links back home and to the manifesto, with in-page anchors", () => {
    render(<ManifestoNav />);
    expect(screen.getByRole("link", { name: "Back to TonyGreenberg.com" })).toHaveAttribute("href", "https://tonygreenberg.com");
    expect(screen.getByRole("link", { name: /SpamToast/ })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Legal" })).toHaveAttribute("href", "/#legal");
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
  });

  it("opens and closes the mobile menu", async () => {
    render(<ManifestoNav />);
    expect(screen.queryByRole("link", { name: "Legal Arsenal" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Toggle navigation" }));
    const link = screen.getByRole("link", { name: "Legal Arsenal" });
    expect(link).toHaveAttribute("href", "/#legal");
    await userEvent.click(link);
    expect(screen.queryByRole("link", { name: "Legal Arsenal" })).not.toBeInTheDocument();
  });

  it("highlights the section scrolled into view", () => {
    const els = [section("heresy", -500), section("legal", 80), section("report", 900)];
    render(<ManifestoNav />);
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(screen.getByRole("link", { name: "Legal" }).className).toContain("bg-crusade-red");
    expect(screen.getByRole("link", { name: "Economics" }).className).not.toContain("bg-crusade-red");
    els.forEach((e) => e.remove());
  });

  it("adds a shadow after scrolling past 50px", () => {
    const { container } = render(<ManifestoNav />);
    expect(container.querySelector("header")!.className).not.toContain("shadow-[");
    Object.defineProperty(window, "scrollY", { value: 200, configurable: true });
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(container.querySelector("header")!.className).toContain("shadow-[");
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });
});
