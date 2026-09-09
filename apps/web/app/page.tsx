"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import DressCard from "@/components/DressCard";
import CatalogFilters, { SortOption } from "@/components/CatalogFilters";
import {
  CatalogFilterParams,
  Dress,
  DressAvailabilityEntry,
  DressSize,
  getApprovedDresses,
  getDressAvailability,
} from "@/lib/api";
import { getSizeUsageForDay } from "@/lib/availability";

// How long to wait after the last keystroke before the search box triggers a
// server request - typing shouldn't fire a request per character. Only
// search is debounced (category/color/size/price/sort already come from
// discrete selects/inputs that don't fire nearly as often).
const SEARCH_DEBOUNCE_MS = 350;

// Dresses per page. Chosen to divide evenly across this grid's column counts
// (2/3/4 at increasing breakpoints) so the last row is rarely left half-empty.
const PAGE_SIZE = 12;

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

// Per-size, quantity-aware breakdown for one date - mirrors the backend's
// assertCapacityAvailable via the shared getSizeUsageForDay helper (a size
// is blocked once its active-booking usage that day reaches its quantity),
// so the catalog can never disagree with what the backend would actually
// accept. `size: null` on an entry means either a no-size dress (whole-dress
// booking) or a booking made before per-size tracking existed, both treated
// as blocking every size (the conservative reading, matching the backend).
function getBlockedSizesForDate(
  dateValue: string,
  entries: DressAvailabilityEntry[],
  sizes: DressSize[],
): { blockedSizes: Set<string>; wholeDressBlocked: boolean } {
  const day = new Date(`${dateValue}T00:00:00.000Z`);
  const blockedSizes = new Set<string>();
  let wholeDressBlocked = false;

  for (const size of sizes) {
    const { usage, wholeDressBlocked: dayFullyBlocked } = getSizeUsageForDay(
      day,
      entries,
      size.size,
    );

    if (dayFullyBlocked) {
      wholeDressBlocked = true;
    }

    if (dayFullyBlocked || usage >= size.quantity) {
      blockedSizes.add(size.size);
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

  const { blockedSizes, wholeDressBlocked } = getBlockedSizesForDate(
    dateValue,
    entries,
    dress.sizes,
  );

  if (wholeDressBlocked) {
    return false;
  }

  return dress.sizes.some((size) => !blockedSizes.has(size.size));
}

export default function CatalogPage() {
  // The ONLY source for the displayed grid - always exactly what the server
  // returned for the current search/category/color/size/price/sort. Never
  // filtered or re-sorted client-side beyond the availability-date pass
  // below (which the backend has no endpoint for yet).
  const [dresses, setDresses] = useState<Dress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Fetched once, unfiltered, on mount - used ONLY to derive the filter
  // dropdown option lists (categories/colors/sizes/priceBounds) and the
  // "total in catalog" count, so those never shrink just because a filter
  // is currently narrowing the grid. Never rendered as cards, never
  // filtered/sorted, never touched by the availability-date pass.
  const [optionsDresses, setOptionsDresses] = useState<Dress[]>([]);

  const [search, setSearch] = useState("");
  // The value actually sent to the server - updates SEARCH_DEBOUNCE_MS after
  // the user stops typing. `search` itself still drives the input's
  // displayed value directly, so typing feels instant even though the
  // request lags slightly behind.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [sort, setSort] = useState<SortOption>("recommended");

  // 1-based. Reset to 1 whenever a server-side filter/sort changes (see the
  // update* wrappers below) - never reset by changing the page itself.
  const [page, setPage] = useState(1);
  // Total matches for the CURRENT search/filter/sort query, before
  // pagination - comes straight from the server's `total`, independent of
  // how many results happen to be on the current page.
  const [totalMatches, setTotalMatches] = useState(0);

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

  useEffect(() => {
    const timeout = setTimeout(() => {
      // Batched into one re-render (React 18+ automatic batching applies
      // inside setTimeout callbacks too) - loadDresses' effect below then
      // fires exactly once with both the new search term and page 1,
      // instead of once per state change.
      setDebouncedSearch(search);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [search]);

  // Wrap each filter setter to also reset pagination to page 1, batched into
  // the same render as the filter change itself (see the search debounce
  // effect above for why batching matters here - the same reasoning applies
  // to every server-side filter, not just search). Reused directly by both
  // the filter dropdowns/inputs AND their matching chip's onRemove below, so
  // "what happens when category changes" has exactly one implementation.
  function updateCategory(value: string) {
    setSelectedCategory(value);
    setPage(1);
  }

  function updateColor(value: string) {
    setSelectedColor(value);
    setPage(1);
  }

  function updateCity(value: string) {
    setSelectedCity(value);
    setPage(1);
  }

  function updateSize(value: string) {
    setSelectedSize(value);
    setPage(1);
  }

  function updatePriceMin(value: string) {
    setPriceMin(value);
    setPage(1);
  }

  function updatePriceMax(value: string) {
    setPriceMax(value);
    setPage(1);
  }

  function updateSort(value: SortOption) {
    setSort(value);
    setPage(1);
  }

  const priceMinValue = priceMin.trim() === "" ? null : Number(priceMin);
  const priceMaxValue = priceMax.trim() === "" ? null : Number(priceMax);

  // Rebuilt whenever a filter/sort/the debounced search changes; also reused
  // directly as the error banner's retry handler, matching this file's
  // existing pattern of a named loader function wired to both a mount effect
  // and a manual retry button.
  const loadDresses = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const params: CatalogFilterParams = {
        search: debouncedSearch.trim() || undefined,
        category: selectedCategory || undefined,
        color: selectedColor || undefined,
        city: selectedCity || undefined,
        size: selectedSize || undefined,
        priceMin: priceMinValue ?? undefined,
        priceMax: priceMaxValue ?? undefined,
        // Omitted (not just "recommended") on the default/no-filter case, so
        // the very first load fires the exact same bare request as before
        // this endpoint accepted any query params at all.
        sort: sort === "recommended" ? undefined : sort,
        page,
        limit: PAGE_SIZE,
      };

      const { dresses: data, total } = await getApprovedDresses(params);
      setDresses(data);
      setTotalMatches(total);
    } catch {
      setError("לא הצלחנו לטעון את הקטלוג. נסי שוב.");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, selectedCategory, selectedColor, selectedCity, selectedSize, priceMinValue, priceMaxValue, sort, page]);

  useEffect(() => {
    loadDresses();
  }, [loadDresses]);

  // One-time, unfiltered - see optionsDresses' declaration above. Failing
  // silently here just leaves the dropdown option lists empty (the same
  // graceful-empty rendering CatalogFilters already does when a list is
  // empty), rather than surfacing a second error banner for a background,
  // non-essential fetch.
  useEffect(() => {
    let cancelled = false;

    getApprovedDresses()
      .then(({ dresses: data }) => {
        if (!cancelled) {
          setOptionsDresses(data);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
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

  // Derived from optionsDresses (the unfiltered catalog) ONLY - these must
  // never shrink just because a filter is currently narrowing the grid.
  const categories = useMemo(
    () => uniqueSorted(optionsDresses.map((dress) => dress.category)),
    [optionsDresses],
  );
  const colors = useMemo(
    () => uniqueSorted(optionsDresses.map((dress) => dress.color)),
    [optionsDresses],
  );
  const cities = useMemo(
    () => uniqueSorted(optionsDresses.map((dress) => dress.city)),
    [optionsDresses],
  );
  const sizes = useMemo(
    () =>
      uniqueSorted(optionsDresses.flatMap((dress) => dress.sizes.map((size) => size.size))),
    [optionsDresses],
  );
  const priceBounds = useMemo(() => {
    const prices = optionsDresses.flatMap((dress) => dress.sizes.map((size) => size.price));

    if (prices.length === 0) {
      return null;
    }

    return { min: Math.min(...prices), max: Math.max(...prices) };
  }, [optionsDresses]);

  // The only client-side filtering left - the backend has no availability
  // endpoint that accepts a date yet, so this still runs here, applied on
  // top of the server's already-filtered/sorted `dresses`. `.filter()`
  // preserves the server's ordering, so no re-sort is needed afterward.
  const visibleDresses = useMemo(() => {
    if (!availabilityDate) {
      return dresses;
    }

    return dresses.filter((dress) => {
      const entries = availabilityCache[dress.id];
      // Not loaded yet (or failed to load) - fail open rather than hiding a
      // dress we simply don't have an answer for yet.
      if (!entries) return true;
      return isDressAvailableOnDate(dress, availabilityDate, entries);
    });
  }, [dresses, availabilityDate, availabilityCache]);

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
        dress.sizes,
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

  const totalPages = Math.max(1, Math.ceil(totalMatches / PAGE_SIZE));

  const hasActiveFilters = Boolean(
    search.trim() ||
      selectedCategory ||
      selectedColor ||
      selectedCity ||
      selectedSize ||
      priceMinValue !== null ||
      priceMaxValue !== null ||
      availabilityDate,
  );

  // Clears both the input's live value and the debounced value it feeds -
  // without also resetting debouncedSearch directly, the refetch that
  // follows a reset would still wait out SEARCH_DEBOUNCE_MS instead of
  // firing immediately, which would make "reset" feel laggy. Also resets
  // pagination, same as every other update* filter setter above.
  function clearSearch() {
    setSearch("");
    setDebouncedSearch("");
    setPage(1);
  }

  // sort is deliberately NOT reset here - existing behavior, unchanged.
  function resetFilters() {
    clearSearch();
    updateCategory("");
    updateColor("");
    updateCity("");
    updateSize("");
    updatePriceMin("");
    updatePriceMax("");
    setAvailabilityDate("");
  }

  const chips = [
    search.trim() && {
      key: "search",
      label: `"${search.trim()}"`,
      onRemove: clearSearch,
    },
    selectedCategory && {
      key: "category",
      label: selectedCategory,
      onRemove: () => updateCategory(""),
    },
    selectedColor && {
      key: "color",
      label: selectedColor,
      onRemove: () => updateColor(""),
    },
    selectedCity && {
      key: "city",
      label: selectedCity,
      onRemove: () => updateCity(""),
    },
    selectedSize && {
      key: "size",
      label: `מידה ${selectedSize}`,
      onRemove: () => updateSize(""),
    },
    (priceMinValue !== null || priceMaxValue !== null) && {
      key: "price",
      label:
        // ⁦/⁩ (LRI/PDI) isolate the "min–max" run as a single
        // left-to-right unit - without it the bidi algorithm can visually
        // swap the two numbers around the "–" inside this RTL chip label,
        // the same class of bug already fixed with dir="ltr" for date
        // ranges elsewhere. This label is a plain string (not JSX), so the
        // Unicode isolate characters are the equivalent fix here.
        priceMinValue !== null && priceMaxValue !== null
          ? `⁦${priceMinValue}–${priceMaxValue}⁩ ₪`
          : priceMinValue !== null
            ? `מ־${priceMinValue} ₪`
            : `עד ${priceMaxValue} ₪`,
      onRemove: () => {
        updatePriceMin("");
        updatePriceMax("");
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

  return (
    <main dir="rtl" className="min-h-screen bg-[#faf9f7] text-zinc-900">
      <Header />

      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-10">
        {/* Compact title bar - replaces the old marketing Hero + editorial
            spacer + separate catalog heading (three stacked sections) with
            one, so the grid below starts much closer to the top of the
            page. */}
        <section className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
          <div>
            <p className="text-sm font-medium text-accent">✦ קטלוג שמלות להשכרה</p>

            <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
              שמלה לכל אירוע, בלי לקנות
            </h1>

            <p className="mt-2 text-sm text-zinc-500">
              {totalMatches > 0
                ? `${totalMatches} שמלות מאושרות, מוכנות להשכרה.`
                : "עיינו במבחר השמלות המאושרות שלנו להשכרה."}
            </p>
          </div>

          <Link
            href="/catalog-pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-line-strong px-4 py-2 text-sm font-bold text-zinc-700 transition hover:border-accent hover:text-accent"
          >
            הורדת קטלוג כ-PDF
          </Link>
        </section>

        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[1fr_272px] lg:items-start lg:gap-8">
          {/* dresses.length > 0 covers the normal case; hasActiveFilters
              keeps the panel visible (so filters stay adjustable/removable)
              even when the current filter combination matches nothing -
              matching this panel's original visibility rule from when
              `dresses` still held the full unfiltered catalog. lg:order-2
              puts it in the second (left, under RTL) grid column while
              staying first in source order, so it's still the first thing a
              mobile reader reaches. */}
          {!loading && (dresses.length > 0 || hasActiveFilters) && (
            <CatalogFilters
              search={search}
              onSearchChange={setSearch}
              categories={categories}
              selectedCategory={selectedCategory}
              onCategoryChange={updateCategory}
              colors={colors}
              selectedColor={selectedColor}
              onColorChange={updateColor}
              cities={cities}
              selectedCity={selectedCity}
              onCityChange={updateCity}
              sizes={sizes}
              selectedSize={selectedSize}
              onSizeChange={updateSize}
              priceMin={priceMin}
              priceMax={priceMax}
              onPriceMinChange={updatePriceMin}
              onPriceMaxChange={updatePriceMax}
              priceBounds={priceBounds}
              availabilityDate={availabilityDate}
              onAvailabilityDateChange={setAvailabilityDate}
              availabilityLoading={availabilityLoading}
              hasActiveFilters={hasActiveFilters}
              onReset={resetFilters}
              className="lg:order-2"
            />
          )}

          <div className="min-w-0 lg:order-1">
          {/* Sort + active-filter chips + result count - sits right above
              the grid it acts on, rather than bundled into the filter
              sidebar. */}
          {!loading && (chips.length > 0 || totalMatches > 0) && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {chips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.onRemove}
                  className="flex items-center gap-1.5 rounded-full bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-700"
                >
                  {chip.label}
                  <span aria-hidden>✕</span>
                </button>
              ))}

              <span className="text-xs font-medium text-zinc-400">
                {hasActiveFilters
                  ? `מציגה ${visibleDresses.length} מתוך ${totalMatches} שמלות`
                  : `${totalMatches} ${totalMatches === 1 ? "שמלה" : "שמלות"}`}
              </span>

              <select
                value={sort}
                onChange={(event) => updateSort(event.target.value as SortOption)}
                aria-label="מיון"
                className="ms-auto rounded-xl border border-line-strong bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft"
              >
                <option value="recommended">מומלצות</option>
                <option value="newest">חדשות ביותר</option>
                <option value="price-asc">מחיר: מהנמוך לגבוה</option>
                <option value="price-desc">מחיר: מהגבוה לנמוך</option>
              </select>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-error-soft bg-error-soft px-5 py-4 text-sm text-error sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-center gap-2">
                <span aria-hidden>⚠</span>
                {error}
              </span>

              <button
                type="button"
                onClick={loadDresses}
                className="self-start rounded-full border border-error-soft px-4 py-1.5 text-xs font-bold text-error transition hover:bg-error-soft sm:self-auto"
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
                  className="overflow-hidden rounded-[20px] bg-white ring-1 ring-zinc-200/60"
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
          ) : !hasActiveFilters && dresses.length === 0 ? (
            /* No dresses in the catalog at all (nothing extra to say if an
               error already explains why - avoids stacking two messages) */
            error ? null : (
              <section className="rounded-[28px] border border-dashed border-zinc-300 bg-white px-6 py-16 text-center shadow-sm sm:py-20">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-accent-soft via-zinc-50 to-purple-50 text-4xl">
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
          ) : visibleDresses.length === 0 ? (
            /* Dresses exist, but none match the current search/filters */
            <section className="rounded-[28px] border border-dashed border-zinc-300 bg-white px-6 py-16 text-center shadow-sm sm:py-20">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-accent-soft via-zinc-50 to-purple-50 text-4xl">
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
                נקי סינון
              </button>
            </section>
          ) : (
            <>
              {/* Dress grid (kept visible even if a later refresh fails, so
                  a failed retry doesn't wipe out already-loaded results) */}
              <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
                {visibleDresses.map((dress, index) => (
                  <DressCard
                    key={dress.id}
                    dress={dress}
                    style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
                    sizeAvailability={sizeAvailabilityByDressId?.get(dress.id) ?? null}
                  />
                ))}
              </div>

              {/* Smallest possible pagination control - reflects the
                  server-side total for the current filters, independent of
                  the client-only availability-date filter applied above.
                  Hidden entirely when everything fits on one page. */}
              {totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={page <= 1}
                    className="rounded-full border border-line-strong px-5 py-2.5 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    → הקודם
                  </button>

                  <span className="text-sm font-medium text-zinc-500">
                    עמוד {page} מתוך {totalPages}
                  </span>

                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    disabled={page >= totalPages}
                    className="rounded-full border border-line-strong px-5 py-2.5 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    הבא ←
                  </button>
                </div>
              )}
            </>
          )}
          </div>
        </div>
      </div>
    </main>
  );
}
