// Renders "מידה X · Y ₪ · Z יחידות"-style facts as separate elements
// instead of one concatenated string. Concatenating Hebrew text with
// multiple numbers/currency symbols into a single text run was found to
// render in a scrambled order for some users in several places across the
// app (RTL bidi text handling is unreliable for that specific mix) -
// keeping each fact in its own element and laying them out with flexbox
// (which respects visual order strictly, unlike the browser's own text
// bidi reordering) is what actually fixes it, not just a different
// separator or word order.
export default function SizeFacts({
  size,
  price,
  quantity,
  className = "",
}: {
  size: string;
  price?: number;
  quantity?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-1.5 ${className}`}>
      <span>מידה {size}</span>
      {price !== undefined && (
        <>
          <span aria-hidden className="opacity-50">
            ·
          </span>
          <span>{price} ₪</span>
        </>
      )}
      {quantity !== undefined && (
        <>
          <span aria-hidden className="opacity-50">
            ·
          </span>
          <span>{quantity} יחידות</span>
        </>
      )}
    </span>
  );
}
