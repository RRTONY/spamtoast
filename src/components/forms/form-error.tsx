// The error line under a form that saves through src/app/forms/actions.ts.
// If saving fails, the visitor can still reach Tony: the link opens their
// email app with what they typed already filled in, so nothing is lost.
export function mailtoHref(to: string, subject: string, lines: (string | false | null | undefined)[]): string {
  const body = lines.filter((l): l is string => typeof l === "string" && l.trim() !== "").join("\n");
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function FormError({ error, mailto, className }: { error: string; mailto: string; className: string }) {
  return (
    <p role="alert" className={className}>
      {error}{" "}
      <a href={mailto} className="font-semibold underline underline-offset-2">
        Or email Tony directly.
      </a>
    </p>
  );
}
