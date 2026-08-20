import { ReactNode } from "react";

type FormMessageProps = {
  variant: "error" | "success";
  children: ReactNode;
  action?: { label: string; onClick: () => void };
  className?: string;
};

const variants = {
  error: "bg-error-soft text-error",
  success: "bg-success-soft text-success",
};

export default function FormMessage({
  variant,
  children,
  action,
  className = "",
}: FormMessageProps) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm ${variants[variant]} ${className}`.trim()}
    >
      <span>{children}</span>

      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="shrink-0 font-bold underline underline-offset-4"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
