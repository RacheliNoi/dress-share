const SIZES = {
  sm: "h-6 w-6",
  md: "h-12 w-12",
  lg: "h-16 w-16",
  xl: "h-24 w-24",
} as const;

type DressPlaceholderProps = {
  size?: keyof typeof SIZES;
  className?: string;
};

// Shared "no photo" treatment for every spot in the app that would
// otherwise show a dress photo - card thumbnails, galleries, detail hero
// panels, and upload dropzones. A single line-art mark on the brand
// gradient, so a missing photo reads as a deliberate editorial choice
// rather than a broken/generic placeholder.
export default function DressPlaceholder({
  size = "lg",
  className = "",
}: DressPlaceholderProps) {
  return (
    <div
      className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-accent-soft via-paper to-surface-sunken ${className}`}
    >
      <svg
        viewBox="0 0 120 160"
        className={`${SIZES[size]} text-accent-soft-strong`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M42 10 L48 24" />
        <path d="M78 10 L72 24" />
        <path d="M48 24 C44 32 40 42 38 52 C24 72 14 98 12 128" />
        <path d="M72 24 C76 32 80 42 82 52 C96 72 106 98 108 128" />
        <path d="M12 128 C12 138 20 146 32 148 C48 151 72 151 88 148 C100 146 108 138 108 128" />
        <path d="M38 54 Q60 62 82 54" strokeWidth="1" opacity="0.6" />
      </svg>
    </div>
  );
}
