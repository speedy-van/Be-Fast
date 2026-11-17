"use client";

import { ApiClientError } from "@be-fast/api-client";
import { adminShellText as text } from "@be-fast/i18n";
import { useEffect, useRef, useState } from "react";
import { adminError, browserSessionRequest } from "../../lib/client";

export function SessionRestore({ destination }: { destination: string }) {
  const started = useRef(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void browserSessionRequest("refresh").then(
      () => window.location.replace(destination),
      (cause: unknown) => {
        if (cause instanceof ApiClientError && cause.status === 401)
          window.location.replace("/login");
        else setError(adminError(cause));
      },
    );
  }, [destination]);

  return (
    <main className="auth-page">
      <div className="auth-card">
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button onClick={() => window.location.reload()}>
              {text.retry}
            </button>
          </>
        ) : (
          <p role="status">{text.restoringSession}</p>
        )}
      </div>
    </main>
  );
}
