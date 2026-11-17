"use client";

import { adminManagement, adminShellText, messages } from "@be-fast/i18n";
import { type FormEvent, type ReactNode, useRef, useState } from "react";
import { adminError } from "../../lib/client";

const text = adminManagement.common;

export function ResourceMessage({
  resource,
}: {
  resource: {
    loading: boolean;
    error: string | null;
    stale: boolean;
    refresh: () => void;
  };
}) {
  if (resource.loading) return <p role="status">{adminShellText.loading}</p>;
  if (!resource.error) return null;
  return (
    <div className="actions">
      <p role="alert">
        {resource.stale ? adminShellText.stale : resource.error}
      </p>
      <button onClick={resource.refresh}>{adminShellText.retry}</button>
    </div>
  );
}

export function value(form: FormData, name: string) {
  const field = form.get(name);
  return typeof field === "string" ? field.trim() : "";
}

export function CommandForm({
  label,
  children,
  onCommit,
  validate,
}: {
  label: string;
  children?: ReactNode;
  onCommit: (form: FormData) => Promise<unknown>;
  validate?: (form: FormData) => boolean;
}) {
  const [confirmation, setConfirmation] = useState<FormData>();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const confirmButton = useRef<HTMLButtonElement>(null);

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmation) return;
    setSaved(false);
    const form = new FormData(event.currentTarget);
    if (validate && !validate(form)) {
      setError(messages.errors.validationError);
      return;
    }
    setError(undefined);
    setConfirmation(form);
    requestAnimationFrame(() => confirmButton.current?.focus());
  }

  async function confirm() {
    if (!confirmation || submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError(undefined);
    try {
      setSaved((await onCommit(confirmation)) !== false);
      setConfirmation(undefined);
    } catch (cause) {
      setError(adminError(cause));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <form onSubmit={review} noValidate aria-busy={pending}>
      <fieldset className="form-fields" disabled={!!confirmation}>
        {children}
        <button type="submit">{label}</button>
      </fieldset>
      {confirmation && (
        <div
          className="confirmation"
          role="group"
          aria-label={text.confirmation}
        >
          <p>
            {text.confirmation} — {label}
          </p>
          <div className="actions">
            <button
              ref={confirmButton}
              type="button"
              className="primary"
              onClick={() => void confirm()}
              disabled={pending}
            >
              {pending ? text.saving : text.confirm}
            </button>
            <button
              type="button"
              onClick={() => setConfirmation(undefined)}
              disabled={pending}
            >
              {text.back}
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {saved && <p role="status">{text.saved}</p>}
    </form>
  );
}
