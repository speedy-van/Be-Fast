"use client";

import {
  orderCancellationSchema,
  orderListResponseSchema,
  orderReadSchema,
  type OrderReadResponse,
} from "@be-fast/contracts";
import {
  CANCELLATION_REASON_CODES,
  ORDER_STATUSES,
  canTransition,
  formatMoney,
  type OrderStatus,
} from "@be-fast/domain";
import { adminOperations as text, formatAdminDateTime } from "@be-fast/i18n";
import { useState, type FormEvent } from "react";
import { adminRequest } from "../../lib/client";
import { useAdminResource } from "../../lib/use-admin-resource";
import {
  Confirmation,
  ResourceNotice,
  readField,
  whenEmpty,
  type AdminSectionProps,
} from "./shared";

function OrderItems({
  order,
  currencyDisplayMode,
}: {
  order: OrderReadResponse;
  currencyDisplayMode: AdminSectionProps["currencyDisplayMode"];
}) {
  return (
    <section className="stack">
      <h3>{text.orders.items}</h3>
      {whenEmpty(order.items)}
      <ul>
        {order.items.map((item) => (
          <li key={item.id}>
            <span>
              {item.name} {item.sizeName}
              {" × "}
              {item.quantity}
            </span>{" "}
            {item.totalMinor !== undefined && (
              <bdi>{formatMoney(item.totalMinor, currencyDisplayMode)}</bdi>
            )}
            {item.note && <p>{item.note}</p>}
            {item.options.length > 0 && (
              <ul>
                {item.options.map((option) => (
                  <li key={option.id}>
                    {option.name}{" "}
                    {option.priceMinor !== undefined && (
                      <bdi>
                        {formatMoney(option.priceMinor, currencyDisplayMode)}
                      </bdi>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function OrderEvents({ events }: { events: OrderReadResponse["events"] }) {
  return (
    <section className="stack">
      <h3>{text.orders.events}</h3>
      {whenEmpty(events)}
      <ol>
        {events.map((event) => (
          <li key={event.id}>
            {event.from && (
              <>
                {text.orders.status[event.from]}
                {" ← "}
              </>
            )}
            <strong>{text.orders.status[event.to]}</strong>
            {" · "}
            {text.orders.actor[event.actorType]}
            {" · "}
            <time dateTime={event.createdAt}>
              {formatAdminDateTime(event.createdAt)}
            </time>
            {event.reasonCode && <p>{text.orders.reason[event.reasonCode]}</p>}
            {event.note && <p>{event.note}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}

function OrderDetail({
  id,
  role,
  currencyDisplayMode,
  onChanged,
}: AdminSectionProps & { id: string; onChanged: () => void }) {
  const resource = useAdminResource(`/admin/orders/${id}`, orderReadSchema);
  const order = resource.data;
  const [cancelling, setCancelling] = useState(false);
  const [saved, setSaved] = useState(false);
  const address = [
    "governorateName",
    "cityName",
    "neighborhoodName",
    "street",
    "landmark",
    "building",
    "floor",
    "notes",
  ]
    .map((key) => order?.addressSnapshot?.[key])
    .filter(
      (value): value is string => typeof value === "string" && value !== "",
    );

  return (
    <section className="panel" aria-label={text.orders.detail}>
      <ResourceNotice {...resource} />
      {order && (
        <>
          <h2>
            <bdi>{order.orderNumber}</bdi>
          </h2>
          <dl>
            <div>
              <dt>{text.common.status}</dt>
              <dd>{text.orders.status[order.status]}</dd>
            </div>
            <div>
              <dt>{text.orders.type}</dt>
              <dd>{text.orders.orderType[order.type]}</dd>
            </div>
            <div>
              <dt>{text.common.date}</dt>
              <dd>
                <time dateTime={order.createdAt}>
                  {formatAdminDateTime(order.createdAt)}
                </time>
              </dd>
            </div>
            {order.customerName && (
              <div>
                <dt>{text.orders.customer}</dt>
                <dd>{order.customerName}</dd>
              </div>
            )}
            {order.customerPhone && (
              <div>
                <dt>{text.orders.phone}</dt>
                <dd>
                  <bdi>{order.customerPhone}</bdi>
                </dd>
              </div>
            )}
            {address.length > 0 && (
              <div>
                <dt>{text.restaurants.address}</dt>
                <dd>{address.join("، ")}</dd>
              </div>
            )}
            {order.note && (
              <div>
                <dt>{text.common.notes}</dt>
                <dd>{order.note}</dd>
              </div>
            )}
            {order.foodSubtotalMinor !== undefined && (
              <div>
                <dt>{text.orders.foodSubtotal}</dt>
                <dd>
                  <bdi>
                    {formatMoney(order.foodSubtotalMinor, currencyDisplayMode)}
                  </bdi>
                </dd>
              </div>
            )}
            {order.deliveryFeeMinor !== undefined && (
              <div>
                <dt>{text.orders.deliveryFee}</dt>
                <dd>
                  <bdi>
                    {formatMoney(order.deliveryFeeMinor, currencyDisplayMode)}
                  </bdi>
                </dd>
              </div>
            )}
            {order.totalMinor !== undefined && (
              <div>
                <dt>{text.orders.total}</dt>
                <dd>
                  <bdi>
                    {formatMoney(order.totalMinor, currencyDisplayMode)}
                  </bdi>
                </dd>
              </div>
            )}
            {order.commissionMinor !== undefined && (
              <div>
                <dt>{text.orders.commission}</dt>
                <dd>
                  <bdi>
                    {formatMoney(order.commissionMinor, currencyDisplayMode)}
                  </bdi>
                </dd>
              </div>
            )}
          </dl>
          <OrderItems order={order} currencyDisplayMode={currencyDisplayMode} />
          <OrderEvents events={order.events} />
          {canTransition(
            order.status,
            "CANCELLED",
            { type: "ADMIN", role },
            order.type,
          ) && (
            <button
              type="button"
              onClick={() => {
                setCancelling(true);
                setSaved(false);
              }}
            >
              {text.orders.cancel}
            </button>
          )}
          {saved && <p role="status">{text.common.saved}</p>}
          {cancelling && (
            <Confirmation
              title={text.orders.cancel}
              onClose={() => setCancelling(false)}
              onSaved={() => {
                setCancelling(false);
                setSaved(true);
                void resource.refresh();
                onChanged();
              }}
              onConfirm={async (data) => {
                const body = orderCancellationSchema.parse({
                  reasonCode: readField(data, "reason"),
                  note: readField(data, "note") || undefined,
                });
                await adminRequest(
                  `/admin/orders/${id}/cancel`,
                  { method: "POST", body },
                  orderReadSchema,
                );
              }}
            >
              <label>
                {text.common.reason}
                <select name="reason" defaultValue="" required>
                  <option value="" disabled>
                    {text.orders.chooseReason}
                  </option>
                  {CANCELLATION_REASON_CODES.map((reason) => (
                    <option key={reason} value={reason}>
                      {text.orders.reason[reason]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {text.common.notes}
                <textarea name="note" />
              </label>
            </Confirmation>
          )}
        </>
      )}
    </section>
  );
}

export function OrdersSection(props: AdminSectionProps) {
  const [filters, setFilters] = useState({
    q: "",
    status: "" as OrderStatus | "",
  });
  const [selected, setSelected] = useState<string | null>(null);
  const query = new URLSearchParams();
  if (filters.q !== "") query.set("q", filters.q);
  if (filters.status !== "") query.set("status", filters.status);
  const resource = useAdminResource(
    query.size === 0 ? "/admin/orders" : `/admin/orders?${query}`,
    orderListResponseSchema,
  );

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const status =
      ORDER_STATUSES.find((option) => option === form.get("status")) ?? "";
    setFilters({ q: readField(form, "q"), status });
    setSelected(null);
  }

  return (
    <>
      <section className="panel" aria-label={text.orders.list}>
        <form className="filters" onSubmit={search}>
          <label>
            {text.orders.search}
            <input name="q" type="search" />
          </label>
          <label>
            {text.common.status}
            <select name="status" defaultValue="">
              <option value="">{text.common.all}</option>
              {ORDER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {text.orders.status[status]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">{text.common.search}</button>
        </form>
        <ResourceNotice {...resource} />
        {whenEmpty(resource.data?.orders)}
        {resource.data && resource.data.orders.length > 0 && (
          <ul className="data-list">
            {resource.data.orders.map((order) => (
              <li key={order.id}>
                <button
                  type="button"
                  aria-pressed={selected === order.id}
                  onClick={() => setSelected(order.id)}
                >
                  <bdi>{order.orderNumber}</bdi>
                </button>{" "}
                <span>{text.orders.status[order.status]}</span>{" "}
                {order.restaurantName && <span>{order.restaurantName}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
      {selected && (
        <OrderDetail
          key={selected}
          id={selected}
          {...props}
          onChanged={() => {
            void resource.refresh();
          }}
        />
      )}
    </>
  );
}
