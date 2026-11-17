export interface AdminE2eCredential {
  email: string;
  password: string;
  totpSecret: string;
}

export interface AdminE2eFixtures {
  accounts: Record<"superAdmin" | "support" | "supportApi", AdminE2eCredential>;
  restaurant: { id: string; name: string; neighborhoodId: string };
  financeRestaurantName: string;
  order: { id: string; orderNumber: string };
}

export type AdminE2eStartup =
  | { status: "ready"; fixtures: AdminE2eFixtures }
  | { status: "failed"; phase: "database" | "fixtures" | "http" };

export const adminE2eApiPort = 43118;
export const adminE2eApiUrl = `http://127.0.0.1:${adminE2eApiPort}`;
export const adminE2eWebPort = 43117;
export const adminE2eWebUrl = `http://127.0.0.1:${adminE2eWebPort}`;
export const adminE2eFixtureEnv = "BE_FAST_ADMIN_E2E_FIXTURES";
