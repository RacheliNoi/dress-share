import Link from "next/link";
import { Dress, getDressImageUrl } from "@/lib/api";

function getPriceRange(dress: Dress) {
  if (dress.sizes.length === 0) {
    return "טרם הוגדר מחיר";
  }

  const prices = dress.sizes.map((size) => size.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);

  if (min === max) {
    return `${min} ₪`;
  }

  return `${min}–${max} ₪`;
}

export default function DressCard({ dress }: { dress: Dress }) {
  const photo = [...dress.photos].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  )[0];
  const imageUrl = photo ? getDressImageUrl(photo) : null;

  return (
    <Link
      href={`/dress/${dress.id}`}
      className="group block overflow-hidden rounded-[1.75rem] bg-white shadow-sm ring-1 ring-zinc-200/60 transition duration-300 hover:-translate-y-1 hover:shadow-xl"
    >
      <div className="relative h-[380px] overflow-hidden bg-zinc-100">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={dress.name}
            className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-rose-50 via-zinc-50 to-purple-50 text-7xl">
            👗
          </div>
        )}

        {dress.photos.length > 1 && (
          <div className="absolute bottom-4 left-4 rounded-full bg-black/55 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">
            📷 {dress.photos.length} תמונות
          </div>
        )}
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-zinc-900">
              {dress.name}
            </h3>

            <p className="mt-1 text-sm text-zinc-500">
              {dress.category || "ללא קטגוריה"}
              {dress.color && ` · ${dress.color}`}
            </p>
          </div>

          <div className="text-left">
            <p className="text-xs text-zinc-400">מחיר</p>
            <p className="mt-0.5 whitespace-nowrap text-sm font-black text-zinc-900">
              {getPriceRange(dress)}
            </p>
          </div>
        </div>

        {dress.description && (
          <p className="mt-4 line-clamp-2 text-sm leading-6 text-zinc-500">
            {dress.description}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {dress.sizes.length > 0 ? (
            dress.sizes.map((size) => (
              <span
                key={size.id}
                className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-600"
              >
                {size.size}
              </span>
            ))
          ) : (
            <span className="text-xs text-zinc-400">
              טרם הוגדרו מידות
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
