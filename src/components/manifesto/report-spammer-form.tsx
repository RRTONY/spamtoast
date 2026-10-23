"use client";

import { useState } from "react";
import { ErrorMessage, Field, Form, Formik } from "formik";
import * as Yup from "yup";
import { AlertTriangle, Send, CheckCircle, Loader2 } from "lucide-react";
import { GlassCard } from "@/components/manifesto/manifesto-ui";
import { submitSpamReport } from "@/app/forms/actions";
import { FormError, mailtoHref } from "@/components/forms/form-error";

// Ported from legacy client/src/pages/manifesto/AttentionTheft.tsx's
// "Report A Spammer" form, by way of tonygreenberg.com. Reports are emailed
// to Tony (`submitSpamReport` in src/app/forms/actions.ts; no database);
// he decides who goes on the Wall of Shame. If sending fails, the error
// offers a pre-filled email to Tony instead. Real field set and validation
// rules unchanged; option values match legacy's spam_reports enums.
const CONTACT_EMAIL = "tony@tonygreenberg.com";

const SPAM_TYPES = [
  { value: "cold-outreach", label: "Cold Outreach / Sales Pitch" },
  { value: "unsolicited-newsletter", label: "Unsolicited Newsletter" },
  { value: "ai-generated-spam", label: "AI-Generated Personalized Spam" },
  { value: "phishing-scam", label: "Phishing / Scam" },
];

const FREQUENCIES = [
  { value: "one-time", label: "One-time" },
  { value: "weekly", label: "Weekly" },
  { value: "daily", label: "Daily" },
  { value: "multiple-daily", label: "Multiple times per day" },
];

const schema = Yup.object({
  companyName: Yup.string().trim().max(256).required("Required"),
  senderEmail: Yup.string().trim().email("Valid email required").max(320).required("Valid email required"),
  spamType: Yup.string().required("Required"),
  frequency: Yup.string().required("Required"),
  description: Yup.string().trim().min(10, "At least 10 characters").max(5000).required("At least 10 characters"),
  yourEmail: Yup.string().trim().email("Valid email required").max(320),
  website: Yup.string(),
});

type Values = Yup.InferType<typeof schema>;
const INITIAL: Values = { companyName: "", senderEmail: "", spamType: "", frequency: "", description: "", yourEmail: "", website: "" };

const inputClass = "w-full rounded-xl border border-black/10 bg-white/60 px-4 py-3.5 text-base text-crusade-ink outline-none focus:border-crusade-red/50 focus:ring-2 focus:ring-crusade-red/20";
const errorClass = "mt-1 text-[0.8rem] text-crusade-red";

export function ReportSpammerForm() {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState("");

  if (submitted) {
    return (
      <GlassCard variant="teal" glow className="mx-auto max-w-lg text-center">
        <CheckCircle size={56} className="mx-auto mb-4 text-crusade-teal" />
        <h3 className="mb-2 font-heading text-2xl font-bold text-crusade-ink">Report Filed</h3>
        <p className="mb-6 text-base leading-relaxed text-crusade-muted">
          Your report went straight to Tony. Every report makes the economics of spam worse for the attacker.
        </p>
        <button
          onClick={() => {
            setSubmitted(false);
            setError(null);
          }}
          className="rounded-xl bg-crusade-teal px-5 py-3 text-sm font-bold text-black transition-transform hover:-translate-y-0.5"
        >
          Report Another
        </button>
      </GlassCard>
    );
  }

  return (
    <Formik<Values>
      initialValues={INITIAL}
      validationSchema={schema}
      onSubmit={async (v) => {
        setError(null);
        const res = await submitSpamReport({ ...v, reporterEmail: v.yourEmail }).catch(() => ({ ok: false, error: "This couldn't be saved just now." }));
        if (res.ok) return setSubmitted(true);
        setError(res.error ?? "Something went wrong.");
        const spamTypeLabel = SPAM_TYPES.find((t) => t.value === v.spamType)?.label ?? v.spamType;
        const freqLabel = FREQUENCIES.find((f) => f.value === v.frequency)?.label ?? v.frequency;
        setFallback(
          mailtoHref(CONTACT_EMAIL, `Spam report: ${v.companyName}`, [
            `Company / sender: ${v.companyName}`,
            `Sender email: ${v.senderEmail}`,
            `Type: ${spamTypeLabel}`,
            `Frequency: ${freqLabel}`,
            "",
            "What happened:",
            v.description,
            "",
            `Reporter email: ${v.yourEmail || "(not provided)"}`,
          ]),
        );
      }}
    >
      {({ isSubmitting }) => (
        <Form noValidate className="space-y-5">
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-crusade-red/12 bg-crusade-red/6 p-4">
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-crusade-red" />
            <p className="text-sm leading-relaxed text-crusade-brown">
              This sends a report straight to Tony. Only submit factual information about actual spam you have received.
            </p>
          </div>

          <GlassCard>
            <div className="space-y-5">
              <div>
                <label htmlFor="spam-company" className="mb-1.5 block text-sm font-bold text-crusade-ink">
                  Company / Sender Name <span className="text-crusade-red">*</span>
                </label>
                <Field id="spam-company" type="text" name="companyName" maxLength={256} placeholder="e.g., Forward Medical, Apollo.io" className={inputClass} />
                <ErrorMessage name="companyName" component="p" className={errorClass} />
              </div>
              <div>
                <label htmlFor="spam-sender" className="mb-1.5 block text-sm font-bold text-crusade-ink">
                  Sender Email Address <span className="text-crusade-red">*</span>
                </label>
                <Field id="spam-sender" type="email" name="senderEmail" maxLength={320} placeholder="e.g., outreach@spamcompany.com" className={inputClass} />
                <ErrorMessage name="senderEmail" component="p" className={errorClass} />
              </div>
              <div>
                <label htmlFor="spam-type" className="mb-1.5 block text-sm font-bold text-crusade-ink">
                  Type of Spam <span className="text-crusade-red">*</span>
                </label>
                <Field as="select" id="spam-type" name="spamType" className={inputClass}>
                  <option value="">Select type...</option>
                  {SPAM_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Field>
                <ErrorMessage name="spamType" component="p" className={errorClass} />
              </div>
              <div>
                <label htmlFor="spam-frequency" className="mb-1.5 block text-sm font-bold text-crusade-ink">
                  How Often? <span className="text-crusade-red">*</span>
                </label>
                <Field as="select" id="spam-frequency" name="frequency" className={inputClass}>
                  <option value="">Select frequency...</option>
                  {FREQUENCIES.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </Field>
                <ErrorMessage name="frequency" component="p" className={errorClass} />
              </div>
              <div>
                <label htmlFor="spam-description" className="mb-1.5 block text-sm font-bold text-crusade-ink">
                  What Happened? <span className="text-crusade-red">*</span>
                </label>
                <Field
                  as="textarea"
                  id="spam-description"
                  name="description"
                  maxLength={5000}
                  placeholder="Describe the spam. Include notable details — fake personalization? Ignored unsubscribe? AI-generated?"
                  rows={4}
                  className={`${inputClass} resize-y`}
                />
                <ErrorMessage name="description" component="p" className={errorClass} />
              </div>
              <div>
                <label htmlFor="spam-your-email" className="mb-1.5 block text-sm font-bold text-crusade-ink">
                  Your Email <span className="text-xs font-normal opacity-70">(optional)</span>
                </label>
                <Field id="spam-your-email" type="email" name="yourEmail" autoComplete="email" maxLength={320} placeholder="your@email.com" className={inputClass} />
                <ErrorMessage name="yourEmail" component="p" className={errorClass} />
              </div>
              <Field name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
            </div>
          </GlassCard>

          {error && <FormError error={error} mailto={fallback} className="text-center text-sm text-crusade-ink" />}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-crusade-red px-6 py-4 text-lg font-bold text-white shadow-[0_0_30px_rgba(200,22,26,0.4)] transition-transform hover:-translate-y-1 disabled:opacity-70"
          >
            {isSubmitting ? <Loader2 aria-hidden="true" className="size-5 animate-spin" /> : <Send size={20} />} File Charges
          </button>
        </Form>
      )}
    </Formik>
  );
}
