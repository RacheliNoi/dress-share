"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildHebrewYearTable,
  getHebrewDateParts,
  hebrewToGregorian,
  toHebrewNumeral,
} from "@/lib/hebrewDate";

export type SortOption = "recommended" | "price-asc" | "price-desc" | "newest";

export type FilterChip = {
  key: string;
  label: string;
  onRemove: () => void;
};

export default function CatalogFilters({
  search,
  onSearchChange,
  categories,
  selectedCategory,
  onCategoryChange,
  colors,
  selectedColor,
  onColorChange,
  sizes,
  selectedSize,
  onSizeChange,
  priceMin,
  priceMax,
  onPriceMinChange,
  onPriceMaxChange,
  priceBounds,
  sort,
  onSortChange,
  availabilityDate,
  onAvailabilityDateChange,
  availabilityLoading,
  resultCount,
  totalCount,
  hasActiveFilters,
  onReset,
  chips,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  categories: string[];
  selectedCategory: string;
  onCategoryChange: (value: string) => void;
  colors: string[];
  selectedColor: string;
  onColorChange: (value: string) => void;
  sizes: string[];
  selectedSize: string;
  onSizeChange: (value: string) => void;
  priceMin: string;
  priceMax: string;
  onPriceMinChange: (value: string) => void;
  onPriceMaxChange: (value: string) => void;
  priceBounds: { min: number; max: number } | null;
  sort: SortOption;
  onSortChange: (value: SortOption) => void;
  availabilityDate: string;
  onAvailabilityDateChange: (value: string) => void;
  availabilityLoading: boolean;
  resultCount: number;
  totalCount: number;
  hasActiveFilters: boolean;
  onReset: () => void;
  chips: FilterChip[];
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

  const selectClassName =
    "w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-700 outline-none transition focus:border-zinc-400 sm:w-auto";

  return (
    <section className="mb-6 sm:mb-7">
      {/* Search + sort + mobile filter toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <svg
            className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
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
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="חיפוש לפי שם, קטגוריה, צבע או תיאור..."
            className="w-full rounded-2xl border border-zinc-200 bg-white py-3.5 pe-11 ps-4 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-zinc-400"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPanelOpen((current) => !current)}
            className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold transition sm:hidden ${
              panelOpen
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-700"
            }`}
          >
            סינון ומיון
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

          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value as SortOption)}
            className={`${selectClassName} hidden sm:block`}
            aria-label="מיון"
          >
            <option value="recommended">מומלצות</option>
            <option value="newest">חדשות ביותר</option>
            <option value="price-asc">מחיר: מהנמוך לגבוה</option>
            <option value="price-desc">מחיר: מהגבוה לנמוך</option>
          </select>
        </div>
      </div>

      {/* Date-of-rental availability filter - always visible (not tucked
          inside the collapsible mobile panel) since it's a distinct kind of
          filter from the rest. */}
      <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-accent-soft bg-accent-soft/60 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <label
            htmlFor="availability-date-filter"
            className="text-sm font-bold text-zinc-800"
          >
            מחפשת שמלה לתאריך?
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <input
              id="availability-date-filter"
              type="date"
              value={availabilityDate}
              onChange={(event) => onAvailabilityDateChange(event.target.value)}
              className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-400"
            />

            {availabilityDate && (
              <button
                type="button"
                onClick={() => onAvailabilityDateChange("")}
                className="rounded-xl px-3 py-2.5 text-sm font-bold text-accent transition hover:bg-accent-soft-strong"
              >
                ניקוי תאריך
              </button>
            )}

            {availabilityLoading && (
              <span className="text-xs font-medium text-zinc-500">
                בודקת זמינות...
              </span>
            )}
          </div>

          {availabilityDate && !availabilityLoading && (
            <span className="text-xs font-medium text-accent-deep sm:ms-auto">
              מוצגות רק שמלות שפנויות בתאריך שנבחר
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-accent-soft/70 pt-3 sm:flex-row sm:items-center sm:gap-2">
          <span className="text-xs font-bold text-zinc-500">
            או לפי תאריך עברי:
          </span>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={hebrewYear}
              onChange={(event) => handleHebrewYearChange(Number(event.target.value))}
              aria-label="שנה עברית"
              className="rounded-xl border border-zinc-200 bg-white px-2.5 py-2 text-sm text-zinc-700 outline-none transition focus:border-zinc-400"
            >
              {hebrewYearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>

            <select
              value={hebrewMonthName}
              onChange={(event) => handleHebrewMonthChange(event.target.value)}
              aria-label="חודש עברי"
              className="rounded-xl border border-zinc-200 bg-white px-2.5 py-2 text-sm text-zinc-700 outline-none transition focus:border-zinc-400"
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
              className="rounded-xl border border-zinc-200 bg-white px-2.5 py-2 text-sm text-zinc-700 outline-none transition focus:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-50"
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
            <span className="text-xs font-medium text-zinc-500 sm:ms-auto">
              נבחר: {new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(`${availabilityDate}T00:00:00.000Z`))}
              {hebrewMonthName && hebrewDay && ` · ${toHebrewNumeral(Number(hebrewDay))} ב${hebrewMonthName} ${hebrewYear}`}
            </span>
          )}
        </div>
      </div>

      {/* Collapsible filter panel (always open from sm: up) */}
      <div
        className={`grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out sm:mt-4 sm:grid-rows-[1fr] sm:overflow-visible ${
          panelOpen ? "mt-4 grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="min-h-0">
          <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/60 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 sm:bg-transparent sm:p-0 sm:shadow-none sm:ring-0">
            <select
              value={sort}
              onChange={(event) => onSortChange(event.target.value as SortOption)}
              className={`${selectClassName} sm:hidden`}
              aria-label="מיון"
            >
              <option value="recommended">מומלצות</option>
              <option value="newest">חדשות ביותר</option>
              <option value="price-asc">מחיר: מהנמוך לגבוה</option>
              <option value="price-desc">מחיר: מהגבוה לנמוך</option>
            </select>

            {categories.length > 0 && (
              <select
                value={selectedCategory}
                onChange={(event) => onCategoryChange(event.target.value)}
                className={selectClassName}
              >
                <option value="">כל הקטגוריות</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            )}

            {colors.length > 0 && (
              <select
                value={selectedColor}
                onChange={(event) => onColorChange(event.target.value)}
                className={selectClassName}
              >
                <option value="">כל הצבעים</option>
                {colors.map((color) => (
                  <option key={color} value={color}>
                    {color}
                  </option>
                ))}
              </select>
            )}

            {sizes.length > 0 && (
              <select
                value={selectedSize}
                onChange={(event) => onSizeChange(event.target.value)}
                className={selectClassName}
              >
                <option value="">כל המידות</option>
                {sizes.map((size) => (
                  <option key={size} value={size}>
                    מידה {size}
                  </option>
                ))}
              </select>
            )}

            {priceBounds && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  value={priceMin}
                  onChange={(event) => onPriceMinChange(event.target.value)}
                  placeholder={`מ־${priceBounds.min} ₪`}
                  min={0}
                  className="w-24 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-700 outline-none transition focus:border-zinc-400"
                />
                <span className="text-zinc-300">–</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={priceMax}
                  onChange={(event) => onPriceMaxChange(event.target.value)}
                  placeholder={`עד ${priceBounds.max} ₪`}
                  min={0}
                  className="w-24 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-700 outline-none transition focus:border-zinc-400"
                />
              </div>
            )}

            {hasActiveFilters && (
              <button
                type="button"
                onClick={onReset}
                className="rounded-xl px-3 py-2.5 text-sm font-bold text-accent transition hover:bg-accent-soft sm:me-auto"
              >
                נקה סינון
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Active filter chips + result count */}
      {(chips.length > 0 || totalCount > 0) && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
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

          <span className="ms-auto text-xs font-medium text-zinc-400">
            {hasActiveFilters
              ? `מציגה ${resultCount} מתוך ${totalCount} שמלות`
              : `${totalCount} ${totalCount === 1 ? "שמלה" : "שמלות"}`}
          </span>
        </div>
      )}
    </section>
  );
}
