import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LegalArsenal } from "@/components/manifesto/legal-arsenal";
import { LAWS, LETTER_TEMPLATE } from "@/lib/content/attention-theft";

const titles = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent).filter((t) => t !== "Letter to Your Representative" && !t?.includes("Letter"));

describe("LegalArsenal", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists every law by default", () => {
    render(<LegalArsenal />);
    expect(titles()).toEqual(LAWS.map((l) => l.title));
  });

  it("filters to existing laws or to take-action items", async () => {
    render(<LegalArsenal />);
    await userEvent.click(screen.getByRole("button", { name: "Take Action" }));
    expect(titles()).toEqual(LAWS.filter((l) => l.status === "action").map((l) => l.title));
    await userEvent.click(screen.getByRole("button", { name: "Existing Law" }));
    expect(titles()).toEqual(LAWS.filter((l) => l.status === "existing").map((l) => l.title));
    await userEvent.click(screen.getByRole("button", { name: "All" }));
    expect(titles()).toHaveLength(LAWS.length);
  });

  it("expands one law at a time and shows its action link", async () => {
    render(<LegalArsenal />);
    const action = LAWS.find((l) => l.actionUrl)!;
    const buttons = screen.getAllByRole("button", { name: /Read full analysis/ });
    await userEvent.click(buttons[LAWS.indexOf(action)]);
    expect(screen.getByText(action.detail)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Take Action Now/ })).toHaveAttribute("href", action.actionUrl);
    await userEvent.click(screen.getByRole("button", { name: "Show less" }));
    expect(screen.queryByText(action.detail)).not.toBeInTheDocument();
  });

  it("copies the letter template and shows Copied for 2 seconds", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<LegalArsenal />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    });
    expect(writeText).toHaveBeenCalledWith(LETTER_TEMPLATE);
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });
});
