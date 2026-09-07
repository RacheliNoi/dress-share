"use client";

import { useEffect, useState } from "react";
import {
  DressPhoto,
  getDressImageUrl,
  getDressOriginalImageUrl,
} from "@/lib/api";
import { buttonClassName } from "./ui/Button";

// A dedicated, large-view home for the AI re-edit action - previously it
// lived as a small icon-button directly on the thumbnail grid, which made
// it hard to actually judge the result at a useful size. Opens on clicking
// any photo in that grid.
export default function PhotoEditModal({
  photo,
  onClose,
  onReprocess,
  reprocessing,
  error,
}: {
  photo: DressPhoto;
  onClose: () => void;
  onReprocess: () => void;
  reprocessing: boolean;
  error: string;
}) {
  const hasEnhanced = Boolean(photo.processedUrl);
  const [showingOriginal, setShowingOriginal] = useState(false);

  // A freshly-reprocessed photo always has an enhanced version again -
  // don't leave the viewer stuck looking at "before" from a previous photo.
  useEffect(() => {
    setShowingOriginal(false);
  }, [photo.id]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const displayUrl =
    hasEnhanced && !showingOriginal
      ? getDressImageUrl(photo)
      : getDressOriginalImageUrl(photo);

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        className="animate-fade-scale-in flex w-full max-w-2xl flex-col overflow-hidden rounded-[24px] bg-surface shadow-[0_32px_72px_-16px_rgba(0,0,0,0.45)]"
      >
        <div className="relative flex items-center justify-center bg-zinc-900">
          <img
            key={displayUrl}
            src={displayUrl}
            alt="תצוגה מוגדלת של תמונת השמלה"
            className="max-h-[65vh] w-full object-contain"
          />

          <button
            type="button"
            onClick={onClose}
            aria-label="סגירה"
            className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-lg font-bold text-white backdrop-blur transition hover:bg-black/70"
          >
            ✕
          </button>

          {hasEnhanced && (
            <div className="absolute bottom-3 right-3 flex gap-1 rounded-full bg-black/50 p-1 backdrop-blur">
              <button
                type="button"
                onClick={() => setShowingOriginal(false)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                  !showingOriginal
                    ? "bg-white text-zinc-900"
                    : "text-white hover:bg-white/10"
                }`}
              >
                אחרי
              </button>
              <button
                type="button"
                onClick={() => setShowingOriginal(true)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                  showingOriginal
                    ? "bg-white text-zinc-900"
                    : "text-white hover:bg-white/10"
                }`}
              >
                לפני
              </button>
            </div>
          )}
        </div>

        <div className="p-5">
          <h2 className="text-lg font-bold text-ink">עריכת תמונה ב-AI</h2>
          <p className="mt-1 text-sm leading-6 text-ink-soft">
            {hasEnhanced
              ? "לא אוהבת את התוצאה? אפשר לבקש עריכה חדשה כמה פעמים שרוצים - זה תמיד יחזור להתחיל מהתמונה המקורית שהעלית."
              : "התמונה עדיין לא עברה עריכת AI. אפשר לבקש עריכה עכשיו."}
          </p>

          {error && (
            <div className="mt-3 rounded-2xl bg-error-soft p-4 text-sm text-error">
              {error}
            </div>
          )}

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={onReprocess}
              disabled={reprocessing}
              className={buttonClassName("primary", "flex-1")}
            >
              {reprocessing ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  עורכת מחדש...
                </>
              ) : (
                "↻ עריכה מחדש"
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              disabled={reprocessing}
              className={buttonClassName("secondary", "flex-1")}
            >
              סגירה
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
