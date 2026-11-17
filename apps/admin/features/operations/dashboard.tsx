"use client";

import {
  adminDashboardSchema,
  adminOrderMetricsSchema,
  adminRestaurantProfileSummarySchema,
  orderListResponseSchema,
} from "@be-fast/contracts";
import {
  adminOperations as text,
  formatAdminDateTime,
  formatAdminRate,
} from "@be-fast/i18n";
import Link from "next/link";
import { useAdminResource } from "../../lib/use-admin-resource";
import { ResourceNotice, whenEmpty, type AdminSectionProps } from "./shared";

const dashboardRefreshMs = 15_000;
const previewLimit = 8;
const pendingRestaurantListSchema = adminRestaurantProfileSummarySchema.array();

function OrderPreview({
  title,
  count,
  url,
}: {
  title: string;
  count: number;
  url: string;
}) {
  const resource = useAdminResource(
    url,
    orderListResponseSchema,
    dashboardRefreshMs,
  );
  const orders = resource.data?.orders;
  return (
    <section className="panel">
      <h2>
        {title} <bdi>{count}</bdi>
      </h2>
      <ResourceNotice {...resource} />
      {whenEmpty(orders)}
      {orders && orders.length > 0 && (
        <ul className="data-list">
          {orders.slice(0, previewLimit).map((order) => (
            <li key={order.id}>
              <bdi>{order.orderNumber}</bdi> {text.orders.status[order.status]}{" "}
              {order.restaurantName}
            </li>
          ))}
        </ul>
      )}
      <Link href="/orders">{text.dashboard.openOrders}</Link>
    </section>
  );
}

function PendingRestaurants({ count }: { count: number }) {
  const resource = useAdminResource(
    "/admin/restaurants?status=PENDING_REVIEW",
    pendingRestaurantListSchema,
    dashboardRefreshMs,
  );
  return (
    <section className="panel">
      <h2>
        {text.dashboard.pendingRestaurants} <bdi>{count}</bdi>
      </h2>
      <ResourceNotice {...resource} />
      {whenEmpty(resource.data)}
      {resource.data && resource.data.length > 0 && (
        <ul className="data-list">
          {resource.data.slice(0, previewLimit).map(({ id, name }) => (
            <li key={id}>{name ?? text.restaurants.unnamed}</li>
          ))}
        </ul>
      )}
      <Link href="/restaurants">{text.dashboard.openRestaurants}</Link>
    </section>
  );
}

function Metrics() {
  const resource = useAdminResource(
    "/admin/orders/metrics",
    adminOrderMetricsSchema,
    dashboardRefreshMs,
  );
  const metrics = resource.data;
  return (
    <>
      <ResourceNotice {...resource} />
      {metrics && (
        <>
          <dl className="card-grid">
            <div className="panel">
              <dt>{text.dashboard.completion}</dt>
              <dd>{formatAdminRate(metrics.completionRateBps)}</dd>
            </div>
            <div className="panel">
              <dt>{text.dashboard.acceptance}</dt>
              <dd>{formatAdminRate(metrics.acceptanceRateBps)}</dd>
            </div>
            <div className="panel">
              <dt>{text.dashboard.response}</dt>
              <dd>
                {metrics.averageResponseMs === null
                  ? text.common.notAvailable
                  : metrics.averageResponseMs / 1000}
              </dd>
            </div>
          </dl>
          {metrics.cancellationByReason.length > 0 && (
            <section className="panel">
              <h2>{text.dashboard.cancellations}</h2>
              <ul>
                {metrics.cancellationByReason.map(({ reasonCode, rateBps }) => (
                  <li key={reasonCode ?? "unspecified"}>
                    {reasonCode === null
                      ? text.dashboard.uncategorized
                      : text.orders.reason[reasonCode]}{" "}
                    {formatAdminRate(rateBps)}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}

export function DashboardSection({ role }: AdminSectionProps) {
  const resource = useAdminResource(
    "/admin/dashboard",
    adminDashboardSchema,
    dashboardRefreshMs,
  );
  const dashboard = resource.data;
  return (
    <>
      <ResourceNotice {...resource} />
      {dashboard && (
        <div className="card-grid">
          {dashboard.activeOrderCount !== null && (
            <OrderPreview
              title={text.dashboard.activeOrders}
              count={dashboard.activeOrderCount}
              url="/admin/orders?active=true"
            />
          )}
          {dashboard.needsAttentionCount !== null && (
            <OrderPreview
              title={text.dashboard.attention}
              count={dashboard.needsAttentionCount}
              url="/admin/orders/needs-attention"
            />
          )}
          {dashboard.pendingRestaurantCount !== null && (
            <PendingRestaurants count={dashboard.pendingRestaurantCount} />
          )}
          {dashboard.offlineBranches && (
            <section className="panel">
              <h2>{text.dashboard.offline}</h2>
              {dashboard.offlineBranches.length ? (
                <ul>
                  {dashboard.offlineBranches.map((branch) => (
                    <li key={branch.id}>
                      {branch.restaurantName ?? text.restaurants.unnamed}{" "}
                      {branch.lastSeenAt
                        ? `${text.dashboard.lastSeen} ${formatAdminDateTime(branch.lastSeenAt)}`
                        : text.dashboard.neverConnected}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{text.dashboard.noOffline}</p>
              )}
            </section>
          )}
          {role === "FINANCE" && (
            <Link href="/finance">{text.finance.balances}</Link>
          )}
        </div>
      )}
      {role !== "FINANCE" && <Metrics />}
    </>
  );
}
