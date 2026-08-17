"use client";

import { useState } from "react";

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
  resultCount: number;
  totalCount: number;
  hasActiveFilters: boolean;
  onReset: () => void;
  chips: FilterChip[];
}) {
  const [panelOpen, setPanelOpen] = useState(false);

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
                className="rounded-xl px-3 py-2.5 text-sm font-bold text-rose-500 transition hover:bg-rose-50 sm:me-auto"
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
