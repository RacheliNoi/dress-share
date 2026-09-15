// Display-only star rating - rounds to the nearest whole star rather than
// clipping a partial star, which is plenty precise for an average of a
// handful of 1-5 integer ratings and avoids SVG-clip-path complexity for a
// difference no one would actually notice at this size.
export default function StarRating({
  rating,
  count,
  size = "sm",
}: {
  rating: number;
  count?: number;
  size?: "sm" | "md";
}) {
  const starSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const rounded = Math.round(rating);

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="inline-flex shrink-0 items-center gap-0.5 text-warning">
        {[1, 2, 3, 4, 5].map((star) => (
          <svg
            key={star}
            className={starSize}
            viewBox="0 0 24 24"
            fill={star <= rounded ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden
          >
            <path d="m12 2.5 2.9 6.3 6.9.8-5.1 4.8 1.4 6.8-6.1-3.4-6.1 3.4 1.4-6.8-5.1-4.8 6.9-.8Z" />
          </svg>
        ))}
      </span>

      {typeof count === "number" && (
        <span className="whitespace-nowrap text-xs font-medium text-zinc-500">
          {rating.toFixed(1)} ({count})
        </span>
      )}
    </span>
  );
}
