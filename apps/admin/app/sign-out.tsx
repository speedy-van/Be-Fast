"use client";

import { adminShellText as text } from "@be-fast/i18n";
import { useState } from "react";
import { adminError, browserSessionRequest } from "../lib/client";

export function SignOut() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function signOut() {
    setPending(true);
    setError(undefined);
    try {
      await browserSessionRequest("logout");
      window.location.replace("/login");
    } catch (cause) {
      setError(adminError(cause));
      setPending(false);
    }
  }

  return (
    <div className="account-actions">
      <button onClick={() => void signOut()} disabled={pending}>
        {pending ? text.signingOut : text.signOut}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
