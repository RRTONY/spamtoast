import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReportSpammerForm } from "@/components/manifesto/report-spammer-form";
import { submitSpamReport } from "@/app/forms/actions";

vi.mock("@/app/forms/actions", () => ({ submitSpamReport: vi.fn() }));
const submit = vi.mocked(submitSpamReport);

const DESC = "Five emails a day, fake personalization, ignored unsubscribe.";
const fileButton = () => screen.getByRole("button", { name: /File Charges/ });

async function fill(user: ReturnType<typeof userEvent.setup>, yourEmail = "") {
  await user.type(screen.getByLabelText(/Company \/ Sender Name/), "Spamco");
  await user.type(screen.getByLabelText(/Sender Email Address/), "out@spamco.com");
  await user.selectOptions(screen.getByLabelText(/Type of Spam/), "ai-generated-spam");
  await user.selectOptions(screen.getByLabelText(/How Often/), "daily");
  await user.type(screen.getByLabelText(/What Happened/), DESC);
  if (yourEmail) await user.type(screen.getByLabelText(/Your Email/), yourEmail);
}

describe("ReportSpammerForm", () => {
  beforeEach(() => {
    submit.mockResolvedValue({ ok: true });
  });

  it("shows the required messages and sends nothing when empty", async () => {
    const user = userEvent.setup();
    render(<ReportSpammerForm />);
    await user.click(fileButton());
    expect(await screen.findAllByText("Required")).toHaveLength(3);
    expect(screen.getByText("Valid email required")).toBeInTheDocument();
    expect(screen.getByText("At least 10 characters")).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects a bad optional email but accepts it left empty", async () => {
    const user = userEvent.setup();
    render(<ReportSpammerForm />);
    await fill(user, "nope");
    await user.click(fileButton());
    expect(await screen.findByText("Valid email required")).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText(/Your Email/));
    await user.click(fileButton());
    await vi.waitFor(() => expect(submit).toHaveBeenCalled());
  });

  it("sends exactly the report (your email as reporterEmail) and shows Report Filed", async () => {
    const user = userEvent.setup();
    render(<ReportSpammerForm />);
    await fill(user, "me@x.com");
    await user.click(fileButton());
    expect(await screen.findByRole("heading", { name: "Report Filed" })).toBeInTheDocument();
    expect(submit).toHaveBeenCalledWith({
      companyName: "Spamco",
      senderEmail: "out@spamco.com",
      spamType: "ai-generated-spam",
      frequency: "daily",
      description: DESC,
      yourEmail: "me@x.com",
      reporterEmail: "me@x.com",
      website: "",
    });
  });

  it("'Report Another' brings back an empty form", async () => {
    const user = userEvent.setup();
    render(<ReportSpammerForm />);
    await fill(user);
    await user.click(fileButton());
    await user.click(await screen.findByRole("button", { name: "Report Another" }));
    expect(screen.getByLabelText(/Company \/ Sender Name/)).toHaveValue("");
  });

  it("shows a spinner and disables the button while sending", async () => {
    let finish: (v: { ok: boolean }) => void = () => {};
    submit.mockImplementation(() => new Promise((r) => (finish = r)));
    const user = userEvent.setup();
    render(<ReportSpammerForm />);
    await fill(user);
    await user.click(fileButton());
    await vi.waitFor(() => expect(fileButton()).toBeDisabled());
    expect(fileButton().querySelector(".animate-spin")).not.toBeNull();
    finish({ ok: true });
    expect(await screen.findByRole("heading", { name: "Report Filed" })).toBeInTheDocument();
  });

  it("on failure offers a pre-filled email to Tony with the readable labels", async () => {
    submit.mockResolvedValue({ ok: false, error: "This couldn't be saved just now." });
    const user = userEvent.setup();
    render(<ReportSpammerForm />);
    await fill(user);
    await user.click(fileButton());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This couldn't be saved just now.");
    const href = screen.getByRole("link", { name: /email Tony directly/i }).getAttribute("href")!;
    expect(href.startsWith("mailto:tony@tonygreenberg.com?subject=")).toBe(true);
    const body = decodeURIComponent(href);
    expect(body).toContain("Spam report: Spamco");
    expect(body).toContain("Type: AI-Generated Personalized Spam");
    expect(body).toContain("Frequency: Daily");
    expect(body).toContain(DESC);
    expect(body).toContain("Reporter email: (not provided)");
  });

  it("treats a thrown server action like a failed save", async () => {
    submit.mockRejectedValue(new Error("network"));
    const user = userEvent.setup();
    render(<ReportSpammerForm />);
    await fill(user);
    await user.click(fileButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("This couldn't be saved just now.");
  });
});
