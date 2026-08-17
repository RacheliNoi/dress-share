"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import DressCard from "@/components/DressCard";
import { Dress, getApprovedDresses } from "@/lib/api";

export default function CatalogPage() {
  const [dresses, setDresses] = useState<Dress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadDresses() {
    try {
      setLoading(true);
      setError("");

      const data = await getApprovedDresses();
      setDresses(data);
    } catch {
      setError("לא הצלחנו לטעון את הקטלוג. נסי שוב.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDresses();
  }, []);

  return (
    <main dir="rtl" className="min-h-screen bg-[#faf9f7] text-zinc-900">
      <Header />

      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:py-14">
        {/* Hero */}
        <section className="relative mb-10 overflow-hidden rounded-[2rem] bg-zinc-900 px-7 py-10 text-white shadow-xl sm:px-10 lg:px-14 lg:py-14">
          <div className="relative z-10 max-w-2xl">
            <div className="mb-4 inline-flex items-center rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-medium text-white/80 backdrop-blur">
              ✦ קטלוג שמלות להשכרה
            </div>

            <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
              שמלה לכל אירוע,
              <br />
              <span className="text-rose-300">בלי לקנות.</span>
            </h1>

            <p className="mt-5 max-w-xl text-base leading-7 text-zinc-300 sm:text-lg">
              עיינו במבחר השמלות המאושרות שלנו להשכרה, ומצאו את
              השמלה המושלמת לאירוע הבא שלכם.
            </p>
          </div>

          <div className="pointer-events-none absolute -left-20 -top-32 h-80 w-80 rounded-full bg-rose-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-40 right-1/3 h-96 w-96 rounded-full bg-purple-400/10 blur-3xl" />

          <div className="pointer-events-none absolute bottom-0 left-8 hidden opacity-10 lg:block">
            <svg
              width="260"
              height="260"
              viewBox="0 0 260 260"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="130" cy="130" r="112" stroke="white" strokeWidth="1" />
              <circle cx="130" cy="130" r="82" stroke="white" strokeWidth="1" />
              <circle cx="130" cy="130" r="52" stroke="white" strokeWidth="1" />
            </svg>
          </div>
        </section>

        {/* Catalog controls */}
        <section className="mb-6 flex flex-col gap-4 sm:mb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-sm font-medium text-rose-500">
              הקטלוג שלנו
            </p>

            <h2 className="text-2xl font-black tracking-tight text-zinc-900 sm:text-3xl">
              שמלות זמינות להשכרה
            </h2>

            <p className="mt-2 text-sm text-zinc-500">
              כל השמלות שאושרו ומוכנות להשכרה.
            </p>
          </div>

          {!loading && dresses.length > 0 && (
            <div className="flex items-center gap-2 self-start rounded-full bg-white px-4 py-2.5 text-sm shadow-sm ring-1 ring-zinc-200/70 sm:self-auto">
              <span className="font-bold text-zinc-900">
                {dresses.length}
              </span>
              <span className="text-zinc-500">
                {dresses.length === 1 ? "שמלה" : "שמלות"}
              </span>
            </div>
          )}
        </section>

        {/* Error */}
        {error && (
          <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-2">
              <span aria-hidden>⚠</span>
              {error}
            </span>

            <button
              type="button"
              onClick={loadDresses}
              className="self-start rounded-full border border-red-200 px-4 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-100 sm:self-auto"
            >
              נסי שוב
            </button>
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
            {Array.from({ length: 8 }).map((_, item) => (
              <div
                key={item}
                className="overflow-hidden rounded-[1.5rem] bg-white ring-1 ring-zinc-200/60 sm:rounded-[1.75rem]"
              >
                <div className="aspect-[3/4] w-full animate-pulse bg-zinc-200" />

                <div className="space-y-3 p-4 sm:p-5">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-200" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-zinc-100" />
                  <div className="h-6 w-1/2 animate-pulse rounded bg-zinc-100" />
                </div>
              </div>
            ))}
          </div>
        ) : dresses.length === 0 ? (
          /* Empty state */
          <section className="rounded-[2rem] border border-dashed border-zinc-300 bg-white px-6 py-16 text-center shadow-sm sm:py-20">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-rose-50 via-zinc-50 to-purple-50 text-4xl">
              👗
            </div>

            <h3 className="mt-6 text-xl font-black text-zinc-900 sm:text-2xl">
              עדיין אין שמלות בקטלוג
            </h3>

            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-500">
              ברגע ששמלות יאושרו הן יופיעו כאן.
            </p>
          </section>
        ) : (
          /* Dress grid */
          <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
            {dresses.map((dress, index) => (
              <DressCard
                key={dress.id}
                dress={dress}
                style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
