"use client";

import { useEffect } from "react";
import { buttonClassName } from "./Button";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "אישור",
  cancelLabel = "ביטול",
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  if (!open) {
    return null;
  }

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(event) => event.stopPropagation()}
        className="animate-fade-scale-in w-full max-w-sm rounded-[20px] bg-surface p-6 shadow-[0_24px_56px_-16px_rgba(34,31,31,0.35)]"
      >
        <h2 id="confirm-dialog-title" className="text-lg font-bold text-ink">
          {title}
        </h2>

        {description && (
          <p className="mt-2 text-sm leading-6 text-ink-soft">{description}</p>
        )}

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={buttonClassName(danger ? "danger" : "primary", "flex-1")}
          >
            {loading ? "מבצעת..." : confirmLabel}
          </button>

          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className={buttonClassName("secondary", "flex-1")}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
