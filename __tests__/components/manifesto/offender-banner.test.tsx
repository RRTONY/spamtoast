import { describe, expect, it } from "vitest";
import { navigation } from "@tests/helpers/next";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OffenderBanner } from "@/components/manifesto/offender-banner";

const show = (offender: string) => {
  navigation.searchParams = new URLSearchParams({ offender });
  return render(<OffenderBanner />);
};

describe("OffenderBanner", () => {
  it("shows nothing without ?offender", () => {
    const { container } = render(<OffenderBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("names the offender and points to the Report section", () => {
    show("Spamco");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Spamco");
    expect(screen.getByText(/has been called/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Report A Spammer" })).toHaveAttribute("href", "#report");
  });

  it("goes away when dismissed", async () => {
    const { container } = show("Spamco");
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the name as text, not HTML", () => {
    show("<b>x</b>");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("<b>x</b>");
  });
});
