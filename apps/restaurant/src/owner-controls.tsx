import {
  financeLedgerResponseSchema, restaurantReportQuerySchema, restaurantReportSummarySchema,
  restaurantStaffCreateSchema, restaurantStaffListSchema, restaurantStaffMemberSchema,
  restaurantStaffRoleSchema,
} from "@be-fast/contracts";
import { formatMoney } from "@be-fast/domain";
import { formatDamascusDateTime, messages, restaurantApp as text } from "@be-fast/i18n";
import { useState } from "react";
import { View } from "react-native";
import { z } from "zod";
import { serviceError } from "./api";
import { useRestaurantSession } from "./session";
import { AppText, Button, Choices, Field, ScrollScreen, Status, styles } from "./ui";
import { useRestaurantResource } from "./use-resource";

const staffPath = "/restaurant/staff";
const staffRoles = restaurantStaffRoleSchema.options.map((id) => ({ id, label: text.staffRoles[id] }));
type Role = z.infer<typeof restaurantStaffRoleSchema>;
type StaffMember = z.infer<typeof restaurantStaffMemberSchema>;

function StaffRow({ person, onSaved }: { person: StaffMember; onSaved: () => void }) {
  const { request } = useRestaurantSession();
  const [role, setRole] = useState(person.role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function update(method: "PATCH" | "DELETE") {
    setBusy(true); setError(undefined);
    try {
      await request(`${staffPath}/${person.id}`, { method, body: method === "PATCH" ? { role } : undefined });
      onSaved();
    } catch (cause) { setError(serviceError(cause)); }
    finally { setBusy(false); }
  }
  return (
    <View style={styles.card}>
      <AppText>{person.phone} · {text.staffRoles[person.role]} · {person.isActive ? text.active : text.inactive}</AppText>
      {person.isActive && (
        <>
          <Choices label={text.role} values={staffRoles} selected={role} onSelect={setRole} />
          <View style={styles.row}>
            <Button label={text.save} onPress={() => void update("PATCH")} disabled={busy || role === person.role} />
            <Button label={text.disable} onPress={() => void update("DELETE")} disabled={busy} />
          </View>
        </>
      )}
      <Status busy={busy} error={error} />
    </View>
  );
}

export function StaffControls() {
  const { request } = useRestaurantSession();
  const staff = useRestaurantResource(staffPath, restaurantStaffListSchema);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("CASHIER");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function add() {
    const payload = restaurantStaffCreateSchema.safeParse({ phone, role, temporaryPassword: password });
    if (!payload.success) { setError(messages.errors.validationError); return; }
    setError(undefined); setBusy(true);
    try {
      await request(staffPath, { method: "POST", body: payload.data }, restaurantStaffMemberSchema);
      setPhone(""); setPassword(""); staff.reload();
    } catch (cause) { setError(serviceError(cause)); }
    finally { setBusy(false); }
  }

  return (
    <View style={styles.field}>
      <AppText title>{text.staff}</AppText>
      <Status busy={staff.loading} error={staff.error} retry={staff.reload} />
      {staff.data?.map((person) => <StaffRow key={`${person.id}-${person.role}`} person={person} onSaved={staff.reload} />)}
      <View style={styles.card}>
        <Field label={text.phone} value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={styles.numeric} />
        <Field label={text.tempPassword} value={password} onChangeText={setPassword} secureTextEntry />
        <Choices label={text.role} values={staffRoles} selected={role} onSelect={setRole} />
        <Button label={text.add} primary disabled={busy} onPress={() => void add()} />
        <Status busy={busy} error={error} />
      </View>
    </View>
  );
}

const metrics = ["orderValueMinor", "completedSalesMinor", "cashCollectedMinor", "commissionMinor"] as const;
const periods = (["day", "week", "month"] as const).map((id) => ({ id, label: text.periods[id] }));
const localDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Damascus", calendar: "gregory", numberingSystem: "latn", year: "numeric", month: "2-digit", day: "2-digit" });
type Filters = z.infer<typeof restaurantReportQuerySchema>;

function Summary({ filters }: { filters: Filters }) {
  const report = useRestaurantResource(`/restaurant/reports/summary?${new URLSearchParams(filters)}`, restaurantReportSummarySchema);
  const data = report.data;
  return (
    <View style={styles.card}>
      <Status busy={report.loading} error={report.error} retry={report.reload} />
      {data && metrics.map((key) => <AppText key={key}>{text[key]} · {formatMoney(data[key], data.currencyDisplayMode)}</AppText>)}
    </View>
  );
}

export function ReportsScreen() {
  const { serverOffsetMs } = useRestaurantSession();
  const [initialDate] = useState(() => localDate.format(new Date(Date.now() + serverOffsetMs)));
  const [date, setDate] = useState(initialDate);
  const [period, setPeriod] = useState<Filters["period"]>("day");
  const [filters, setFilters] = useState<Filters>({ date: initialDate, period: "day" });
  const [error, setError] = useState<string>();
  const ledger = useRestaurantResource("/restaurant/finance/ledger", financeLedgerResponseSchema);

  return (
    <ScrollScreen>
      <AppText title>{text.reports}</AppText>
      <View style={styles.card}>
        <Choices label={text.period} values={periods} selected={period} onSelect={setPeriod} />
        <Field label={text.date} value={date} onChangeText={setDate} maxLength={10} style={styles.numeric} />
        <Status error={error} />
        <Button label={text.viewReport} primary onPress={() => {
          const parsed = restaurantReportQuerySchema.safeParse({ date, period });
          if (!parsed.success) return setError(messages.errors.validationError);
          setError(undefined); setFilters(parsed.data);
        }} />
      </View>
      <Summary key={`${filters.date}-${filters.period}`} filters={filters} />
      <View style={styles.card}>
        <AppText title>{text.ledger}</AppText>
        <Status busy={ledger.loading} error={ledger.error} retry={ledger.reload} />
        {ledger.data?.entries.length === 0 && <AppText>{text.empty}</AppText>}
        {ledger.data?.entries.map((entry) => (
          <View key={entry.id} style={styles.field}>
            <AppText>{text.ledgerTypes[entry.type]} · {formatMoney(entry.amountMinor, ledger.data?.currencyDisplayMode ?? "OLD")}</AppText>
            <AppText muted>{formatDamascusDateTime(entry.createdAt)}{entry.reason ? ` · ${entry.reason}` : ""}</AppText>
          </View>
        ))}
      </View>
    </ScrollScreen>
  );
}
