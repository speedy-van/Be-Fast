import { adminShellText as text, messages } from "@be-fast/i18n";
import Link from "next/link";
import {
  AuditSection,
  DashboardSection,
  FinanceSection,
  OrdersSection,
  RestaurantsSection,
} from "../features/operations";
import {
  CategoriesSection,
  ComplaintsSection,
  CustomersSection,
  RegionsSection,
  SettingsSection,
  UsersSection,
} from "../features/management";
import {
  canViewSection,
  sectionPath,
  sections,
  type Section,
} from "../lib/navigation";
import { requireAdminSession } from "../lib/session";
import { SignOut } from "./sign-out";

const views = {
  dashboard: DashboardSection,
  restaurants: RestaurantsSection,
  orders: OrdersSection,
  customers: CustomersSection,
  regions: RegionsSection,
  categories: CategoriesSection,
  finance: FinanceSection,
  complaints: ComplaintsSection,
  users: UsersSection,
  settings: SettingsSection,
  audit: AuditSection,
};

export async function AdminPage({ section }: { section: Section }) {
  const session = await requireAdminSession(sectionPath(section));
  const View = views[section];
  const allowed = canViewSection(section, session.role);

  return (
    <div className="admin-layout">
      <aside className="sidebar">
        <Link className="site-brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            {text.product}
          </span>
          <span>{messages.apps.admin}</span>
        </Link>
        <nav aria-label={text.navigation}>
          {sections
            .filter((item) => canViewSection(item, session.role))
            .map((item) => (
              <Link
                key={item}
                href={sectionPath(item)}
                aria-current={item === section ? "page" : undefined}
              >
                {text[item]}
              </Link>
            ))}
        </nav>
      </aside>
      <div className="workspace">
        <header className="workspace-header">
          <span>{text.roles[session.role]}</span>
          <SignOut />
        </header>
        <main className="workspace-main" aria-labelledby="section-heading">
          <h1 id="section-heading">{text[section]}</h1>
          {allowed ? (
            <View
              role={session.role}
              currencyDisplayMode={session.currencyDisplayMode}
            />
          ) : (
            <p role="alert">{messages.errors.forbidden}</p>
          )}
        </main>
      </div>
    </div>
  );
}
