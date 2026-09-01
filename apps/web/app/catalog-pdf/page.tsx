"use client";

import { useEffect, useState } from "react";
import { ApiError, Dress, getApprovedDresses, getDressImageUrl } from "@/lib/api";

function getPriceRange(dress: Dress): string | null {
  if (dress.sizes.length === 0) {
    return null;
  }

  const prices = dress.sizes.map((size) => size.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);

  return min === max ? `${min} ₪` : `${min}–${max} ₪`;
}

// A dedicated, minimal page - deliberately NOT reusing <Header/> (its
// navigation/login UI has no meaning on a printed page or in a saved PDF)
// or the catalog's card grid (a PDF needs one column, visible link text,
// and print-safe page breaks, none of which the on-screen grid needs).
// Intended to be opened, then printed/"saved as PDF" via the browser's own
// print dialog - the browser's real text engine handles Hebrew/RTL shaping
// correctly, and Chrome-based "print to PDF" preserves <a href> as real
// clickable links in the resulting PDF, which is the whole point of this
// page for someone who can't reach the live site directly.
export default function CatalogPdfPage() {
  const [dresses, setDresses] = useState<Dress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [siteOrigin, setSiteOrigin] = useState("");

  useEffect(() => {
    setSiteOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError("");

        // No params = the full, unpaginated approved catalog (same
        // precedent as getApprovedDressById and the filter-options fetch
        // on the main catalog page) - a downloadable catalog should be
        // complete, not scoped to whatever page/filters were active.
        const { dresses: data } = await getApprovedDresses();

        if (!cancelled) {
          setDresses(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "לא הצלחנו לטעון את הקטלוג. נסי שוב.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const generatedAt = new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());

  return (
    <main dir="rtl" className="min-h-screen bg-white px-6 py-8 text-zinc-900 print:p-0">
      <style>{`
        @media print {
          @page { margin: 14mm 12mm; }
          .no-print { display: none !important; }
          .dress-row { break-inside: avoid; }
        }
      `}</style>

      <div className="no-print mb-8 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-5">
        <div>
          <h1 className="text-xl font-black text-zinc-900">
            קטלוג להדפסה / שמירה כ-PDF
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            לחצי על הכפתור ובחלון ההדפסה בחרי &quot;שמירה כ-PDF&quot;
            (Save as PDF) כדי להוריד את הקטלוג כקובץ.
          </p>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-bold text-white transition hover:bg-zinc-700"
        >
          הדפסה / שמירה כ-PDF
        </button>
      </div>

      <header className="mb-8">
        <h1 className="text-2xl font-black text-zinc-900">
          DressShare — קטלוג שמלות להשכרה
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          הופק ב-{generatedAt} · {dresses.length} שמלות
        </p>
      </header>

      {error ? (
        <p className="no-print text-sm text-error">{error}</p>
      ) : loading ? (
        <p className="no-print text-sm text-zinc-400">טוענת את הקטלוג...</p>
      ) : dresses.length === 0 ? (
        <p className="text-sm text-zinc-400">אין כרגע שמלות בקטלוג.</p>
      ) : (
        <div className="space-y-6">
          {dresses.map((dress) => {
            const photo = [...dress.photos].sort(
              (a, b) => a.sortOrder - b.sortOrder,
            )[0];
            const priceRange = getPriceRange(dress);
            const dressUrl = siteOrigin ? `${siteOrigin}/dress/${dress.id}` : "";

            return (
              <div
                key={dress.id}
                className="dress-row flex gap-5 border-b border-zinc-200 pb-6"
              >
                <div className="h-32 w-32 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                  {photo ? (
                    <img
                      src={getDressImageUrl(photo)}
                      alt={dress.name}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>

                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold text-zinc-900">{dress.name}</h2>

                  <p className="mt-1 text-sm text-zinc-500">
                    {dress.category || "ללא קטגוריה"}
                    {dress.color && ` · ${dress.color}`}
                    {priceRange && ` · ${priceRange}`}
                  </p>

                  {dressUrl && (
                    <p className="mt-2 text-sm">
                      <a
                        href={dressUrl}
                        className="font-semibold text-accent underline"
                      >
                        לצפייה ולהשכרה: {dressUrl}
                      </a>
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
