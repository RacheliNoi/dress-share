"use client";

import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import DressCard from "@/components/DressCard";
import CatalogFilters, { SortOption } from "@/components/CatalogFilters";
import {
  Dress,
  DressAvailabilityEntry,
  getApprovedDresses,
  getDressAvailability,
} from "@/lib/api";

function getMinPrice(dress: Dress): number | null {
  if (dress.sizes.length === 0) {
    return null;
  }

  return Math.min(...dress.sizes.map((size) => size.price));
}

function uniqueSorted(values: (string | null)[]): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort(
    (a, b) => a.localeCompare(b, "he"),
  );
}

// Same inclusive-both-ends semantics as the backend and
// DressAvailabilityCalendar - a booking blocks the exact start/end days too.
function isDateBlocked(dateValue: string, entries: DressAvailabilityEntry[]): boolean {
  const target = new Date(`${dateValue}T00:00:00.000Z`).getTime();

  return entries.some((entry) => {
    const start = new Date(entry.startDate).getTime();
    const end = new Date(entry.endDate).getTime();
    return target >= start && target <= end;
  });
}

// Per-size breakdown for one date - `size: null` on an entry means either a
// no-size dress (whole-dress booking) or a booking made before per-size
// tracking existed, both treated as blocking every size (the conservative
// reading, matching the backend and DressAvailabilityCalendar).
function getBlockedSizesForDate(
  dateValue: string,
  entries: DressAvailabilityEntry[],
): { blockedSizes: Set<string>; wholeDressBlocked: boolean } {
  const target = new Date(`${dateValue}T00:00:00.000Z`).getTime();
  const blockedSizes = new Set<string>();
  let wholeDressBlocked = false;

  for (const entry of entries) {
    const start = new Date(entry.startDate).getTime();
    const end = new Date(entry.endDate).getTime();

    if (target < start || target > end) {
      continue;
    }

    if (entry.size === null) {
      wholeDressBlocked = true;
    } else {
      blockedSizes.add(entry.size);
    }
  }

  return { blockedSizes, wholeDressBlocked };
}

// A dress stays in the date-filtered catalog as long as at least one of its
// sizes is free on the chosen date - it's only excluded once every size (or
// the whole dress, for a no-size dress) is blocked.
function isDressAvailableOnDate(dress: Dress, dateValue: string, entries: DressAvailabilityEntry[]): boolean {
  if (dress.sizes.length === 0) {
    return !isDateBlocked(dateValue, entries);
  }

  const { blockedSizes, wholeDressBlocked } = getBlockedSizesForDate(dateValue, entries);

  if (wholeDressBlocked) {
    return false;
  }

  return dress.sizes.some((size) => !blockedSizes.has(size.size));
}

export default function CatalogPage() {
  const [dresses, setDresses] = useState<Dress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [sort, setSort] = useState<SortOption>("recommended");

  const [availabilityDate, setAvailabilityDate] = useState("");
  // Keyed by dressId - fetched lazily (only once a date is picked) and kept
  // for the rest of the session, so switching the date around never
  // re-fetches anything already known.
  const [availabilityCache, setAvailabilityCache] = useState<
    Record<number, DressAvailabilityEntry[]>
  >({});
  const [availabilityErrorIds, setAvailabilityErrorIds] = useState<Set<number>>(
    new Set(),
  );
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

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

  // Fetches per-dress availability (GET /bookings/dress/:id/availability -
  // the only public endpoint for this data) only for dresses not already in
  // the cache, and only once a date filter is actually active. Changing the
  // date itself never re-fetches anything already cached; only newly-seen
  // dress ids (e.g. after a catalog reload) trigger new requests.
  useEffect(() => {
    if (!availabilityDate) {
      return;
    }

    const missingIds = dresses
      .map((dress) => dress.id)
      .filter((id) => !(id in availabilityCache) && !availabilityErrorIds.has(id));

    if (missingIds.length === 0) {
      return;
    }

    let cancelled = false;
    setAvailabilityLoading(true);

    Promise.all(
      missingIds.map(async (id) => {
        try {
          const entries = await getDressAvailability(id);
          return { id, entries };
        } catch {
          // A single dress's availability failing to load must not break
          // the rest of the catalog - it's simply excluded from the
          // date-filtered cache and left visible (fails open).
          return { id, entries: null as DressAvailabilityEntry[] | null };
        }
      }),
    ).then((results) => {
      if (cancelled) {
        return;
      }

      setAvailabilityCache((prev) => {
        const next = { ...prev };
        for (const result of results) {
          if (result.entries) {
            next[result.id] = result.entries;
          }
        }
        return next;
      });

      setAvailabilityErrorIds((prev) => {
        const next = new Set(prev);
        for (const result of results) {
          if (!result.entries) {
            next.add(result.id);
          }
        }
        return next;
      });

      setAvailabilityLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [availabilityDate, dresses, availabilityCache, availabilityErrorIds]);

  const categories = useMemo(
    () => uniqueSorted(dresses.map((dress) => dress.category)),
    [dresses],
  );
  const colors = useMemo(
    () => uniqueSorted(dresses.map((dress) => dress.color)),
    [dresses],
  );
  const sizes = useMemo(
    () =>
      uniqueSorted(dresses.flatMap((dress) => dress.sizes.map((size) => size.size))),
    [dresses],
  );
  const priceBounds = useMemo(() => {
    const prices = dresses.flatMap((dress) => dress.sizes.map((size) => size.price));

    if (prices.length === 0) {
      return null;
    }

    return { min: Math.min(...prices), max: Math.max(...prices) };
  }, [dresses]);

  const priceMinValue = priceMin.trim() === "" ? null : Number(priceMin);
  const priceMaxValue = priceMax.trim() === "" ? null : Number(priceMax);

  const filteredDresses = useMemo(() => {
    let result = dresses;

    const query = search.trim().toLowerCase();
    if (query) {
      result = result.filter((dress) => {
        const haystack = [dress.name, dress.category, dress.color, dress.description]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(query);
      });
    }

    if (selectedCategory) {
      result = result.filter((dress) => dress.category === selectedCategory);
    }

    if (selectedColor) {
      result = result.filter((dress) => dress.color === selectedColor);
    }

    if (selectedSize) {
      result = result.filter((dress) =>
        dress.sizes.some((size) => size.size === selectedSize),
      );
    }

    if (priceMinValue !== null || priceMaxValue !== null) {
      result = result.filter((dress) =>
        dress.sizes.some((size) => {
          if (priceMinValue !== null && size.price < priceMinValue) return false;
          if (priceMaxValue !== null && size.price > priceMaxValue) return false;
          return true;
        }),
      );
    }

    if (availabilityDate) {
      result = result.filter((dress) => {
        const entries = availabilityCache[dress.id];
        // Not loaded yet (or failed to load) - fail open rather than
        // hiding a dress we simply don't have an answer for yet.
        if (!entries) return true;
        return isDressAvailableOnDate(dress, availabilityDate, entries);
      });
    }

    return result;
  }, [
    dresses,
    search,
    selectedCategory,
    selectedColor,
    selectedSize,
    priceMinValue,
    priceMaxValue,
    availabilityDate,
    availabilityCache,
  ]);

  // For dresses that stay in the results (>= 1 free size), this drives the
  // per-size available/blocked chip styling on each DressCard.
  const sizeAvailabilityByDressId = useMemo(() => {
    if (!availabilityDate) {
      return null;
    }

    const map = new Map<number, { available: string[]; blocked: string[] }>();

    for (const dress of dresses) {
      if (dress.sizes.length === 0) {
        continue;
      }

      const entries = availabilityCache[dress.id];

      if (!entries) {
        continue;
      }

      const { blockedSizes, wholeDressBlocked } = getBlockedSizesForDate(
        availabilityDate,
        entries,
      );

      map.set(dress.id, {
        available: wholeDressBlocked
          ? []
          : dress.sizes.filter((size) => !blockedSizes.has(size.size)).map((size) => size.size),
        blocked: wholeDressBlocked
          ? dress.sizes.map((size) => size.size)
          : dress.sizes.filter((size) => blockedSizes.has(size.size)).map((size) => size.size),
      });
    }

    return map;
  }, [availabilityDate, availabilityCache, dresses]);

  const sortedDresses = useMemo(() => {
    if (sort === "recommended") {
      return filteredDresses;
    }

    const result = [...filteredDresses];

    if (sort === "newest") {
      result.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      return result;
    }

    const direction = sort === "price-asc" ? 1 : -1;
    result.sort((a, b) => {
      const priceA = getMinPrice(a);
      const priceB = getMinPrice(b);

      if (priceA === null && priceB === null) return 0;
      if (priceA === null) return 1;
      if (priceB === null) return -1;

      return (priceA - priceB) * direction;
    });

    return result;
  }, [filteredDresses, sort]);

  const hasActiveFilters = Boolean(
    search.trim() ||
      selectedCategory ||
      selectedColor ||
      selectedSize ||
      priceMinValue !== null ||
      priceMaxValue !== null ||
      availabilityDate,
  );

  function resetFilters() {
    setSearch("");
    setSelectedCategory("");
    setSelectedColor("");
    setSelectedSize("");
    setPriceMin("");
    setPriceMax("");
    setAvailabilityDate("");
  }

  const chips = [
    search.trim() && {
      key: "search",
      label: `"${search.trim()}"`,
      onRemove: () => setSearch(""),
    },
    selectedCategory && {
      key: "category",
      label: selectedCategory,
      onRemove: () => setSelectedCategory(""),
    },
    selectedColor && {
      key: "color",
      label: selectedColor,
      onRemove: () => setSelectedColor(""),
    },
    selectedSize && {
      key: "size",
      label: `מידה ${selectedSize}`,
      onRemove: () => setSelectedSize(""),
    },
    (priceMinValue !== null || priceMaxValue !== null) && {
      key: "price",
      label:
        priceMinValue !== null && priceMaxValue !== null
          ? `${priceMinValue}–${priceMaxValue} ₪`
          : priceMinValue !== null
            ? `מ־${priceMinValue} ₪`
            : `עד ${priceMaxValue} ₪`,
      onRemove: () => {
        setPriceMin("");
        setPriceMax("");
      },
    },
    availabilityDate && {
      key: "availability",
      label: `זמינה ב־${new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(`${availabilityDate}T00:00:00.000Z`))}`,
      onRemove: () => setAvailabilityDate(""),
    },
  ].filter((chip): chip is { key: string; label: string; onRemove: () => void } =>
    Boolean(chip),
  );

  function scrollToCatalog() {
    document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[#faf9f7] text-zinc-900">
      <Header />

      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-10">
        {/* Hero */}
        <section className="relative mb-8 overflow-hidden rounded-[2rem] bg-zinc-900 px-7 py-9 text-white shadow-xl sm:px-10 lg:px-14 lg:py-11">
          <div className="relative z-10 max-w-2xl">
            <div className="mb-4 inline-flex items-center rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-medium text-white/80 backdrop-blur">
              ✦ קטלוג שמלות להשכרה
            </div>

            <h1 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
              שמלה לכל אירוע,
              <br />
              <span className="text-rose-300">בלי לקנות.</span>
            </h1>

            <p className="mt-4 max-w-xl text-base leading-7 text-zinc-300">
              עיינו במבחר השמלות המאושרות שלנו להשכרה, ומצאו את
              השמלה המושלמת לאירוע הבא שלכם.
            </p>

            <button
              type="button"
              onClick={scrollToCatalog}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-zinc-900 transition hover:-translate-y-0.5 hover:bg-rose-50"
            >
              לצפייה בקטלוג
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                aria-hidden
              >
                <path d="M12 5v14M5 12l7 7 7-7" />
              </svg>
            </button>
          </div>

          <div className="pointer-events-none absolute -left-20 -top-32 h-80 w-80 rounded-full bg-rose-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-40 right-1/3 h-96 w-96 rounded-full bg-purple-400/10 blur-3xl" />

          <div className="pointer-events-none absolute bottom-0 left-8 hidden opacity-10 lg:block">
            <svg
              width="220"
              height="220"
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

        <div id="catalog" className="scroll-mt-24">
          {/* Catalog heading */}
          <section className="mb-5">
            <p className="mb-2 text-sm font-medium text-rose-500">הקטלוג שלנו</p>

            <h2 className="text-2xl font-black tracking-tight text-zinc-900 sm:text-3xl">
              שמלות זמינות להשכרה
            </h2>

            <p className="mt-2 text-sm text-zinc-500">
              כל השמלות שאושרו ומוכנות להשכרה.
            </p>
          </section>

          {!loading && dresses.length > 0 && (
            <CatalogFilters
              search={search}
              onSearchChange={setSearch}
              categories={categories}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
              colors={colors}
              selectedColor={selectedColor}
              onColorChange={setSelectedColor}
              sizes={sizes}
              selectedSize={selectedSize}
              onSizeChange={setSelectedSize}
              priceMin={priceMin}
              priceMax={priceMax}
              onPriceMinChange={setPriceMin}
              onPriceMaxChange={setPriceMax}
              priceBounds={priceBounds}
              sort={sort}
              onSortChange={setSort}
              availabilityDate={availabilityDate}
              onAvailabilityDateChange={setAvailabilityDate}
              availabilityLoading={availabilityLoading}
              resultCount={sortedDresses.length}
              totalCount={dresses.length}
              hasActiveFilters={hasActiveFilters}
              onReset={resetFilters}
              chips={chips}
            />
          )}

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
            /* No dresses in the catalog at all (nothing extra to say if an
               error already explains why - avoids stacking two messages) */
            error ? null : (
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
            )
          ) : sortedDresses.length === 0 ? (
            /* Dresses exist, but none match the current search/filters */
            <section className="rounded-[2rem] border border-dashed border-zinc-300 bg-white px-6 py-16 text-center shadow-sm sm:py-20">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-rose-50 via-zinc-50 to-purple-50 text-4xl">
                🔍
              </div>

              <h3 className="mt-6 text-xl font-black text-zinc-900 sm:text-2xl">
                לא נמצאו שמלות מתאימות
              </h3>

              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-500">
                {availabilityDate
                  ? "אין שמלות פנויות בתאריך שנבחר. נסי תאריך אחר או הסירי חלק מהסינונים."
                  : "נסי לשנות את החיפוש או להסיר חלק מהסינונים."}
              </p>

              <button
                type="button"
                onClick={resetFilters}
                className="mt-7 inline-flex rounded-full bg-zinc-900 px-6 py-3.5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-zinc-700"
              >
                נקה סינון
              </button>
            </section>
          ) : (
            /* Dress grid (kept visible even if a later refresh fails, so a
               failed retry doesn't wipe out already-loaded results) */
            <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
              {sortedDresses.map((dress, index) => (
                <DressCard
                  key={dress.id}
                  dress={dress}
                  style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
                  sizeAvailability={sizeAvailabilityByDressId?.get(dress.id) ?? null}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
