import { adminShellText, messages } from "@be-fast/i18n";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="auth-page" aria-labelledby="login-heading">
      <section className="auth-card">
        <span className="brand-mark" aria-hidden="true">
          {adminShellText.product}
        </span>
        <h1 id="login-heading">{messages.apps.admin}</h1>
        <LoginForm />
      </section>
    </main>
  );
}
