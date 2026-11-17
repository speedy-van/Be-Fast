"use client";

import {
  financeLedgerResponseSchema,
  ledgerEntrySchema,
  recordAdjustmentSchema,
  recordPaymentSchema,
  restaurantBalancesResponseSchema,
} from "@be-fast/contracts";
import { formatMoney } from "@be-fast/domain";
import {
  adminOperations as text,
  formatAdminCalendarDate,
  formatAdminDateTime,
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
} from "./shared";

type Balances = ReturnType<typeof restaurantBalancesResponseSchema.parse>;
type FinanceAction = "payment" | "adjustment";

function RestaurantLedger({
  restaurant,
  currencyDisplayMode,
  onChanged,
}: {
  restaurant: Balances["restaurants"][number];
  currencyDisplayMode: Balances["currencyDisplayMode"];
  onChanged: () => void;
}) {
  const basePath = `/admin/finance/restaurants/${restaurant.restaurantId}`;
  const resource = useAdminResource(
    `${basePath}/ledger`,
    financeLedgerResponseSchema,
  );
  const [action, setAction] = useState<FinanceAction | null>(null);
  const [saved, setSaved] = useState(false);
  const entries = resource.data?.entries;

  function open(option: FinanceAction) {
    setAction(option);
    setSaved(false);
  }

  async function record(data: FormData) {
    const amountMinor = Number(readField(data, "amount"));
    if (action === "payment") {
      const body = recordPaymentSchema.parse({
        amountMinor,
        paymentDate: readField(data, "payment-date"),
        paymentMethod: readField(data, "payment-method"),
        reference: readField(data, "reference"),
      });
      await adminRequest(
        `${basePath}/payments`,
        { method: "POST", body },
        ledgerEntrySchema,
      );
    } else {
      const body = recordAdjustmentSchema.parse({
        amountMinor,
        reason: readField(data, "reason"),
      });
      await adminRequest(
        `${basePath}/adjustments`,
        { method: "POST", body },
        ledgerEntrySchema,
      );
    }
  }

  return (
    <section className="panel" aria-label={text.finance.ledger}>
      <h2>{restaurant.name ?? text.restaurants.unnamed}</h2>
      <dl>
        <div>
          <dt>{text.finance.balance}</dt>
          <dd>
            <bdi>
              {formatMoney(restaurant.balanceMinor, currencyDisplayMode)}
            </bdi>
          </dd>
        </div>
      </dl>
      <div className="actions">
        <button type="button" onClick={() => open("payment")}>
          {text.finance.payment}
        </button>
        <button type="button" onClick={() => open("adjustment")}>
          {text.finance.adjustment}
        </button>
      </div>
      {saved && <p role="status">{text.common.saved}</p>}
      {action && (
        <Confirmation
          key={action}
          title={text.finance[action]}
          onClose={() => setAction(null)}
          onSaved={() => {
            setAction(null);
            setSaved(true);
            void resource.refresh();
            onChanged();
          }}
          onConfirm={record}
        >
          <label>
            {text.finance.amountMinor}
            <input
              name="amount"
              type="number"
              step="1"
              min={action === "payment" ? 1 : undefined}
              required
            />
          </label>
          {action === "payment" ? (
            <>
              <label>
                {text.finance.paymentDate}
                <input name="payment-date" type="date" required />
              </label>
              <label>
                {text.finance.paymentMethod}
                <input name="payment-method" required />
              </label>
              <label>
                {text.finance.reference}
                <input name="reference" required />
              </label>
            </>
          ) : (
            requiredReasonField()
          )}
        </Confirmation>
      )}
      <h3>{text.finance.ledger}</h3>
      <ResourceNotice {...resource} />
      {whenEmpty(entries)}
      {entries && entries.length > 0 && (
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label={text.finance.ledger}
        >
          <table>
            <thead>
              <tr>
                <th scope="col">{text.finance.type}</th>
                <th scope="col">{text.finance.amount}</th>
                <th scope="col">{text.common.date}</th>
                <th scope="col">{text.common.notes}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <th scope="row">{text.finance.entryType[entry.type]}</th>
                  <td>
                    <bdi>
                      {formatMoney(entry.amountMinor, currencyDisplayMode)}
                    </bdi>
                  </td>
                  <td>
                    <time dateTime={entry.paymentDate ?? entry.createdAt}>
                      {entry.paymentDate
                        ? formatAdminCalendarDate(entry.paymentDate)
                        : formatAdminDateTime(entry.createdAt)}
                    </time>
                  </td>
                  <td>
                    {[entry.paymentMethod, entry.reference, entry.reason]
                      .filter(Boolean)
                      .join("، ") || text.common.notAvailable}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function FinanceSection() {
  const resource = useAdminResource(
    "/admin/finance/restaurants",
    restaurantBalancesResponseSchema,
  );
  const [selected, setSelected] = useState<string | null>(null);
  const balances = resource.data;
  const balance = balances?.restaurants.find(
    ({ restaurantId }) => restaurantId === selected,
  );
  return (
    <>
      <section className="panel" aria-label={text.finance.balances}>
        <h2>{text.finance.balances}</h2>
        <ResourceNotice {...resource} />
        {whenEmpty(balances?.restaurants)}
        {balances && balances.restaurants.length > 0 && (
          <ul className="data-list">
            {balances.restaurants.map(
              ({ restaurantId, name, balanceMinor }) => (
                <li key={restaurantId}>
                  <button
                    type="button"
                    aria-pressed={selected === restaurantId}
                    onClick={() => setSelected(restaurantId)}
                  >
                    {name ?? text.restaurants.unnamed}
                  </button>{" "}
                  <bdi>
                    {formatMoney(balanceMinor, balances.currencyDisplayMode)}
                  </bdi>
                </li>
              ),
            )}
          </ul>
        )}
      </section>
      {balances && balance && (
        <RestaurantLedger
          key={balance.restaurantId}
          restaurant={balance}
          currencyDisplayMode={balances.currencyDisplayMode}
          onChanged={() => {
            void resource.refresh();
          }}
        />
      )}
    </>
  );
}
