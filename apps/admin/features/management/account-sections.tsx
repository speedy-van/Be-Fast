"use client";

import {
  adminCustomerBlockSchema,
  adminCustomerDetailSchema,
  adminCustomerSearchQuerySchema,
  adminCustomerSearchSchema,
  adminSettingsSchema,
  adminUserListSchema,
  adminUserRoleSchema,
  type AdminSettings,
} from "@be-fast/contracts";
import { ADMIN_ROLES, formatMoney, type AdminRole } from "@be-fast/domain";
import {
  adminManagement as text,
  adminOperations,
  adminShellText,
  messages,
} from "@be-fast/i18n";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { adminRequest } from "../../lib/client";
import { useAdminResource } from "../../lib/use-admin-resource";
import { CommandForm, ResourceMessage, value } from "./shared";

const common = text.common;
const settingsPath = "/admin/settings";
type CurrencyMode = AdminSettings["currencyDisplayMode"];

function CustomerDetail({
  id,
  role,
  currencyDisplayMode,
}: {
  id: string;
  role: AdminRole;
  currencyDisplayMode: CurrencyMode;
}) {
  const path = `/admin/customers/${id}`;
  const resource = useAdminResource(path, adminCustomerDetailSchema);
  const detail = resource.data;
  if (!detail) return <ResourceMessage resource={resource} />;
  const { customer, orders } = detail;
  const blocked = customer.blockedAt !== null;
  const payload = (form: FormData) => ({
    blocked: !blocked,
    reason: value(form, "reason"),
  });
  return (
    <section className="panel">
      <ResourceMessage resource={resource} />
      <h2>{customer.name ?? common.notSpecified}</h2>
      <p>
        <bdi dir="ltr">{customer.phone ?? common.notSpecified}</bdi>
      </p>
      <p>{blocked ? text.customer.blocked : common.active}</p>
      {role === "SUPER_ADMIN" && (
        <CommandForm
          key={String(blocked)}
          label={blocked ? text.customer.unblock : text.customer.block}
          validate={(form) =>
            adminCustomerBlockSchema.safeParse(payload(form)).success
          }
          onCommit={async (form) => {
            await adminRequest(`${path}/block`, {
              method: "PATCH",
              body: payload(form),
            });
            resource.refresh();
          }}
        >
          <label>
            {common.reason}
            <textarea name="reason" maxLength={500} required />
          </label>
        </CommandForm>
      )}
      <h3>{text.customer.orders}</h3>
      {orders.length === 0 ? (
        <p>{adminShellText.empty}</p>
      ) : (
        <ul className="data-list">
          {orders.map((order) => (
            <li key={order.id}>
              <bdi dir="ltr">{order.orderNumber}</bdi> ·{" "}
              {adminOperations.orders.status[order.status]}
              {order.totalMinor === undefined
                ? null
                : ` · ${formatMoney(order.totalMinor, currencyDisplayMode)}`}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function CustomersSection({
  role,
  currencyDisplayMode,
}: {
  role: AdminRole;
  currencyDisplayMode: CurrencyMode;
}) {
  const [phone, setPhone] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState(false);
  const resource = useAdminResource(
    phone ? `/admin/customers?${new URLSearchParams({ phone })}` : null,
    adminCustomerSearchSchema,
  );

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = adminCustomerSearchQuerySchema.safeParse({
      phone: value(new FormData(event.currentTarget), "phone"),
    });
    setError(!result.success);
    if (!result.success) return;
    setSelected(undefined);
    if (result.data.phone === phone) resource.refresh();
    else setPhone(result.data.phone);
  }

  return (
    <>
      <form className="panel" onSubmit={search} noValidate>
        <label>
          {text.customer.phone}
          <input name="phone" type="tel" dir="ltr" required />
        </label>
        {error && <p role="alert">{messages.errors.validationError}</p>}
        <button type="submit" className="primary">
          {common.search}
        </button>
      </form>
      <ResourceMessage resource={resource} />
      {resource.data?.customers.length === 0 && <p>{adminShellText.empty}</p>}
      {resource.data?.customers.map((customer) => (
        <button
          key={customer.id}
          onClick={() => setSelected(customer.id)}
          aria-pressed={selected === customer.id}
        >
          {customer.name ?? customer.phone ?? common.notSpecified}
        </button>
      ))}
      {selected && (
        <CustomerDetail
          key={selected}
          id={selected}
          role={role}
          currencyDisplayMode={currencyDisplayMode}
        />
      )}
    </>
  );
}

export function UsersSection() {
  const resource = useAdminResource("/admin/users", adminUserListSchema);
  const [selected, setSelected] = useState<string>();
  return (
    <>
      <ResourceMessage resource={resource} />
      {resource.data?.users.length === 0 && <p>{adminShellText.empty}</p>}
      {resource.data?.users.map((user) => (
        <article key={user.id} className="stack">
          <h2>
            <bdi dir="ltr">{user.email}</bdi>
          </h2>
          <p>
            {adminShellText.roles[user.role]} ·{" "}
            {user.isActive ? common.active : common.inactive}
          </p>
          <button
            onClick={() =>
              setSelected((current) =>
                current === user.id ? undefined : user.id,
              )
            }
            aria-expanded={selected === user.id}
          >
            {text.users.changeRole}
          </button>
          {selected === user.id && (
            <CommandForm
              key={user.role}
              label={common.save}
              validate={(form) =>
                adminUserRoleSchema.safeParse({ role: value(form, "role") })
                  .success
              }
              onCommit={async (form) => {
                await adminRequest(`/admin/users/${user.id}/role`, {
                  method: "PATCH",
                  body: { role: value(form, "role") },
                });
                resource.refresh();
              }}
            >
              <label>
                {text.users.role}
                <select name="role" defaultValue={user.role}>
                  {ADMIN_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {adminShellText.roles[role]}
                    </option>
                  ))}
                </select>
              </label>
            </CommandForm>
          )}
        </article>
      ))}
    </>
  );
}

const settingFields = [
  ["reminderAfterSec", text.settings.reminder],
  ["attentionAfterSec", text.settings.attention],
  ["expireAfterSec", text.settings.expiry],
  ["defaultCommissionRateBps", text.settings.commission],
] as const;

function settingsPayload(form: FormData) {
  return {
    reminderAfterSec: Number(value(form, "reminderAfterSec") || NaN),
    attentionAfterSec: Number(value(form, "attentionAfterSec") || NaN),
    expireAfterSec: Number(value(form, "expireAfterSec") || NaN),
    defaultCommissionRateBps: Number(
      value(form, "defaultCommissionRateBps") || NaN,
    ),
    currencyDisplayMode: value(form, "currencyDisplayMode"),
  };
}

export function SettingsSection() {
  const resource = useAdminResource(settingsPath, adminSettingsSchema);
  const router = useRouter();
  const settings = resource.data;
  return (
    <>
      <ResourceMessage resource={resource} />
      {settings && (
        <section className="panel">
          <CommandForm
            key={JSON.stringify(settings)}
            label={common.save}
            validate={(form) =>
              adminSettingsSchema.safeParse(settingsPayload(form)).success
            }
            onCommit={async (form) => {
              const submitted = adminSettingsSchema.parse(
                settingsPayload(form),
              );
              const changes = Object.fromEntries(
                Object.entries(submitted).filter(
                  ([key, submittedValue]) =>
                    submittedValue !== settings[key as keyof AdminSettings],
                ),
              );
              if (!Object.keys(changes).length) return false;
              await adminRequest(
                settingsPath,
                { method: "PATCH", body: changes },
                adminSettingsSchema,
              );
              resource.refresh();
              router.refresh();
            }}
          >
            {settingFields.map(([name, label]) => (
              <label key={name}>
                {label}
                <input
                  name={name}
                  type="number"
                  step="1"
                  dir="ltr"
                  defaultValue={settings[name]}
                  required
                />
              </label>
            ))}
            <label>
              {text.settings.currency}
              <select
                name="currencyDisplayMode"
                defaultValue={settings.currencyDisplayMode}
              >
                {Object.entries(text.settings.modes).map(([mode, label]) => (
                  <option key={mode} value={mode}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </CommandForm>
        </section>
      )}
    </>
  );
}
