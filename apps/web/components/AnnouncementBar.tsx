"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isAuthenticated } from "@/lib/auth";

const DISMISS_KEY = "dressshare_launch_announcement_dismissed";

// Starts hidden on every render (including the very first, pre-hydration
// one) and only turns on from an effect after mount - reading localStorage
// during the initial render would disagree with what a first server-side
// render produces (no localStorage there), which is a hydration mismatch.
// Same reasoning as checkingAuth on the favorites page.
export default function AnnouncementBar() {
  const [visible, setVisible] = useState(false);
  const [ctaHref, setCtaHref] = useState("/register");

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) !== "1") {
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }

    setCtaHref(isAuthenticated() ? "/dresses/new" : "/register");
  }, []);

  function dismiss() {
    setVisible(false);

    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Nothing to do - worst case it shows again next visit.
    }
  }

  if (!visible) {
    return null;
  }

  return (
    <div
      dir="rtl"
      className="relative flex flex-wrap items-center justify-center gap-3 bg-accent-deep px-12 py-2.5 text-center text-sm text-white"
    >
      <span className="font-medium">
        האתר כרגע בהרצה — הצטרפו כמשכירות והעלו שמלות בחינם!
      </span>

      <Link
        href={ctaHref}
        className="inline-flex shrink-0 rounded-full bg-white px-3.5 py-1 text-xs font-bold text-accent-deep transition hover:bg-accent-soft"
      >
        הצטרפות
      </Link>

      <button
        type="button"
        onClick={dismiss}
        aria-label="סגירת ההודעה"
        className="absolute left-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          aria-hidden
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
