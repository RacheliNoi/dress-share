export default function PhotoGuidelineNotice() {
  return (
    <div className="mt-6 flex items-start gap-3 rounded-xl border border-accent-soft-strong bg-accent-soft/40 px-4 py-3.5 text-sm text-accent-deep">
      <svg
        className="mt-0.5 h-5 w-5 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <path d="M12 3a2 2 0 0 1 2 2 2 2 0 0 1-2 2v0" />
        <path d="M12 7 3 13a2 2 0 0 0 1 3.7h16A2 2 0 0 0 21 13l-9-6Z" />
      </svg>

      <p>
        <b className="font-bold">חשוב:</b> יש לצלם את השמלה כשהיא תלויה על
        קולב, לא לבושה על הגוף — כך התמונה נגישה לכל הגולשות, כולל מי שמשתמשת
        בסינון תוכן. <b className="font-bold">תמונה שבה השמלה לבושה על גוף לא
        תאושר ולא תעלה לקטלוג הציבורי.</b>
      </p>
    </div>
  );
}
