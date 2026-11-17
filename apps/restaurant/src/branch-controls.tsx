import {
  adminRestaurantProfileSchema,
  deliveryZonesSchema,
  openingPeriodsSchema,
  restaurantBranchSettingsSchema,
} from "@be-fast/contracts";
import { formatMoney } from "@be-fast/domain";
import { messages, restaurantApp as text } from "@be-fast/i18n";
import { useRef, useState } from "react";
import { Switch, View } from "react-native";
import { z } from "zod";
import { serviceError } from "./api";
import {
  normalizeDigits,
  priceInput,
  priceMinorFromInput,
} from "./menu/amount-input";
import { RegionSelector, useRestaurantGeo } from "./region";
import { useRestaurantSession } from "./session";
import { AppText, Button, Choices, Field, Status, styles } from "./ui";
import { useRestaurantResource } from "./use-resource";

const hoursPath = "/restaurant/branch/opening-periods";
const zonesPath = "/restaurant/branch/delivery-zones";
const settingsPath = "/restaurant/branch/settings";
const zonesResponse = z.object({
  zones: adminRestaurantProfileSchema.shape.branch.unwrap().shape.deliveryZones,
});
const weekdayChoices = text.weekdays.map((label, index) => ({
  id: String(index),
  label,
}));
type Periods = z.infer<typeof openingPeriodsSchema>["periods"];
type Zones = z.infer<typeof deliveryZonesSchema>["zones"];
type Setting = z.infer<typeof restaurantBranchSettingsSchema>;

function integerField(input: string) {
  const value = normalizeDigits(input.trim());
  return /^-?\d+$/u.test(value) ? Number(value) : NaN;
}

function useUpdate() {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  async function update(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(undefined);
    setSaved(false);
    try {
      await action();
      setSaved(true);
    } catch (cause) {
      setError(serviceError(cause));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  const feedback = (
    <Status
      busy={busy}
      error={error}
      message={saved ? text.saved : undefined}
    />
  );
  const edited = () => {
    setSaved(false);
    setError(undefined);
  };
  return { busy, setError, update, feedback, edited };
}

function HoursEditor({
  initial,
  onSaved,
}: {
  initial: Periods;
  onSaved: (periods: Periods) => void;
}) {
  const { request } = useRestaurantSession();
  const [periods, setPeriods] = useState(initial);
  const [day, setDay] = useState("0");
  const [opensAt, setOpen] = useState("");
  const [closesAt, setClose] = useState("");
  const operation = useUpdate();
  const draft = {
    dayOfWeek: Number(day),
    opensAt: normalizeDigits(opensAt),
    closesAt: normalizeDigits(closesAt),
  };
  const nextWithDraft = () =>
    openingPeriodsSchema.safeParse({ periods: [...periods, draft] });
  function add() {
    const next = nextWithDraft();
    if (!next.success)
      return operation.setError(messages.errors.validationError);
    operation.edited();
    setPeriods(next.data.periods);
    setOpen("");
    setClose("");
  }
  function save() {
    const parsed =
      opensAt || closesAt
        ? nextWithDraft()
        : openingPeriodsSchema.safeParse({ periods });
    if (!parsed.success)
      return operation.setError(messages.errors.validationError);
    void operation.update(async () => {
      const response = await request(
        hoursPath,
        { method: "PUT", body: parsed.data },
        openingPeriodsSchema,
      );
      setPeriods(response.periods);
      setOpen("");
      setClose("");
      onSaved(response.periods);
    });
  }
  return (
    <View style={styles.card}>
      <AppText title>{text.hours}</AppText>
      {periods.map(({ dayOfWeek, opensAt, closesAt }, index) => (
        <View
          key={`${dayOfWeek}-${opensAt}-${closesAt}-${index}`}
          style={styles.row}
        >
          <AppText>
            {text.weekdays[dayOfWeek]} · {opensAt} – {closesAt}
          </AppText>
          <Button
            label={text.remove}
            onPress={() => {
              operation.edited();
              setPeriods(periods.filter((_, position) => position !== index));
            }}
            disabled={operation.busy}
          />
        </View>
      ))}
      <Choices
        label={text.hours}
        values={weekdayChoices}
        selected={day}
        onSelect={(selected) => {
          if (!operation.busy) {
            operation.edited();
            setDay(selected);
          }
        }}
      />
      <AppText muted>{text.localTime}</AppText>
      <Field
        label={text.opensAt}
        value={opensAt}
        editable={!operation.busy}
        onChangeText={(value) => {
          operation.edited();
          setOpen(value);
        }}
        maxLength={5}
        style={styles.numeric}
      />
      <Field
        label={text.closesAt}
        value={closesAt}
        editable={!operation.busy}
        onChangeText={(value) => {
          operation.edited();
          setClose(value);
        }}
        maxLength={5}
        style={styles.numeric}
      />
      <View style={styles.row}>
        <Button label={text.add} onPress={add} disabled={operation.busy} />
        <Button
          label={text.save}
          primary
          onPress={save}
          disabled={operation.busy}
        />
      </View>
      {operation.feedback}
    </View>
  );
}

function ZonesEditor({
  initial,
  geo,
  onSaved,
}: {
  initial: Zones;
  geo: ReturnType<typeof useRestaurantGeo>;
  onSaved: (zones: z.infer<typeof zonesResponse>["zones"]) => void;
}) {
  const { request, currencyDisplayMode } = useRestaurantSession();
  const [zones, setZones] = useState(initial);
  const [neighborhoodId, select] = useState("");
  const [fee, setFee] = useState("");
  const [eta, setEta] = useState("");
  const operation = useUpdate();
  const allNeighborhoods =
    geo.data?.flatMap(({ cities }) =>
      cities.flatMap(({ neighborhoods }) => neighborhoods),
    ) ?? [];
  const amountInputMode = currencyDisplayMode === "NEW" ? "decimal" : "numeric";
  const zoneDraft = {
    neighborhoodId,
    feeMinor: priceMinorFromInput(fee, currencyDisplayMode),
    etaMinutes: integerField(eta),
  };
  const nextWithDraft = () =>
    deliveryZonesSchema.safeParse({
      zones: [
        ...zones.filter((zone) => zone.neighborhoodId !== neighborhoodId),
        zoneDraft,
      ],
    });
  function add() {
    const result = nextWithDraft();
    if (!result.success)
      return operation.setError(messages.errors.validationError);
    operation.edited();
    setZones(result.data.zones);
    select("");
    setFee("");
    setEta("");
  }
  function save() {
    const result =
      neighborhoodId || fee || eta
        ? nextWithDraft()
        : deliveryZonesSchema.safeParse({ zones });
    if (!result.success)
      return operation.setError(messages.errors.validationError);
    void operation.update(async () => {
      const response = await request(
        zonesPath,
        { method: "PUT", body: result.data },
        zonesResponse,
      );
      setZones(
        response.zones.map(({ neighborhoodId, feeMinor, etaMinutes }) => ({
          neighborhoodId,
          feeMinor,
          etaMinutes,
        })),
      );
      select("");
      setFee("");
      setEta("");
      onSaved(response.zones);
    });
  }
  return (
    <View style={styles.card}>
      <AppText title>{text.zones}</AppText>
      {zones.map((zone) => (
        <View key={zone.neighborhoodId} style={styles.row}>
          <AppText>
            {allNeighborhoods.find(({ id }) => id === zone.neighborhoodId)
              ?.name ?? text.neighborhood}{" "}
            · {formatMoney(zone.feeMinor, currencyDisplayMode)} ·{" "}
            {zone.etaMinutes}
          </AppText>
          <Button
            label={text.edit}
            onPress={() => {
              operation.edited();
              select(zone.neighborhoodId);
              setFee(priceInput(zone.feeMinor, currencyDisplayMode));
              setEta(String(zone.etaMinutes));
            }}
            disabled={operation.busy}
          />
          <Button
            label={text.remove}
            onPress={() => {
              operation.edited();
              setZones(
                zones.filter(
                  ({ neighborhoodId: id }) => id !== zone.neighborhoodId,
                ),
              );
              if (zone.neighborhoodId === neighborhoodId) {
                select("");
                setFee("");
                setEta("");
              }
            }}
            disabled={operation.busy}
          />
        </View>
      ))}
      <RegionSelector
        geo={geo}
        neighborhoodId={neighborhoodId}
        onSelect={(value) => {
          if (!operation.busy) {
            operation.edited();
            select(value);
          }
        }}
      />
      <Field
        label={text.fee}
        value={fee}
        editable={!operation.busy}
        onChangeText={(value) => {
          operation.edited();
          setFee(value);
        }}
        inputMode={amountInputMode}
        maxLength={30}
        style={styles.numeric}
      />
      <Field
        label={text.eta}
        value={eta}
        editable={!operation.busy}
        onChangeText={(value) => {
          operation.edited();
          setEta(value);
        }}
        keyboardType="number-pad"
        style={styles.numeric}
      />
      <View style={styles.row}>
        <Button label={text.add} onPress={add} disabled={operation.busy} />
        <Button
          label={text.save}
          primary
          onPress={save}
          disabled={operation.busy}
        />
      </View>
      {operation.feedback}
    </View>
  );
}

function BranchOptions({
  initial,
  onSaved,
}: {
  initial: Setting;
  onSaved: (settings: Setting) => void;
}) {
  const { request, currencyDisplayMode } = useRestaurantSession();
  const [minimum, setMinimum] = useState(() =>
    priceInput(initial.minOrderMinor ?? 0, currencyDisplayMode),
  );
  const [pickup, setPickup] = useState(initial.pickupEnabled ?? false);
  const operation = useUpdate();
  return (
    <View style={styles.card}>
      <AppText title>{text.branchSettings}</AppText>
      <Field
        label={text.minimum}
        value={minimum}
        editable={!operation.busy}
        onChangeText={(value) => {
          operation.edited();
          setMinimum(value);
        }}
        inputMode={currencyDisplayMode === "NEW" ? "decimal" : "numeric"}
        maxLength={30}
        style={styles.numeric}
      />
      <View style={styles.row}>
        <AppText>{text.pickup}</AppText>
        <Switch
          accessibilityLabel={text.pickup}
          value={pickup}
          disabled={operation.busy}
          onValueChange={(value) => {
            operation.edited();
            setPickup(value);
          }}
        />
      </View>
      <Button
        label={text.save}
        primary
        disabled={operation.busy}
        onPress={() => {
          const minOrderMinor = priceMinorFromInput(
            minimum,
            currencyDisplayMode,
          );
          if (minOrderMinor === undefined)
            return operation.setError(messages.errors.validationError);
          const input = restaurantBranchSettingsSchema.safeParse({
            minOrderMinor,
            pickupEnabled: pickup,
          });
          if (!input.success)
            return operation.setError(messages.errors.validationError);
          void operation.update(async () =>
            onSaved(
              await request(
                settingsPath,
                { method: "PATCH", body: input.data },
                restaurantBranchSettingsSchema,
              ),
            ),
          );
        }}
      />
      {operation.feedback}
    </View>
  );
}

export function BranchControls({
  geo,
  onSaved,
}: {
  geo: ReturnType<typeof useRestaurantGeo>;
  onSaved?: () => void;
}) {
  const { currencyDisplayMode } = useRestaurantSession();
  const hours = useRestaurantResource(hoursPath, openingPeriodsSchema);
  const zones = useRestaurantResource(zonesPath, zonesResponse);
  const settings = useRestaurantResource(
    settingsPath,
    restaurantBranchSettingsSchema,
  );
  return (
    <>
      <Status busy={hours.loading} error={hours.error} retry={hours.reload} />
      {hours.data && (
        <HoursEditor
          initial={hours.data.periods}
          onSaved={(periods) => {
            hours.setData({ periods });
            onSaved?.();
          }}
        />
      )}
      <Status busy={zones.loading} error={zones.error} retry={zones.reload} />
      {zones.data && (
        <ZonesEditor
          key={`zones-${currencyDisplayMode}`}
          initial={zones.data.zones.map(
            ({ neighborhoodId, feeMinor, etaMinutes }) => ({
              neighborhoodId,
              feeMinor,
              etaMinutes,
            }),
          )}
          geo={geo}
          onSaved={(entries) => {
            zones.setData({ zones: entries });
            onSaved?.();
          }}
        />
      )}
      <Status
        busy={settings.loading}
        error={settings.error}
        retry={settings.reload}
      />
      {settings.data && (
        <BranchOptions
          key={`settings-${currencyDisplayMode}`}
          initial={settings.data}
          onSaved={(value) => {
            settings.setData(value);
            onSaved?.();
          }}
        />
      )}
    </>
  );
}
