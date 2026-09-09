"use client";

import { useState } from "react";

// A small "?" affordance that reveals a short explanation on hover/focus/tap
// - for clarifying a specific control in place, right where the question
// actually comes up, instead of sending people to a separate help page.
// type="button" so this is always safe to drop inside a <form> without
// accidentally triggering a submit.
export default function InfoTooltip({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        aria-label="מידע נוסף"
        aria-expanded={open}
        className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[11px] font-bold text-zinc-600 transition hover:bg-zinc-300"
      >
        ?
      </button>

      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full right-1/2 z-30 mb-2 w-56 translate-x-1/2 rounded-xl bg-ink px-3 py-2 text-xs leading-5 text-white shadow-lg"
        >
          {text}
          <span className="absolute right-1/2 top-full h-2 w-2 translate-x-1/2 -translate-y-1 rotate-45 bg-ink" />
        </span>
      )}
    </span>
  );
}
