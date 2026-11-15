"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";

export interface AuthField {
  name: string;
  label: string;
  type: "email" | "password" | "text" | "select";
  autoComplete: string;
  hint?: string;
  options?: { value: string; label: string }[];
}

interface Props {
  endpoint: string;
  fields: AuthField[];
  submitLabel: string;
  /** Sent with every submit (e.g. the reset token). */
  extraBody?: Record<string, string>;
  /** Attach the browser's IANA timezone (registration). */
  withTimezone?: boolean;
  /** After success: go here (and refresh server components), or show a message instead. */
  redirectTo?: string;
  successMessage?: string;
  footer?: ReactNode;
  /** HTTP method (default POST). Profile edits use PATCH. */
  method?: "POST" | "PATCH" | "PUT";
  initialValues?: Record<string, string>;
  /** Show the success message above the form and keep the form (instead of replacing it). */
  keepForm?: boolean;
  /** Clear the typed values after success (passwords). */
  resetOnSuccess?: boolean;
  /** Style the submit button as a destructive action. */
  danger?: boolean;
  /** Fields the server must not get to see as empty-required, e.g. selects with defaults. */
}

interface ApiErrorBody { error?: { code?: string; message?: string; details?: { path: string; message: string }[] } }

export function AuthForm({ endpoint, fields, submitLabel, extraBody, withTimezone, redirectTo, successMessage, footer, method = "POST", initialValues, keepForm, resetOnSuccess, danger }: Props) {
  const router = useRouter();
  const id = useId();
  const [values, setValues] = useState<Record<string, string>>(initialValues ?? {});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setNotice(null);
    const missing: Record<string, string> = {};
    for (const f of fields) if (!values[f.name]?.trim()) missing[f.name] = `${f.label} is required`;
    setFieldErrors(missing);
    if (Object.keys(missing).length) return;

    setBusy(true);
    try {
      const body: Record<string, string> = { ...values, ...extraBody };
      if (withTimezone) body["timezone"] = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch(endpoint, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) {
        if (redirectTo) {
          router.replace(redirectTo);
          router.refresh();
          return;
        }
        if (keepForm) {
          setNotice(successMessage ?? "Saved.");
          setFieldErrors({});
          if (resetOnSuccess) setValues({});
          router.refresh();
          return;
        }
        setDone(successMessage ?? "Done.");
        return;
      }
      const err = ((await res.json().catch(() => null)) as ApiErrorBody | null)?.error;
      if (res.status === 422 && err?.details?.length) {
        setFieldErrors(Object.fromEntries(err.details.map((d) => [d.path, d.message])));
        setFormError("Please fix the highlighted fields.");
      } else if (res.status === 429) {
        setFormError("Too many attempts. Please wait a few minutes and try again.");
      } else {
        setFormError(err?.message ?? "Something went wrong. Please try again.");
      }
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) return <p className="auth__done" role="status">{done}</p>;

  return (
    <form onSubmit={onSubmit} noValidate className="auth__form">
      {notice ? <p className="editor__saved" role="status">{notice}</p> : null}
      {formError ? <p className="auth__error" role="alert">{formError}</p> : null}
      {fields.map((f) => {
        const fid = `${id}-${f.name}`;
        const err = fieldErrors[f.name];
        return (
          <div className="auth__field" key={f.name}>
            <label htmlFor={fid}>{f.label}</label>
            {f.type === "select" ? (
              <select id={fid} name={f.name} value={values[f.name] ?? ""} onChange={(ev) => setValues((v) => ({ ...v, [f.name]: ev.target.value }))} aria-invalid={err ? true : undefined} aria-describedby={err ? `${fid}-err` : f.hint ? `${fid}-hint` : undefined}>
                {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input
                id={fid} name={f.name} type={f.type} autoComplete={f.autoComplete} value={values[f.name] ?? ""}
                onChange={(ev) => setValues((v) => ({ ...v, [f.name]: ev.target.value }))}
                aria-invalid={err ? true : undefined} aria-describedby={err ? `${fid}-err` : f.hint ? `${fid}-hint` : undefined}
                spellCheck={false} autoCapitalize="none"
              />
            )}
            {err ? <p id={`${fid}-err`} className="auth__field-error">{err}</p> : f.hint ? <p id={`${fid}-hint`} className="auth__hint">{f.hint}</p> : null}
          </div>
        );
      })}
      <Button type="submit" disabled={busy} className={danger ? "btn--danger-solid" : undefined}>{busy ? "Please wait…" : submitLabel}</Button>
      {footer ? <div className="auth__footer">{footer}</div> : null}
    </form>
  );
}

export function AuthLinks({ links }: { links: { href: string; label: string }[] }) {
  return <>{links.map((l, i) => <span key={l.href}>{i > 0 ? " · " : ""}<Link href={l.href}>{l.label}</Link></span>)}</>;
}
