"use client";

import {
  adminRestaurantCommissionRecordSchema,
  adminRestaurantProfileSchema,
  adminRestaurantProfileSummarySchema,
  documentLinkSchema,
  restaurantCommissionSchema,
  restaurantDocumentSchema,
  restaurantReviewSchema,
  restaurantStatuses,
} from "@be-fast/contracts";
import {
  adminOperations as text,
  formatAdminDateTime,
  formatAdminRate,
} from "@be-fast/i18n";
import { useState } from "react";
import { adminRequest } from "../../lib/client";
import { useAdminResource } from "../../lib/use-admin-resource";
import {
  Confirmation,
  ResourceNotice,
  readField,
  requiredReasonField,
  whenEmpty,
  type AdminSectionProps,
} from "./shared";

type RestaurantStatus = (typeof restaurantStatuses)[number];
type ReviewAction = "approve" | "reject" | "suspend" | "resume";
const reviewActions: Partial<
  Record<RestaurantStatus, readonly ReviewAction[]>
> = {
  PENDING_REVIEW: ["approve", "reject"],
  APPROVED: ["suspend"],
  SUSPENDED: ["resume"],
};
const restaurantListSchema = adminRestaurantProfileSummarySchema.array();
const commissionListSchema = adminRestaurantCommissionRecordSchema.array();
const documentListSchema = restaurantDocumentSchema.array();

function CommissionForm({
  id,
  rate,
  onSaved,
}: {
  id: string;
  rate: number;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <section className="stack">
      <p>
        {text.restaurants.commissionBps} <bdi>{rate}</bdi>{" "}
        <bdi>{formatAdminRate(rate)}</bdi>
      </p>
      <button
        type="button"
        onClick={() => {
          setEditing(true);
          setSaved(false);
        }}
      >
        {text.restaurants.editCommission}
      </button>
      {saved && <p role="status">{text.common.saved}</p>}
      {editing && (
        <Confirmation
          title={text.restaurants.editCommission}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setSaved(true);
            onSaved();
          }}
          onConfirm={async (data) => {
            const body = restaurantCommissionSchema.parse({
              commissionRateBps: Number(readField(data, "commission")),
            });
            await adminRequest(
              `/admin/restaurants/${id}/commission`,
              { method: "PATCH", body },
              restaurantCommissionSchema,
            );
          }}
        >
          <label>
            {text.restaurants.commissionBps}
            <input
              name="commission"
              type="number"
              min="0"
              max="10000"
              step="1"
              defaultValue={rate}
              required
            />
          </label>
        </Confirmation>
      )}
    </section>
  );
}

function DocumentRow({
  restaurantId,
  document,
}: {
  restaurantId: string;
  document: ReturnType<typeof restaurantDocumentSchema.parse>;
}) {
  const [link, setLink] = useState<ReturnType<
    typeof documentLinkSchema.parse
  > | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function getLink() {
    setLoading(true);
    setFailed(false);
    try {
      const response = await adminRequest(
        `/admin/restaurants/${restaurantId}/documents/${document.id}/link`,
        {},
        documentLinkSchema,
      );
      setLink(response);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <li>
      <span>{text.restaurants.documentType[document.type]}</span>{" "}
      <time dateTime={document.createdAt}>
        {formatAdminDateTime(document.createdAt)}
      </time>{" "}
      <button type="button" disabled={loading} onClick={getLink}>
        {text.restaurants.fetchDocument}
      </button>{" "}
      {link && (
        <a
          href={`/api/backend${link.url}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {text.restaurants.openDocument}
        </a>
      )}
      {failed && <p role="alert">{text.common.saveError}</p>}
    </li>
  );
}

function Documents({ restaurantId }: { restaurantId: string }) {
  const resource = useAdminResource(
    `/admin/restaurants/${restaurantId}/documents`,
    documentListSchema,
  );
  return (
    <section className="stack">
      <h3>{text.restaurants.documents}</h3>
      <ResourceNotice {...resource} />
      {whenEmpty(resource.data)}
      {resource.data && resource.data.length > 0 && (
        <ul className="data-list">
          {resource.data.map((document) => (
            <DocumentRow
              key={document.id}
              restaurantId={restaurantId}
              document={document}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function RestaurantDetail({
  id,
  role,
  onChanged,
}: {
  id: string;
  role: AdminSectionProps["role"];
  onChanged: () => void;
}) {
  const resource = useAdminResource(
    `/admin/restaurants/${id}`,
    adminRestaurantProfileSchema,
  );
  const restaurant = resource.data;
  const [action, setAction] = useState<ReviewAction | null>(null);
  const [saved, setSaved] = useState(false);
  const refresh = () => {
    void resource.refresh();
    onChanged();
  };

  return (
    <section className="panel" aria-label={text.restaurants.detail}>
      <ResourceNotice {...resource} />
      {restaurant && (
        <>
          <h2>{restaurant.name ?? text.restaurants.unnamed}</h2>
          <dl>
            <div>
              <dt>{text.common.status}</dt>
              <dd>{text.restaurants.status[restaurant.status]}</dd>
            </div>
            {restaurant.contactPhone && (
              <div>
                <dt>{text.restaurants.contact}</dt>
                <dd>
                  <bdi>{restaurant.contactPhone}</bdi>
                </dd>
              </div>
            )}
            {restaurant.branch?.address && (
              <div>
                <dt>{text.restaurants.address}</dt>
                <dd>{restaurant.branch.address}</dd>
              </div>
            )}
            {restaurant.reviewReason && (
              <div>
                <dt>{text.common.reason}</dt>
                <dd>{restaurant.reviewReason}</dd>
              </div>
            )}
          </dl>
          {reviewActions[restaurant.status] && (
            <div
              className="actions"
              aria-label={text.restaurants.reviewActions}
            >
              {reviewActions[restaurant.status]?.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setAction(option);
                    setSaved(false);
                  }}
                >
                  {text.restaurants[option]}
                </button>
              ))}
            </div>
          )}
          {saved && <p role="status">{text.common.saved}</p>}
          {action && (
            <Confirmation
              key={action}
              title={text.restaurants[action]}
              onClose={() => setAction(null)}
              onSaved={() => {
                setAction(null);
                setSaved(true);
                refresh();
              }}
              onConfirm={async (data) => {
                const body = restaurantReviewSchema.parse({
                  reason: readField(data, "reason"),
                });
                await adminRequest(`/admin/restaurants/${id}/${action}`, {
                  method: "POST",
                  body,
                });
              }}
            >
              {requiredReasonField()}
            </Confirmation>
          )}
          {role === "SUPER_ADMIN" && (
            <CommissionForm
              id={id}
              rate={restaurant.commissionRateBps}
              onSaved={refresh}
            />
          )}
          <Documents restaurantId={id} />
        </>
      )}
    </section>
  );
}

function RestaurantReviews({ role }: AdminSectionProps) {
  const [status, setStatus] = useState<RestaurantStatus | "">("");
  const [selected, setSelected] = useState<string | null>(null);
  const resource = useAdminResource(
    status === ""
      ? "/admin/restaurants"
      : `/admin/restaurants?status=${status}`,
    restaurantListSchema,
  );

  return (
    <>
      <section className="panel" aria-label={text.restaurants.list}>
        <label>
          {text.common.status}
          <select
            value={status}
            onChange={(event) => {
              const value = restaurantStatuses.find(
                (option) => option === event.target.value,
              );
              setStatus(value ?? "");
              setSelected(null);
            }}
          >
            <option value="">{text.common.all}</option>
            {restaurantStatuses.map((option) => (
              <option key={option} value={option}>
                {text.restaurants.status[option]}
              </option>
            ))}
          </select>
        </label>
        <ResourceNotice {...resource} />
        {whenEmpty(resource.data)}
        {resource.data && resource.data.length > 0 && (
          <ul className="data-list">
            {resource.data.map((restaurant) => (
              <li key={restaurant.id}>
                <button
                  type="button"
                  aria-pressed={selected === restaurant.id}
                  onClick={() => setSelected(restaurant.id)}
                >
                  {restaurant.name ?? text.restaurants.unnamed}
                </button>{" "}
                <span>{text.restaurants.status[restaurant.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {selected && (
        <RestaurantDetail
          key={selected}
          id={selected}
          role={role}
          onChanged={() => {
            void resource.refresh();
          }}
        />
      )}
    </>
  );
}

function RestaurantCommissions() {
  const resource = useAdminResource(
    "/admin/restaurants/commissions",
    commissionListSchema,
  );
  const [selected, setSelected] = useState<string | null>(null);
  const restaurant = resource.data?.find(({ id }) => id === selected);
  return (
    <>
      <section className="panel" aria-label={text.restaurants.list}>
        <ResourceNotice {...resource} />
        {whenEmpty(resource.data)}
        {resource.data && resource.data.length > 0 && (
          <ul className="data-list">
            {resource.data.map(({ id, name }) => (
              <li key={id}>
                <button
                  type="button"
                  aria-pressed={selected === id}
                  onClick={() => setSelected(id)}
                >
                  {name ?? text.restaurants.unnamed}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {restaurant && (
        <CommissionForm
          key={restaurant.id}
          id={restaurant.id}
          rate={restaurant.commissionRateBps}
          onSaved={() => {
            void resource.refresh();
          }}
        />
      )}
    </>
  );
}

export function RestaurantsSection(props: AdminSectionProps) {
  return props.role === "FINANCE" ? (
    <RestaurantCommissions />
  ) : (
    <RestaurantReviews {...props} />
  );
}
