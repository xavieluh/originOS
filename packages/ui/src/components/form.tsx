import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cx } from "../cx.js";

const control =
  "w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted " +
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus aria-[invalid=true]:border-negative";

interface FieldProps {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  /** Validation message. Sets aria-invalid and is announced with the field. */
  readonly error?: string;
  readonly required?: boolean;
}

function describedBy(id: string, description?: string, error?: string): string | undefined {
  const ids = [description ? `${id}-description` : "", error ? `${id}-error` : ""].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

function FieldFrame({
  id,
  label,
  description,
  error,
  required,
  children,
}: FieldProps & { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
        {required ? <span className="text-fg-muted"> (required)</span> : null}
      </label>
      {description ? (
        <p id={`${id}-description`} className="text-sm text-fg-muted">
          {description}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm font-medium text-negative">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({
  id,
  label,
  description,
  error,
  required,
  className,
  ...input
}: FieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, "id">) {
  return (
    <FieldFrame
      id={id}
      label={label}
      {...(description ? { description } : {})}
      {...(error ? { error } : {})}
      {...(required ? { required } : {})}
    >
      <input
        id={id}
        className={cx(control, className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, description, error)}
        required={required}
        {...input}
      />
    </FieldFrame>
  );
}

export function TextArea({
  id,
  label,
  description,
  error,
  required,
  className,
  ...input
}: FieldProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id">) {
  return (
    <FieldFrame
      id={id}
      label={label}
      {...(description ? { description } : {})}
      {...(error ? { error } : {})}
      {...(required ? { required } : {})}
    >
      <textarea
        id={id}
        className={cx(control, "min-h-24", className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, description, error)}
        required={required}
        {...input}
      />
    </FieldFrame>
  );
}

export function SelectField({
  id,
  label,
  description,
  error,
  required,
  options,
  className,
  ...select
}: FieldProps & { readonly options: readonly { value: string; label: string }[] } & Omit<
    SelectHTMLAttributes<HTMLSelectElement>,
    "id"
  >) {
  return (
    <FieldFrame
      id={id}
      label={label}
      {...(description ? { description } : {})}
      {...(error ? { error } : {})}
      {...(required ? { required } : {})}
    >
      <select
        id={id}
        className={cx(control, className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, description, error)}
        required={required}
        {...select}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldFrame>
  );
}

export function Checkbox({
  id,
  label,
  description,
  ...input
}: { readonly id: string; readonly label: string; readonly description?: string } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "type"
>) {
  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-4 rounded border-border-strong accent-[var(--oo-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        aria-describedby={description ? `${id}-description` : undefined}
        {...input}
      />
      <div>
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {label}
        </label>
        {description ? (
          <p id={`${id}-description`} className="text-sm text-fg-muted">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
