"use client";

import type { AdminRole, DisplayMode } from "@be-fast/domain";
import { adminOperations as text } from "@be-fast/i18n";
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { adminError } from "../../lib/client";

export interface AdminSectionProps {
  role: AdminRole;
  currencyDisplayMode: DisplayMode;
}

export function ResourceNotice({
  loading,
  error,
  stale,
  refresh,
}: {
  loading: boolean;
  error: string | null;
  stale: boolean;
  refresh: () => unknown;
}) {
  if (error || stale) {
    return (
      <p role="status">
        {stale ? text.common.stale : error}{" "}
        <button type="button" onClick={refresh}>
          {text.common.retry}
        </button>
      </p>
    );
  }
  return loading ? <p role="status">{text.common.loading}</p> : null;
}

export function Confirmation({
  title,
  children,
  onConfirm,
  onClose,
  onSaved,
}: {
  title: string;
  children: ReactNode;
  onConfirm: (data: FormData) => Promise<void>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const headingId = useId();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const data = new FormData(event.currentTarget);
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(data);
      onSaved();
    } catch (error) {
      setError(adminError(error));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId}>{text.common.confirmation}</h3>
      <p>{title}</p>
      <form onSubmit={submit}>
        <fieldset className="stack" disabled={busy}>
          {children}
          {error && <p role="alert">{error}</p>}
          <div className="actions">
            <button type="submit">
              {busy ? text.common.submitting : text.common.confirm}
            </button>
            <button type="button" onClick={onClose}>
              {text.common.close}
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}

export function requiredReasonField() {
  return (
    <label>
      {text.common.reason}
      <textarea name="reason" required />
    </label>
  );
}

export function readField(data: FormData, key: string): string {
  return String(data.get(key) ?? "").trim();
}

export function whenEmpty<T>(data: readonly T[] | undefined) {
  return data?.length === 0 ? <p>{text.common.empty}</p> : null;
}
