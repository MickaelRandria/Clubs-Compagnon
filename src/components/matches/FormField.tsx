import type { ReactNode } from 'react';

/** Libellé + champ + message d'erreur. Le champ doit porter id={id} et aria-describedby={`${id}-error`}. */
export function FormField({
  id,
  label,
  optional = false,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="fc-field">
      <label htmlFor={id}>
        {label}
        {optional && <span className="fc-optional">facultatif</span>}
      </label>
      {children}
      {error && (
        <span id={`${id}-error`} className="fc-field-error">
          {error}
        </span>
      )}
      {hint && <span className="fc-field-hint">{hint}</span>}
    </div>
  );
}
