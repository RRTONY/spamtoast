import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ManifestoFooter } from "@/components/manifesto/manifesto-footer";

describe("ManifestoFooter", () => {
  it("credits Tony and links home, essays and the manifesto", () => {
    render(<ManifestoFooter />);
    expect(screen.getByText("Tony Greenberg")).toBeInTheDocument();
    expect(screen.getByText(/Founder & CEO, ImpactSoul/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "TonyGreenberg.com" })).toHaveAttribute("href", "https://tonygreenberg.com");
    expect(screen.getByRole("link", { name: "Essays" })).toHaveAttribute("href", "https://tonygreenberg.com/blog");
    expect(screen.getByRole("link", { name: "The Manifesto" })).toHaveAttribute("href", "/");
  });

  it("shows this year in the copyright", () => {
    render(<ManifestoFooter />);
    expect(screen.getByText(new RegExp(`© ${new Date().getFullYear()} Tony Greenberg`))).toBeInTheDocument();
  });
});
