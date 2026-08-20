import { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "danger";

const base =
  "inline-flex items-center justify-center gap-2 rounded-2xl text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-ink px-5 py-3 text-white shadow-sm hover:bg-ink/80 hover:shadow-md",
  secondary:
    "border border-line-strong bg-transparent px-5 py-3 text-ink hover:border-accent hover:text-accent",
  tertiary:
    "px-1 py-1 text-accent underline underline-offset-4 hover:text-accent-deep",
  danger:
    "border border-error-soft bg-transparent px-5 py-3 text-error hover:bg-error-soft",
};

export function buttonClassName(
  variant: ButtonVariant = "primary",
  className = "",
) {
  return `${base} ${variants[variant]} ${className}`.trim();
}

export default function Button({
  variant = "primary",
  fullWidth = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  fullWidth?: boolean;
}) {
  return (
    <button
      className={buttonClassName(variant, `${fullWidth ? "w-full" : ""} ${className}`)}
      {...props}
    />
  );
}
