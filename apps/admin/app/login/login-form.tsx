"use client";

import { adminLoginSchema } from "@be-fast/contracts";
import { adminShellText as text, messages } from "@be-fast/i18n";
import { type FormEvent, useRef, useState } from "react";
import { adminError, browserSessionRequest } from "../../lib/client";

export function LoginForm() {
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const values = new FormData(event.currentTarget);
    const result = adminLoginSchema.safeParse({
      email: values.get("email"),
      password: values.get("password"),
      totp: values.get("totp"),
    });
    if (!result.success) {
      setError(messages.errors.validationError);
      return;
    }
    submitting.current = true;
    setPending(true);
    setError(undefined);
    try {
      await browserSessionRequest("login", result.data);
      window.location.replace("/");
    } catch (cause) {
      setError(adminError(cause));
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="auth-form"
      aria-busy={pending}
    >
      <label>
        {text.email}
        <input
          name="email"
          type="email"
          dir="ltr"
          autoComplete="username"
          required
        />
      </label>
      <label>
        {text.password}
        <input
          name="password"
          type="password"
          dir="ltr"
          autoComplete="current-password"
          required
        />
      </label>
      <label>
        {text.totp}
        <input
          name="totp"
          inputMode="numeric"
          dir="ltr"
          autoComplete="one-time-code"
          maxLength={6}
          required
          aria-describedby="totp-help"
        />
      </label>
      <p id="totp-help" className="muted">
        {text.useTotp}
      </p>
      {error && <p role="alert">{error}</p>}
      <button type="submit" className="primary" disabled={pending}>
        {pending ? text.signingIn : text.signIn}
      </button>
    </form>
  );
}
