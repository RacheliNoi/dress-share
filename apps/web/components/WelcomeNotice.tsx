"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { consumeWelcomeNoticePending } from "@/lib/auth";

// Mounted once in the root layout (app/layout.tsx), so it persists across
// client-side navigations rather than remounting per page - a plain
// mount-only effect would therefore only ever run once, before any login
// could have happened. Depending on `pathname` instead makes the check
// re-run on every real navigation (including the router.push right after a
// successful login/register), while a same-page re-render never triggers
// it - exactly "after login/register, not on every render".
export default function WelcomeNotice() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (consumeWelcomeNoticePending()) {
      setVisible(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!visible) {
    return null;
  }

  function dismiss() {
    setVisible(false);
  }

  return (
    <div
      dir="rtl"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4 sm:inset-x-auto sm:bottom-6 sm:left-6 sm:justify-start sm:px-0 sm:pb-0"
    >
      <div className="animate-fade-scale-in w-full max-w-sm rounded-2xl bg-white p-5 shadow-[0_20px_45px_-15px_rgba(24,24,27,0.25)] ring-1 ring-zinc-200/70">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-black text-zinc-900">
            כמה דברים שכדאי לדעת
          </h2>

          <button
            type="button"
            onClick={dismiss}
            aria-label="סגירת ההודעה"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
          >
            ✕
          </button>
        </div>

        <div className="mt-3 space-y-3 text-sm leading-6 text-zinc-600">
          <div className="flex gap-2.5">
            <span className="mt-0.5 text-base" aria-hidden>
              🛡️
            </span>
            <p>
              במערכת שלנו כל עדכון של שמלה מחייב אישור מנהל לפני שהוא הופך
              לפעיל.
            </p>
          </div>

          <div className="flex gap-2.5">
            <span className="mt-0.5 text-base" aria-hidden>
              💳
            </span>
            <p>
              בעת סגירת השכרה ייגבה מהמשכיר אחוז מסוים כדמי שימוש במערכת.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="mt-4 w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-zinc-700"
        >
          הבנתי, תודה
        </button>
      </div>
    </div>
  );
}
