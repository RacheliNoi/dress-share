import { InputHTMLAttributes, TextareaHTMLAttributes, useId } from "react";

const fieldBase =
  "w-full rounded-[10px] border bg-surface px-4 py-3 text-ink outline-none transition placeholder:text-ink-faint focus:ring-4";

function fieldClassName(hasError: boolean, className: string) {
  const state = hasError
    ? "border-error focus:border-error focus:ring-error-soft"
    : "border-line-strong focus:border-accent focus:ring-accent-soft";

  return `${fieldBase} ${state} ${className}`.trim();
}

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  hint?: string;
};

export function TextField({
  label,
  error,
  hint,
  id,
  className = "",
  ...props
}: TextFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <div>
      {label && (
        <label
          htmlFor={fieldId}
          className="mb-1.5 block text-sm font-medium text-ink-soft"
        >
          {label}
        </label>
      )}

      <input
        id={fieldId}
        className={fieldClassName(Boolean(error), className)}
        {...props}
      />

      {error ? (
        <p className="mt-1.5 text-xs text-error">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
  hint?: string;
};

export function TextArea({
  label,
  error,
  hint,
  id,
  className = "",
  ...props
}: TextAreaProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <div>
      {label && (
        <label
          htmlFor={fieldId}
          className="mb-1.5 block text-sm font-medium text-ink-soft"
        >
          {label}
        </label>
      )}

      <textarea
        id={fieldId}
        className={fieldClassName(Boolean(error), className)}
        {...props}
      />

      {error ? (
        <p className="mt-1.5 text-xs text-error">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}

export default TextField;
