import { notFound } from "next/navigation";
import { findSection } from "../../lib/navigation";
import { AdminPage } from "../admin-page";

export default async function SectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const page = findSection(`/${section}`);
  if (!page) notFound();
  return <AdminPage section={page} />;
}
