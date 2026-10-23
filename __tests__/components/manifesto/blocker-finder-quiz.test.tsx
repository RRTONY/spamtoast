import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BlockerFinderQuiz } from "@/components/manifesto/blocker-finder-quiz";
import { QUESTIONS, scoreTools } from "@/lib/content/attention-theft";

async function answerAll(user: ReturnType<typeof userEvent.setup>, labels: string[]) {
  for (const l of labels) await user.click(screen.getByRole("button", { name: l }));
}

describe("BlockerFinderQuiz", () => {
  it("starts at question 1 of 4", () => {
    render(<BlockerFinderQuiz />);
    expect(screen.getByText(`Question 1 of ${QUESTIONS.length}`)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(QUESTIONS[0].question);
  });

  it("each answer moves to the next question", async () => {
    const user = userEvent.setup();
    render(<BlockerFinderQuiz />);
    await user.click(screen.getByRole("button", { name: "Gmail / Google Workspace" }));
    expect(screen.getByText("Question 2 of 4")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(QUESTIONS[1].question);
  });

  it("shows CRITICAL and the top 5 tools in scoring order for 100+ a day", async () => {
    const user = userEvent.setup();
    render(<BlockerFinderQuiz />);
    await answerAll(user, ["Gmail / Google Workspace", "100+", "Cold outreach / sales pitches", "I just want it to work"]);
    expect(screen.getByText("THREAT LEVEL: CRITICAL")).toBeInTheDocument();
    const expected = scoreTools({ platform: "gmail", volume: "extreme", type: "sales", tech: "basic" });
    const names = screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent);
    expect(names).toEqual(expected.map((t) => t.name));
    expect(screen.getByText("TOP PICK")).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", expected[0].url);
    expect(links[0]).toHaveAttribute("target", "_blank");
  });

  it.each([
    ["50–100", "HIGH"],
    ["Under 20", "MODERATE"],
    ["20–50", "MODERATE"],
  ])("volume %s gives threat level %s", async (volume, level) => {
    const user = userEvent.setup();
    render(<BlockerFinderQuiz />);
    await answerAll(user, ["Apple Mail / iCloud", volume, "Phishing / scam attempts", "I build software"]);
    expect(screen.getByText(`THREAT LEVEL: ${level}`)).toBeInTheDocument();
  });

  it("Retake starts over at question 1", async () => {
    const user = userEvent.setup();
    render(<BlockerFinderQuiz />);
    await answerAll(user, ["Gmail / Google Workspace", "100+", "Cold outreach / sales pitches", "I just want it to work"]);
    await user.click(screen.getByRole("button", { name: "Retake Assessment" }));
    expect(screen.getByText("Question 1 of 4")).toBeInTheDocument();
  });
});

describe("scoreTools", () => {
  it("returns 5 tools sorted by score, highest first", () => {
    const res = scoreTools({ platform: "outlook", volume: "high", type: "newsletters", tech: "moderate" });
    expect(res).toHaveLength(5);
    for (let i = 1; i < res.length; i++) expect(res[i - 1].score).toBeGreaterThanOrEqual(res[i].score);
  });
});
