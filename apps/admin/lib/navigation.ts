import type { AdminRole } from "@be-fast/domain";

export const sections = [
  "dashboard",
  "restaurants",
  "orders",
  "customers",
  "regions",
  "categories",
  "finance",
  "complaints",
  "users",
  "settings",
  "audit",
] as const;
export type Section = (typeof sections)[number];

const permissions: Record<Section, readonly AdminRole[]> = {
  dashboard: ["SUPER_ADMIN", "OPERATIONS", "FINANCE", "SUPPORT"],
  restaurants: ["SUPER_ADMIN", "OPERATIONS", "FINANCE"],
  orders: ["SUPER_ADMIN", "OPERATIONS", "SUPPORT"],
  customers: ["SUPER_ADMIN", "SUPPORT"],
  regions: ["SUPER_ADMIN", "OPERATIONS"],
  categories: ["SUPER_ADMIN", "OPERATIONS"],
  finance: ["SUPER_ADMIN", "FINANCE"],
  complaints: ["SUPER_ADMIN", "OPERATIONS", "SUPPORT"],
  users: ["SUPER_ADMIN"],
  settings: ["SUPER_ADMIN"],
  audit: ["SUPER_ADMIN"],
};

export function canViewSection(section: Section, role: AdminRole) {
  return permissions[section].includes(role);
}

export function sectionPath(section: Section) {
  return section === "dashboard" ? "/" : `/${section}`;
}

export function findSection(path: string) {
  return sections.find((section) => sectionPath(section) === path);
}
