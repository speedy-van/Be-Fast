import { SessionRestore } from "./session-restore";
import { findSection } from "../../lib/navigation";

export default async function SessionPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  const origin = "http://admin.invalid";
  const url = typeof next === "string" ? URL.parse(next, origin) : null;
  const destination =
    url && url.origin === origin && findSection(url.pathname)
      ? url.pathname + url.search
      : "/";
  return <SessionRestore destination={destination} />;
}
