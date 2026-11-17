"use client";

import {
  adminComplaintListSchema,
  adminComplaintSchema,
  complaintStatuses,
  reviewComplaintSchema,
} from "@be-fast/contracts";
import type { AdminRole } from "@be-fast/domain";
import { adminManagement as text, adminShellText } from "@be-fast/i18n";
import { useState } from "react";
import { adminRequest } from "../../lib/client";
import { useAdminResource } from "../../lib/use-admin-resource";
import { CommandForm, ResourceMessage, value } from "./shared";

const labels = text.complaints;

function ComplaintDetail({
  id,
  role,
  onSaved,
}: {
  id: string;
  role: AdminRole;
  onSaved: () => void;
}) {
  const path = `/admin/complaints/${id}`;
  const resource = useAdminResource(path, adminComplaintSchema);
  const complaint = resource.data;
  if (!complaint) return <ResourceMessage resource={resource} />;
  const verified = complaint.nonDeliveryVerifiedAt !== null;
  const canVerify =
    complaint.type === "NOT_RECEIVED" &&
    !verified &&
    complaint.status !== "RESOLVED";
  const formRecord = (form: FormData) => {
    const internalNotes = value(form, "notes") || null;
    if (form.has("verify")) return { verifyNonDelivery: true, internalNotes };
    if (verified) return { internalNotes };
    return { status: value(form, "status"), internalNotes };
  };
  function reload() {
    resource.refresh();
    onSaved();
  }

  return (
    <section className="panel">
      <ResourceMessage resource={resource} />
      <h2>{labels.details}</h2>
      <h3>
        {labels.types[complaint.type]} · {labels.statuses[complaint.status]}
      </h3>
      <p>
        {labels.order} <bdi dir="ltr">{complaint.orderId}</bdi>
      </p>
      <p>{complaint.text}</p>
      {verified && <p>{labels.verified}</p>}
      <CommandForm
        key={complaint.updatedAt}
        label={labels.review}
        validate={(form) =>
          (!form.has("verify") || !!value(form, "notes")) &&
          reviewComplaintSchema.safeParse(formRecord(form)).success
        }
        onCommit={async (form) => {
          await adminRequest(
            path,
            { method: "PATCH", body: formRecord(form) },
            adminComplaintSchema,
          );
          reload();
        }}
      >
        {!verified && (
          <label>
            {text.common.status}
            <select name="status" defaultValue={complaint.status}>
              {complaintStatuses.map((status) => (
                <option key={status} value={status}>
                  {labels.statuses[status]}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          {labels.notes}
          <textarea name="notes" defaultValue={complaint.internalNotes ?? ""} />
        </label>
        {canVerify && (
          <label className="check-input">
            <input type="checkbox" name="verify" />
            {labels.verify}
          </label>
        )}
      </CommandForm>
      {role === "SUPER_ADMIN" &&
        verified &&
        complaint.status === "IN_PROGRESS" && (
          <CommandForm
            label={labels.settle}
            onCommit={async () => {
              await adminRequest(
                `${path}/resolve-non-delivery`,
                { method: "POST" },
                adminComplaintSchema,
              );
              reload();
            }}
          >
            <p>{labels.settleReason}</p>
          </CommandForm>
        )}
    </section>
  );
}

export function ComplaintsSection({ role }: { role: AdminRole }) {
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<string>();
  const query = status ? `?${new URLSearchParams({ status })}` : "";
  const resource = useAdminResource(
    `/admin/complaints${query}`,
    adminComplaintListSchema,
  );

  return (
    <>
      <label>
        {labels.filter}
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setSelected(undefined);
          }}
        >
          <option value="">{labels.all}</option>
          {complaintStatuses.map((option) => (
            <option key={option} value={option}>
              {labels.statuses[option]}
            </option>
          ))}
        </select>
      </label>
      <ResourceMessage resource={resource} />
      {resource.data?.complaints.length === 0 && <p>{adminShellText.empty}</p>}
      {resource.data?.complaints.map((entry) => (
        <button
          key={entry.id}
          aria-pressed={selected === entry.id}
          onClick={() => setSelected(entry.id)}
        >
          {labels.types[entry.type]} · {labels.statuses[entry.status]} ·{" "}
          <bdi dir="ltr">{entry.orderId}</bdi>
        </button>
      ))}
      {selected && (
        <ComplaintDetail
          key={selected}
          id={selected}
          role={role}
          onSaved={resource.refresh}
        />
      )}
    </>
  );
}
