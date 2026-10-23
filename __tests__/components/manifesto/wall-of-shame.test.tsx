import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { WallOfShame } from "@/components/manifesto/wall-of-shame";

describe("WallOfShame", () => {
  it("lists entries ranked, with type, domain and report count", () => {
    render(
      <WallOfShame
        entries={[
          { company: "Quiet Co", spamType: "unsolicited-newsletter", reports: 1, firstReported: "2026-01-02" },
          { company: "Loud Co", domain: "loud.io", spamType: "cold-outreach", reports: 4, firstReported: "2026-02-03", note: "Daily sequences." },
          { company: "Third", spamType: "phishing-scam", reports: 2, firstReported: "2026-03-01" },
          { company: "Fourth", spamType: "ai-generated-spam", reports: 1, firstReported: "2025-12-01" },
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Loud Co");
    expect(items[0]).toHaveTextContent("loud.io");
    expect(items[0]).toHaveTextContent("4reports");
    expect(items[0]).toHaveTextContent("Daily sequences.");
    expect(items[3]).toHaveTextContent("Fourth");
    expect(items[3]).toHaveTextContent("1report");
    expect(screen.getByText("Unsolicited Newsletter")).toBeInTheDocument();
  });
});
