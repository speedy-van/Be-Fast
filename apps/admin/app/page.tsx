import { messages } from "@be-fast/i18n";

export default function HomePage() {
  return (
    <main className="p-6">
      <h1 className="text-xl font-bold">{messages.apps.admin}</h1>
    </main>
  );
}
