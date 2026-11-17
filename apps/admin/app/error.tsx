"use client";

import { adminShellText as text, messages } from "@be-fast/i18n";

export default function AdminErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <p role="alert">{messages.errors.internalError}</p>
        <button onClick={reset}>{text.retry}</button>
      </section>
    </main>
  );
}
