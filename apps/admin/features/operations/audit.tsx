"use client";

import { adminAuditLogSchema } from "@be-fast/contracts";
import { formatMoney } from "@be-fast/domain";
import { adminOperations as text, formatAdminDateTime } from "@be-fast/i18n";
import { useState, type FormEvent, type ReactNode } from "react";
import { useAdminResource } from "../../lib/use-admin-resource";
import {
  ResourceNotice,
  readField,
  whenEmpty,
  type AdminSectionProps,
} from "./shared";

type AuditEntry = ReturnType<
  typeof adminAuditLogSchema.parse
>["entries"][number];

function lookup<T extends Record<string, string>>(
  labels: T,
  value: string,
): string | undefined {
  return Object.hasOwn(labels, value) ? labels[value as keyof T] : undefined;
}

function auditValue(
  field: string,
  value: unknown,
  currency: AdminSectionProps["currencyDisplayMode"],
): ReactNode {
  if (typeof value === "boolean")
    return value ? text.audit.true : text.audit.false;
  if (typeof value === "number") {
    return (
      <bdi>
        {field === "amountMinor" ? formatMoney(value, currency) : value}
      </bdi>
    );
  }
  if (typeof value !== "string") return text.common.notAvailable;
  const label =
    field === "status"
      ? (lookup(text.orders.status, value) ??
        lookup(text.restaurants.status, value) ??
        lookup(text.audit.complaintStatus, value))
      : field === "reasonCode"
        ? lookup(text.orders.reason, value)
        : field === "role"
          ? lookup(text.audit.role, value)
          : field === "type"
            ? lookup(text.finance.entryType, value)
            : field === "value"
              ? lookup(text.audit.currency, value)
              : undefined;
  if (label) return label;
  if (field.endsWith("At") && !Number.isNaN(Date.parse(value)))
    return formatAdminDateTime(value);
  return <bdi>{value}</bdi>;
}

function ChangeValues({
  entry,
  values,
  currency,
}: {
  entry: AuditEntry;
  values: AuditEntry["before"];
  currency: AdminSectionProps["currencyDisplayMode"];
}) {
  if (!values || typeof values !== "object" || Array.isArray(values))
    return <p>{text.common.notAvailable}</p>;
  const fields = Object.entries(values).flatMap(([key, value]) => {
    const label =
      key === "value"
        ? (lookup(text.audit.setting, entry.entityId) ??
          text.audit.fields.value)
        : lookup(text.audit.fields, key);
    return label ? [{ key, label, value }] : [];
  });
  if (!fields.length) return <p>{text.common.notAvailable}</p>;
  return (
    <dl>
      {fields.map(({ key, label, value }) => (
        <div key={key}>
          <dt>{label}</dt>
          <dd>{auditValue(key, value, currency)}</dd>
        </div>
      ))}
    </dl>
  );
}

function AuditRow({
  entry,
  currency,
}: {
  entry: AuditEntry;
  currency: AdminSectionProps["currencyDisplayMode"];
}) {
  const entity = lookup(text.audit.setting, entry.entityId);
  return (
    <li className="panel">
      <strong>
        {lookup(text.audit.actions, entry.action) ?? text.audit.unknownAction}
      </strong>{" "}
      {entity ?? <bdi>{entry.entityId}</bdi>}{" "}
      <time dateTime={entry.createdAt}>
        {formatAdminDateTime(entry.createdAt)}
      </time>
      <details>
        <summary>{text.audit.changes}</summary>
        <dl>
          <div>
            <dt>{text.audit.actorId}</dt>
            <dd>
              <bdi>{entry.adminUserId}</bdi>
            </dd>
          </div>
          <div>
            <dt>{text.audit.networkAddress}</dt>
            <dd>
              <bdi>{entry.ip}</bdi>
            </dd>
          </div>
        </dl>
        <h3>{text.audit.before}</h3>
        <ChangeValues entry={entry} values={entry.before} currency={currency} />
        <h3>{text.audit.after}</h3>
        <ChangeValues entry={entry} values={entry.after} currency={currency} />
      </details>
    </li>
  );
}

export function AuditSection({ currencyDisplayMode }: AdminSectionProps) {
  const [filters, setFilters] = useState({ action: "", entityId: "" });
  const [cursors, setCursors] = useState<string[]>([]);
  const query = new URLSearchParams();
  if (filters.action !== "") query.set("action", filters.action);
  if (filters.entityId !== "") query.set("entityId", filters.entityId);
  const cursor = cursors.at(-1);
  if (cursor) query.set("cursor", cursor);
  const resource = useAdminResource(
    query.size === 0 ? "/admin/audit-log" : `/admin/audit-log?${query}`,
    adminAuditLogSchema,
  );
  const nextCursor = resource.data?.nextCursor;

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setFilters({
      action: readField(fields, "action"),
      entityId: readField(fields, "entity"),
    });
    setCursors([]);
  }

  return (
    <>
      <form className="filters" onSubmit={search}>
        <label>
          {text.audit.action}
          <select name="action" defaultValue="">
            <option value="">{text.common.all}</option>
            {Object.entries(text.audit.actions).map(([action, label]) => (
              <option key={action} value={action}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {text.audit.entityId}
          <input name="entity" maxLength={200} />
        </label>
        <button type="submit">{text.common.search}</button>
      </form>
      <ResourceNotice {...resource} />
      {whenEmpty(resource.data?.entries)}
      {resource.data && resource.data.entries.length > 0 && (
        <ol className="data-list">
          {resource.data.entries.map((entry) => (
            <AuditRow
              key={entry.id}
              entry={entry}
              currency={currencyDisplayMode}
            />
          ))}
        </ol>
      )}
      {cursors.length > 0 && (
        <button
          type="button"
          onClick={() => setCursors((current) => current.slice(0, -1))}
        >
          {text.common.previousPage}
        </button>
      )}
      {nextCursor && (
        <button
          type="button"
          onClick={() => setCursors((current) => [...current, nextCursor])}
        >
          {text.common.nextPage}
        </button>
      )}
    </>
  );
}
