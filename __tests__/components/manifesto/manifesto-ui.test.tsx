import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CrusadeDivider, GlassCard, PullQuote, SectionIntro, SectionLabel, SectionTitle, StatCard } from "@/components/manifesto/manifesto-ui";

describe("manifesto UI pieces", () => {
  it("GlassCard picks the variant style, and the glow style when asked", () => {
    const { container, rerender } = render(<GlassCard variant="danger">x</GlassCard>);
    expect(container.firstElementChild!.className).toContain("border-crusade-red/20");
    expect(container.firstElementChild!.className).toContain("shadow-[0_4px_24px_rgba(200,22,26,0.06)]");
    rerender(
      <GlassCard variant="teal" glow className="extra">
        x
      </GlassCard>,
    );
    expect(container.firstElementChild!.className).toContain("shadow-[0_0_25px_rgba(14,124,124,0.1)]");
    expect(container.firstElementChild!.className).toContain("extra");
  });

  it("SectionTitle is an H2 and PullQuote a blockquote", () => {
    render(
      <>
        <SectionLabel>Label</SectionLabel>
        <SectionTitle>Title</SectionTitle>
        <SectionIntro>Intro</SectionIntro>
        <PullQuote>Quote</PullQuote>
      </>,
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Title");
    expect(screen.getByText("Quote").tagName).toBe("BLOCKQUOTE");
    expect(screen.getByText("Quote").className).toContain("border-l-crusade-red");
    expect(screen.getByText("Label")).toBeInTheDocument();
    expect(screen.getByText("Intro").tagName).toBe("P");
  });

  it("StatCard shows the number, label and source", () => {
    render(<StatCard number="$20B" label="Lost yearly" source="FTC" />);
    expect(screen.getByText("$20B")).toBeInTheDocument();
    expect(screen.getByText("Lost yearly")).toBeInTheDocument();
    expect(screen.getByText("FTC")).toBeInTheDocument();
  });

  it("CrusadeDivider is purely decorative", () => {
    const { container } = render(<CrusadeDivider />);
    expect(container.textContent).toBe("");
  });
});
