"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildHebrewYearTable,
  getHebrewDateParts,
  hebrewToGregorian,
  toHebrewNumeral,
  toHebrewYearNumeral,
} from "@/lib/hebrewDate";

export type SortOption = "recommended" | "price-asc" | "price-desc" | "newest";

export type FilterChip = {
  key: string;
  label: string;
  onRemove: () => void;
};

// Renders as a vertical sidebar (sticky, always open) from lg: up, and as a
// collapsible panel behind a "סינון ומיון" toggle below that - the same
// collapse mechanism the previous horizontal layout used, just reused for a
// vertical stack instead. Sort/chips/result-count live in the page itself
// (next to the grid they act on), not here - this component owns only the
// filter fields themselves.
export default function CatalogFilters({
  search,
  onSearchChange,
  categories,
  selectedCategory,
  onCategoryChange,
  colors,
  selectedColor,
  onColorChange,
  cities,
  selectedCity,
  onCityChange,
  sizes,
  selectedSize,
  onSizeChange,
  priceMin,
  priceMax,
  onPriceMinChange,
  onPriceMaxChange,
  priceBounds,
  availabilityDate,
  onAvailabilityDateChange,
  availabilityLoading,
  hasActiveFilters,
  onReset,
  className,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  categories: string[];
  selectedCategory: string;
  onCategoryChange: (value: string) => void;
  colors: string[];
  selectedColor: string;
  onColorChange: (value: string) => void;
  cities: string[];
  selectedCity: string;
  onCityChange: (value: string) => void;
  sizes: string[];
  selectedSize: string;
  onSizeChange: (value: string) => void;
  priceMin: string;
  priceMax: string;
  onPriceMinChange: (value: string) => void;
  onPriceMaxChange: (value: string) => void;
  priceBounds: { min: number; max: number } | null;
  availabilityDate: string;
  onAvailabilityDateChange: (value: string) => void;
  availabilityLoading: boolean;
  hasActiveFilters: boolean;
  onReset: () => void;
  className?: string;
}) {
  const [panelOpen, setPanelOpen] = useState(false);

  // Hebrew-date picker for the availability filter: three selects (year /
  // month / day) that resolve to the same Gregorian `availabilityDate` the
  // Gregorian <input type="date"> above already drives - Hebrew is UI-only
  // here, the actual filtering always runs on the Gregorian value.
  const currentHebrewYear = useMemo(() => getHebrewDateParts(new Date()).year, []);
  const hebrewYearOptions = useMemo(
    () => Array.from({ length: 5 }, (_, index) => currentHebrewYear - 1 + index),
    [currentHebrewYear],
  );

  const [hebrewYear, setHebrewYear] = useState(currentHebrewYear);
  const [hebrewMonthName, setHebrewMonthName] = useState("");
  const [hebrewDay, setHebrewDay] = useState("");

  const hebrewTable = useMemo(() => buildHebrewYearTable(hebrewYear), [hebrewYear]);
  const hebrewDayOptions =
    hebrewTable.find((month) => month.name === hebrewMonthName)?.days.map((entry) => entry.day) ??
    [];

  // Keeps the Hebrew selects in sync whenever availabilityDate changes from
  // elsewhere (the Gregorian input, the clear button, a chip removal) - so
  // the Hebrew date shown is always a correct reflection of whatever date is
  // actually selected, however it was picked.
  useEffect(() => {
    if (!availabilityDate) {
      setHebrewMonthName("");
      setHebrewDay("");
      return;
    }

    const parts = getHebrewDateParts(new Date(`${availabilityDate}T00:00:00.000Z`));
    setHebrewYear(parts.year);
    setHebrewMonthName(parts.month);
    setHebrewDay(String(parts.day));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availabilityDate]);

  function handleHebrewYearChange(nextYear: number) {
    setHebrewYear(nextYear);
    setHebrewMonthName("");
    setHebrewDay("");
  }

  function handleHebrewMonthChange(nextMonth: string) {
    setHebrewMonthName(nextMonth);
    setHebrewDay("");
  }

  function handleHebrewDayChange(nextDay: string) {
    setHebrewDay(nextDay);

    if (!hebrewMonthName || !nextDay) {
      return;
    }

    const gregorian = hebrewToGregorian(hebrewTable, hebrewMonthName, Number(nextDay));

    if (gregorian) {
      onAvailabilityDateChange(gregorian.toISOString().slice(0, 10));
    }
  }

  const fieldLabelClass =
    "mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-zinc-400";
  const fieldClassName =
    "w-full rounded-xl border border-line-strong bg-white px-3.5 py-2.5 text-sm text-zinc-700 outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft";

  return (
    <aside className={`lg:sticky lg:top-6 lg:self-start ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setPanelOpen((current) => !current)}
        className={`flex w-full items-center justify-between gap-2 rounded-2xl border px-4 py-3 text-sm font-bold transition lg:hidden ${
          panelOpen
            ? "border-zinc-900 bg-zinc-900 text-white"
            : "border-line-strong bg-white text-zinc-700"
        }`}
      >
        סינון
        {hasActiveFilters && (
          <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] text-white">
            פעיל
          </span>
        )}
        <svg
          className={`h-3.5 w-3.5 transition-transform ${panelOpen ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* Same collapse-on-mobile / always-open-on-desktop mechanism the
          previous horizontal layout used (grid-rows animated between 0fr/1fr),
          just forced open + un-clipped from lg: up via !-prefixed overrides. */}
      <div
        className={`grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out lg:!mt-0 lg:!grid-rows-[1fr] lg:overflow-visible ${
          panelOpen ? "mt-3 grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="min-h-0">
          <div className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200/60 lg:w-64">
            <div>
              <label htmlFor="catalog-search" className={fieldLabelClass}>
                חיפוש
              </label>
              <div className="relative">
                <svg
                  className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  id="catalog-search"
                  type="search"
                  value={search}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder="שם, קטגוריה, עיר..."
                  className={`${fieldClassName} pr-10 pl-3.5`}
                />
              </div>
            </div>

            {categories.length > 0 && (
              <div>
                <label htmlFor="catalog-category" className={fieldLabelClass}>
                  קטגוריה
                </label>
                <select
                  id="catalog-category"
                  value={selectedCategory}
                  onChange={(event) => onCategoryChange(event.target.value)}
                  className={fieldClassName}
                >
                  <option value="">כל הקטגוריות</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {colors.length > 0 && (
              <div>
                <label htmlFor="catalog-color" className={fieldLabelClass}>
                  צבע
                </label>
                <select
                  id="catalog-color"
                  value={selectedColor}
                  onChange={(event) => onColorChange(event.target.value)}
                  className={fieldClassName}
                >
                  <option value="">כל הצבעים</option>
                  {colors.map((color) => (
                    <option key={color} value={color}>
                      {color}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {cities.length > 0 && (
              <div>
                <label htmlFor="catalog-city" className={fieldLabelClass}>
                  עיר
                </label>
                <select
                  id="catalog-city"
                  value={selectedCity}
                  onChange={(event) => onCityChange(event.target.value)}
                  className={fieldClassName}
                >
                  <option value="">כל הערים</option>
                  {cities.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {sizes.length > 0 && (
              <div>
                <label htmlFor="catalog-size" className={fieldLabelClass}>
                  מידה
                </label>
                <select
                  id="catalog-size"
                  value={selectedSize}
                  onChange={(event) => onSizeChange(event.target.value)}
                  className={fieldClassName}
                >
                  <option value="">כל המידות</option>
                  {sizes.map((size) => (
                    <option key={size} value={size}>
                      מידה {size}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {priceBounds && (
              <div>
                <span className={fieldLabelClass}>טווח מחיר</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={priceMin}
                    onChange={(event) => onPriceMinChange(event.target.value)}
                    placeholder={`מ־${priceBounds.min}`}
                    min={0}
                    aria-label="מחיר מינימלי"
                    className={`${fieldClassName} w-1/2`}
                  />
                  <span className="text-zinc-300">–</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={priceMax}
                    onChange={(event) => onPriceMaxChange(event.target.value)}
                    placeholder={`עד ${priceBounds.max}`}
                    min={0}
                    aria-label="מחיר מקסימלי"
                    className={`${fieldClassName} w-1/2`}
                  />
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-accent-soft bg-accent-soft/60 p-4">
              <label htmlFor="availability-date-filter" className="text-sm font-bold text-zinc-800">
                זמינה בתאריך
              </label>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  id="availability-date-filter"
                  type="date"
                  value={availabilityDate}
                  onChange={(event) => onAvailabilityDateChange(event.target.value)}
                  className="w-full rounded-xl border border-line-strong bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft"
                />

                {availabilityDate && (
                  <button
                    type="button"
                    onClick={() => onAvailabilityDateChange("")}
                    className="rounded-xl px-2 py-1 text-xs font-bold text-accent transition hover:bg-accent-soft-strong"
                  >
                    ניקוי תאריך
                  </button>
                )}

                {availabilityLoading && (
                  <span className="text-xs font-medium text-zinc-500">בודקת זמינות...</span>
                )}
              </div>

              {availabilityDate && !availabilityLoading && (
                <p className="mt-2 text-xs font-medium text-accent-deep">
                  מוצגות רק שמלות שפנויות בתאריך שנבחר
                </p>
              )}

              <div className="mt-3 flex flex-col gap-2 border-t border-accent-soft/70 pt-3">
                <span className="text-xs font-bold text-zinc-500">או לפי תאריך עברי:</span>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={hebrewYear}
                    onChange={(event) => handleHebrewYearChange(Number(event.target.value))}
                    aria-label="שנה עברית"
                    className="rounded-xl border border-line-strong bg-white px-2.5 py-2 text-xs text-zinc-700 outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft"
                  >
                    {hebrewYearOptions.map((year) => (
                      <option key={year} value={year}>
                        {toHebrewYearNumeral(year)}
                      </option>
                    ))}
                  </select>

                  <select
                    value={hebrewMonthName}
                    onChange={(event) => handleHebrewMonthChange(event.target.value)}
                    aria-label="חודש עברי"
                    className="rounded-xl border border-line-strong bg-white px-2.5 py-2 text-xs text-zinc-700 outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft"
                  >
                    <option value="">חודש</option>
                    {hebrewTable.map((month) => (
                      <option key={month.name} value={month.name}>
                        {month.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={hebrewDay}
                    onChange={(event) => handleHebrewDayChange(event.target.value)}
                    aria-label="יום עברי"
                    disabled={!hebrewMonthName}
                    className="rounded-xl border border-line-strong bg-white px-2.5 py-2 text-xs text-zinc-700 outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">יום</option>
                    {hebrewDayOptions.map((day) => (
                      <option key={day} value={day}>
                        {toHebrewNumeral(day)}
                      </option>
                    ))}
                  </select>
                </div>

                {availabilityDate && (
                  <span className="text-xs font-medium text-zinc-500">
                    נבחר:{" "}
                    {new Intl.DateTimeFormat("he-IL", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      timeZone: "UTC",
                    }).format(new Date(`${availabilityDate}T00:00:00.000Z`))}
                    {hebrewMonthName &&
                      hebrewDay &&
                      ` · ${toHebrewNumeral(Number(hebrewDay))} ב${hebrewMonthName} ${toHebrewYearNumeral(hebrewYear)}`}
                  </span>
                )}
              </div>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={onReset}
                className="rounded-xl border border-line-strong px-3 py-2.5 text-sm font-bold text-accent transition hover:bg-accent-soft"
              >
                נקי סינון
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
