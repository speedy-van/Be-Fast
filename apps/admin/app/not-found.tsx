import { messages } from "@be-fast/i18n";

export default function NotFound() {
  return (
    <main className="p-6">
      <h1 className="text-xl font-bold">{messages.errors.pageNotFound}</h1>
    </main>
  );
}
