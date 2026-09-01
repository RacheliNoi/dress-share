"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getUser, logout } from "@/lib/auth";
import type { AuthUser } from "@/lib/api";

// Temporarily hides the "הארון שלי" (wardrobe) nav link from the header
// without touching the /wardrobe route, its page, or the clothing-items
// API - the feature stays fully intact and reachable by direct URL, just
// not promoted in navigation. Flip back to true to restore the nav link.
const SHOW_WARDROBE_LINK = false;

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setUserState(getUser());
    setMounted(true);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  function handleLogout() {
    logout();
    setUserState(null);
    setMenuOpen(false);
    router.push("/login");
  }

  const navLinkClass = "transition hover:text-accent";

  return (
    <header
      dir="rtl"
      className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur"
    >
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-4 sm:gap-10">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? "סגירת התפריט" : "פתיחת התפריט"}
            aria-expanded={menuOpen}
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition hover:bg-surface-sunken md:hidden"
          >
            {menuOpen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>

          <Link href="/" className="block">
            <div className="font-display text-xl font-semibold tracking-tight text-ink">
              Dress<span className="text-accent">Share</span>
            </div>
            <div className="text-[10px] font-medium tracking-[0.2em] text-ink-faint">
              DRESS RENTAL
            </div>
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-medium text-ink-soft md:flex">
            <Link href="/" className={navLinkClass}>
              קטלוג
            </Link>

            {mounted && user && (
              <>
                {SHOW_WARDROBE_LINK && (
                  <Link href="/wardrobe" className={navLinkClass}>
                    הארון שלי
                  </Link>
                )}
                <Link href="/dresses" className={navLinkClass}>
                  השמלות שלי
                </Link>
                <Link href="/my-requests" className={navLinkClass}>
                  הבקשות שלי
                </Link>
              </>
            )}

            {mounted && user?.role === "ADMIN" && (
              <Link
                href="/admin"
                className="font-bold text-accent transition hover:text-accent-deep"
              >
                ניהול
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {mounted && user ? (
            <>
              <span className="hidden text-sm text-ink-soft sm:block">
                שלום, {user.name || user.email}
              </span>

              <Link
                href="/account"
                className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink-soft transition hover:border-line-strong hover:bg-surface-sunken"
              >
                שינוי סיסמה
              </Link>

              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink-soft transition hover:border-line-strong hover:bg-surface-sunken"
              >
                התנתקות
              </button>
            </>
          ) : mounted ? (
            <>
              <Link
                href="/login"
                className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink-soft transition hover:border-line-strong hover:bg-surface-sunken"
              >
                התחברות
              </Link>

              <Link
                href="/register"
                className="rounded-full bg-ink px-4 py-2 text-sm font-bold text-white transition hover:bg-ink/80"
              >
                הרשמה
              </Link>
            </>
          ) : null}
        </div>
      </div>

      {menuOpen && (
        <nav
          dir="rtl"
          className="flex flex-col gap-1 border-t border-line bg-surface px-5 py-3 text-sm font-medium text-ink-soft md:hidden"
        >
          <Link href="/" className="rounded-xl px-3 py-2.5 transition hover:bg-surface-sunken hover:text-accent">
            קטלוג
          </Link>

          {mounted && user && (
            <>
              {SHOW_WARDROBE_LINK && (
                <Link href="/wardrobe" className="rounded-xl px-3 py-2.5 transition hover:bg-surface-sunken hover:text-accent">
                  הארון שלי
                </Link>
              )}
              <Link href="/dresses" className="rounded-xl px-3 py-2.5 transition hover:bg-surface-sunken hover:text-accent">
                השמלות שלי
              </Link>
              <Link href="/my-requests" className="rounded-xl px-3 py-2.5 transition hover:bg-surface-sunken hover:text-accent">
                הבקשות שלי
              </Link>
            </>
          )}

          {mounted && user?.role === "ADMIN" && (
            <Link href="/admin" className="rounded-xl px-3 py-2.5 font-bold text-accent transition hover:bg-surface-sunken">
              ניהול
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}
