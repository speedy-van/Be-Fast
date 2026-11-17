import { adminRestaurantProfileSchema, deliveryZonesSchema, openingPeriodsSchema, restaurantBranchSettingsSchema } from "@be-fast/contracts";
import { formatMoney } from "@be-fast/domain";
import { messages, restaurantApp as text } from "@be-fast/i18n";
import { useState } from "react";
import { Switch, View } from "react-native";
import { z } from "zod";
import { serviceError } from "./api";
import { RegionSelector, useRestaurantGeo } from "./region";
import { useRestaurantSession } from "./session";
import { AppText, Button, Choices, Field, Status, styles } from "./ui";
import { useRestaurantResource } from "./use-resource";

const hoursPath = "/restaurant/branch/opening-periods";
const zonesPath = "/restaurant/branch/delivery-zones";
const settingsPath = "/restaurant/branch/settings";
const zonesResponse = z.object({ zones: adminRestaurantProfileSchema.shape.branch.unwrap().shape.deliveryZones });
const weekdayChoices = text.weekdays.map((label, index) => ({ id: String(index), label }));
type Periods = z.infer<typeof openingPeriodsSchema>["periods"];
type Zones = z.infer<typeof deliveryZonesSchema>["zones"];
type Setting = z.infer<typeof restaurantBranchSettingsSchema>;

function integerField(input: string) { return /^-?\d+$/u.test(input.trim()) ? Number(input) : NaN; }

function useUpdate() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  async function update(action: () => Promise<void>) {
    setBusy(true); setError(undefined); setSaved(false);
    try { await action(); setSaved(true); }
    catch (cause) { setError(serviceError(cause)); }
    finally { setBusy(false); }
  }
  const feedback = <Status busy={busy} error={error} message={saved ? text.saved : undefined} />;
  return { busy, setError, update, feedback };
}

function HoursEditor({ initial, onSaved }: { initial: Periods; onSaved: (periods: Periods) => void }) {
  const { request } = useRestaurantSession();
  const [periods, setPeriods] = useState(initial);
  const [day, setDay] = useState("0");
  const [opensAt, setOpen] = useState("");
  const [closesAt, setClose] = useState("");
  const operation = useUpdate();
  function add() {
    const next = openingPeriodsSchema.safeParse({ periods: [...periods, { dayOfWeek: Number(day), opensAt, closesAt }] });
    if (!next.success) return operation.setError(messages.errors.validationError);
    operation.setError(undefined);
    setPeriods(next.data.periods); setOpen(""); setClose("");
  }
  return (
    <View style={styles.card}>
      <AppText title>{text.hours}</AppText>
      {periods.map(({ dayOfWeek, opensAt, closesAt }, index) => (
        <View key={`${dayOfWeek}-${opensAt}-${closesAt}-${index}`} style={styles.row}>
          <AppText>{text.weekdays[dayOfWeek]} · {opensAt} – {closesAt}</AppText>
          <Button label={text.remove} onPress={() => setPeriods(periods.filter((_, position) => position !== index))} disabled={operation.busy} />
        </View>
      ))}
      <Choices label={text.hours} values={weekdayChoices} selected={day} onSelect={setDay} />
      <AppText muted>{text.localTime}</AppText>
      <Field label={text.opensAt} value={opensAt} onChangeText={setOpen} maxLength={5} style={styles.numeric} />
      <Field label={text.closesAt} value={closesAt} onChangeText={setClose} maxLength={5} style={styles.numeric} />
      <View style={styles.row}>
        <Button label={text.add} onPress={add} disabled={operation.busy} />
        <Button label={text.save} primary onPress={() => void operation.update(async () => {
          const response = await request(hoursPath, { method: "PUT", body: { periods } }, openingPeriodsSchema);
          setPeriods(response.periods); onSaved(response.periods);
        })} disabled={operation.busy} />
      </View>
      {operation.feedback}
    </View>
  );
}

function ZonesEditor({ initial, geo, onSaved }: { initial: Zones; geo: ReturnType<typeof useRestaurantGeo>; onSaved: (zones: z.infer<typeof zonesResponse>["zones"]) => void }) {
  const { request, currencyDisplayMode } = useRestaurantSession();
  const [zones, setZones] = useState(initial);
  const [neighborhoodId, select] = useState("");
  const [fee, setFee] = useState("");
  const [eta, setEta] = useState("");
  const operation = useUpdate();
  const allNeighborhoods = geo.data?.flatMap(({ cities }) => cities.flatMap(({ neighborhoods }) => neighborhoods)) ?? [];
  const zoneDraft = { neighborhoodId, feeMinor: integerField(fee), etaMinutes: integerField(eta) };
  function add() {
    const result = deliveryZonesSchema.safeParse({ zones: [...zones.filter((zone) => zone.neighborhoodId !== neighborhoodId), zoneDraft] });
    if (!result.success) return operation.setError(messages.errors.validationError);
    operation.setError(undefined); setZones(result.data.zones); setFee(""); setEta("");
  }
  return (
    <View style={styles.card}>
      <AppText title>{text.zones}</AppText>
      {zones.map((zone) => (
        <View key={zone.neighborhoodId} style={styles.row}>
          <AppText>{allNeighborhoods.find(({ id }) => id === zone.neighborhoodId)?.name ?? text.neighborhood} · {formatMoney(zone.feeMinor, currencyDisplayMode)} · {zone.etaMinutes}</AppText>
          <Button label={text.edit} onPress={() => { select(zone.neighborhoodId); setFee(String(zone.feeMinor)); setEta(String(zone.etaMinutes)); }} disabled={operation.busy} />
          <Button label={text.remove} onPress={() => setZones(zones.filter(({ neighborhoodId: id }) => id !== zone.neighborhoodId))} disabled={operation.busy} />
        </View>
      ))}
      <RegionSelector geo={geo} neighborhoodId={neighborhoodId} onSelect={select} />
      <Field label={text.fee} value={fee} onChangeText={setFee} keyboardType="number-pad" style={styles.numeric} />
      <Field label={text.eta} value={eta} onChangeText={setEta} keyboardType="number-pad" style={styles.numeric} />
      <View style={styles.row}>
        <Button label={text.add} onPress={add} disabled={operation.busy} />
        <Button label={text.save} primary onPress={() => void operation.update(async () => {
          const response = await request(zonesPath, { method: "PUT", body: { zones } }, zonesResponse);
          onSaved(response.zones);
        })} disabled={operation.busy} />
      </View>
      {operation.feedback}
    </View>
  );
}

function BranchOptions({ initial, onSaved }: { initial: Setting; onSaved: (settings: Setting) => void }) {
  const { request } = useRestaurantSession();
  const [minimum, setMinimum] = useState(String(initial.minOrderMinor ?? 0));
  const [pickup, setPickup] = useState(initial.pickupEnabled ?? false);
  const operation = useUpdate();
  return (
    <View style={styles.card}>
      <AppText title>{text.branchSettings}</AppText>
      <Field label={text.minimum} value={minimum} onChangeText={setMinimum} keyboardType="number-pad" style={styles.numeric} />
      <View style={styles.row}><AppText>{text.pickup}</AppText><Switch accessibilityLabel={text.pickup} value={pickup} onValueChange={setPickup} /></View>
      <Button label={text.save} primary disabled={operation.busy} onPress={() => {
        const input = restaurantBranchSettingsSchema.safeParse({ minOrderMinor: integerField(minimum), pickupEnabled: pickup });
        if (!input.success) return operation.setError(messages.errors.validationError);
        void operation.update(async () => onSaved(await request(settingsPath, { method: "PATCH", body: input.data }, restaurantBranchSettingsSchema)));
      }} />
      {operation.feedback}
    </View>
  );
}

export function BranchControls({ geo, onSaved }: { geo: ReturnType<typeof useRestaurantGeo>; onSaved?: () => void }) {
  const hours = useRestaurantResource(hoursPath, openingPeriodsSchema);
  const zones = useRestaurantResource(zonesPath, zonesResponse);
  const settings = useRestaurantResource(settingsPath, restaurantBranchSettingsSchema);
  return (
    <>
      <Status busy={hours.loading} error={hours.error} retry={hours.reload} />
      {hours.data && <HoursEditor initial={hours.data.periods} onSaved={(periods) => { hours.setData({ periods }); onSaved?.(); }} />}
      <Status busy={zones.loading} error={zones.error} retry={zones.reload} />
      {zones.data && <ZonesEditor initial={zones.data.zones.map(({ neighborhoodId, feeMinor, etaMinutes }) => ({ neighborhoodId, feeMinor, etaMinutes }))} geo={geo} onSaved={(entries) => { zones.setData({ zones: entries }); onSaved?.(); }} />}
      <Status busy={settings.loading} error={settings.error} retry={settings.reload} />
      {settings.data && <BranchOptions initial={settings.data} onSaved={(value) => { settings.setData(value); onSaved?.(); }} />}
    </>
  );
}
