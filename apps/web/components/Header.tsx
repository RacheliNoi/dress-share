"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUser, logout } from "@/lib/auth";
import type { AuthUser } from "@/lib/api";

export default function Header() {
  const router = useRouter();
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setUserState(getUser());
    setMounted(true);
  }, []);

  function handleLogout() {
    logout();
    setUserState(null);
    router.push("/login");
  }

  return (
    <header
      dir="rtl"
      className="sticky top-0 z-20 border-b border-zinc-200/70 bg-white/90 backdrop-blur"
    >
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-10">
          <Link href="/" className="block">
            <div className="text-xl font-black tracking-tight text-zinc-900">
              Dress<span className="text-rose-500">Share</span>
            </div>
            <div className="text-[10px] font-medium tracking-[0.2em] text-zinc-400">
              DRESS RENTAL
            </div>
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-medium text-zinc-500 md:flex">
            <Link href="/" className="transition hover:text-rose-500">
              קטלוג
            </Link>

            {mounted && user && (
              <>
                <Link
                  href="/wardrobe"
                  className="transition hover:text-rose-500"
                >
                  הארון שלי
                </Link>
                <Link
                  href="/dresses"
                  className="transition hover:text-rose-500"
                >
                  השמלות שלי
                </Link>
              </>
            )}

            {mounted && user?.role === "ADMIN" && (
              <Link
                href="/admin"
                className="font-bold text-rose-500 transition hover:text-rose-600"
              >
                ניהול
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {mounted && user ? (
            <>
              <span className="hidden text-sm text-zinc-600 sm:block">
                שלום, {user.name || user.email}
              </span>

              <Link
                href="/account"
                className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50"
              >
                שינוי סיסמה
              </Link>

              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50"
              >
                התנתקות
              </button>
            </>
          ) : mounted ? (
            <>
              <Link
                href="/login"
                className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50"
              >
                התחברות
              </Link>

              <Link
                href="/register"
                className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-zinc-700"
              >
                הרשמה
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
