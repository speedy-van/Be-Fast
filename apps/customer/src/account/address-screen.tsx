import {
  customerAddressCreateSchema,
  customerAddressListSchema,
  customerAddressSchema,
} from "@be-fast/contracts";
import { customerAccountText as text, messages } from "@be-fast/i18n";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { Alert, Modal, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { z } from "zod";
import { serviceError, type CustomerRequest } from "../api";
import { RegionPicker } from "../catalog/region";
import type { Region } from "../catalog/types";
import { useOrderRead } from "../orders/use-order-read";
import { AppText, Button, Field, ScrollScreen, Status, styles } from "../ui";

export type CustomerAddress = z.infer<typeof customerAddressSchema>;
type AddressInput = z.input<typeof customerAddressCreateSchema>;
type Coordinates = { latitude: number; longitude: number };
const path = "/customer/addresses";

export interface AddressScreenProps {
  request: CustomerRequest;
  region: Region;
  addresses: CustomerAddress[];
  selectedAddressId?: string | null;
  onUpdateAddresses(addresses: CustomerAddress[]): void;
  onSelect(id: string): void;
  onBack(): void;
}

function AddressEditor({
  request,
  region,
  existing,
  busy,
  onSave,
  onBack,
}: {
  request: CustomerRequest;
  region: Region;
  existing?: CustomerAddress;
  busy: boolean;
  onSave(input: AddressInput): void;
  onBack(): void;
}) {
  const [area, setArea] = useState<Region | undefined>(() =>
    !existing || existing.neighborhoodId === region.neighborhoodId
      ? region
      : undefined,
  );
  const [regionPicker, setRegionPicker] = useState(false);
  const [street, setStreet] = useState(existing?.street ?? "");
  const [landmark, setLandmark] = useState(existing?.landmark ?? "");
  const [building, setBuilding] = useState(existing?.building ?? "");
  const [floor, setFloor] = useState(existing?.floor ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [label, setLabel] = useState(existing?.label ?? "");
  const [coordinates, setCoordinates] = useState<Coordinates | null>(() =>
    existing?.latitude != null && existing.longitude != null
      ? { latitude: existing.latitude, longitude: existing.longitude }
      : null,
  );
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string>();
  const locatingNow = useRef(false);

  async function getLocation() {
    if (locatingNow.current) return;
    locatingNow.current = true;
    setLocating(true);
    setLocationError(undefined);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationError(text.locationDenied);
        return;
      }
      const { coords } = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setCoordinates({
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
    } catch {
      setLocationError(text.locationDenied);
    } finally {
      locatingNow.current = false;
      setLocating(false);
    }
  }

  return (
    <View style={styles.card}>
      <Modal
        visible={regionPicker}
        onRequestClose={() => setRegionPicker(false)}
      >
        <SafeAreaView style={styles.body}>
          <RegionPicker
            request={request}
            initialRegion={area}
            onCancel={() => setRegionPicker(false)}
            onSelect={(selected) => {
              setArea(selected);
              setRegionPicker(false);
            }}
          />
        </SafeAreaView>
      </Modal>
      <AppText title>{existing ? text.editAddress : text.addAddress}</AppText>
      {area && (
        <AppText>
          {text.addressArea} · {area.neighborhoodName}
        </AppText>
      )}
      <Button
        label={text.changeArea}
        onPress={() => setRegionPicker(true)}
        disabled={busy || locating}
      />
      <Field
        label={text.street}
        value={street}
        onChangeText={setStreet}
        maxLength={200}
        editable={!busy}
      />
      <Field
        label={text.landmark}
        value={landmark}
        onChangeText={setLandmark}
        maxLength={200}
        editable={!busy}
      />
      <Field
        label={text.building}
        value={building}
        onChangeText={setBuilding}
        maxLength={100}
        editable={!busy}
      />
      <Field
        label={text.floor}
        value={floor}
        onChangeText={setFloor}
        maxLength={50}
        editable={!busy}
      />
      <Field
        label={text.notes}
        value={notes}
        onChangeText={setNotes}
        maxLength={500}
        multiline
        editable={!busy}
      />
      <Field
        label={text.label}
        value={label}
        onChangeText={setLabel}
        maxLength={60}
        editable={!busy}
      />
      <Button
        label={text.useLocation}
        onPress={() => void getLocation()}
        disabled={busy || locating}
      />
      {coordinates && (
        <>
          <AppText muted>{text.locationAdded}</AppText>
          <Button
            label={text.removeLocation}
            onPress={() => setCoordinates(null)}
            disabled={busy || locating}
          />
        </>
      )}
      <Status busy={locating} error={locationError} />
      <View style={styles.row}>
        <Button
          label={text.save}
          primary
          disabled={locating || busy || !street.trim() || !landmark.trim()}
          onPress={() =>
            onSave({
              neighborhoodId:
                area?.neighborhoodId ??
                existing?.neighborhoodId ??
                region.neighborhoodId,
              street,
              landmark,
              building: building.trim() || null,
              floor: floor.trim() || null,
              notes: notes.trim() || null,
              label: label.trim() || null,
              latitude: coordinates?.latitude ?? null,
              longitude: coordinates?.longitude ?? null,
            })
          }
        />
        <Button label={text.cancel} onPress={onBack} disabled={busy} />
      </View>
    </View>
  );
}

export function AddressScreen({
  request,
  region,
  addresses,
  selectedAddressId,
  onUpdateAddresses,
  onSelect,
  onBack,
}: AddressScreenProps) {
  const read = useOrderRead(request, path, customerAddressListSchema);
  const stored = read.data ?? addresses;
  const updateAddressList = useRef(onUpdateAddresses);
  const acting = useRef(false);
  const [editing, setEditing] = useState<CustomerAddress | null>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    updateAddressList.current = onUpdateAddresses;
  }, [onUpdateAddresses]);
  useEffect(() => {
    if (read.data) updateAddressList.current(read.data);
  }, [read.data]);

  async function update(
    action: () => Promise<CustomerAddress[]>,
    afterSuccess?: () => void,
  ) {
    if (acting.current) return;
    acting.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const next = await action();
      read.replace(next);
      afterSuccess?.();
      await read.refresh();
    } catch (cause) {
      setError(serviceError(cause));
    } finally {
      acting.current = false;
      setBusy(false);
    }
  }

  function save(input: AddressInput) {
    const validated = customerAddressCreateSchema.safeParse(input);
    if (!validated.success) {
      setError(messages.errors.validationError);
      return;
    }
    void update(
      async () => {
        const changed = await request(
          editing ? `${path}/${editing.id}` : path,
          { method: editing ? "PATCH" : "POST", body: validated.data },
          customerAddressSchema,
        );
        return editing
          ? stored.map((entry) => (entry.id === changed.id ? changed : entry))
          : [...stored, changed];
      },
      () => setEditing(undefined),
    );
  }

  function makeDefault(address: CustomerAddress) {
    void update(async () => {
      const changed = await request(
        `${path}/${address.id}/default`,
        { method: "PATCH" },
        customerAddressSchema,
      );
      return stored.map((entry) =>
        entry.id === address.id ? changed : { ...entry, isDefault: false },
      );
    });
  }

  function remove(address: CustomerAddress) {
    Alert.alert(text.deleteAddress, text.deleteAddressPrompt, [
      { text: text.cancel, style: "cancel" },
      {
        text: text.deleteAddress,
        style: "destructive",
        onPress: () =>
          void update(async () => {
            await request(`${path}/${address.id}`, { method: "DELETE" });
            return stored.filter((entry) => entry.id !== address.id);
          }),
      },
    ]);
  }

  return (
    <ScrollScreen>
      <Button label={text.back} onPress={onBack} disabled={busy} />
      <AppText title accessibilityRole="header">
        {text.addresses}
      </AppText>
      <Status
        busy={read.loading && stored.length === 0}
        error={read.error}
        message={read.error && stored.length > 0 ? text.stale : undefined}
        retry={read.refresh}
      />
      {editing === undefined ? (
        <>
          {stored.length === 0 && !read.loading && !read.error && (
            <AppText muted>{text.emptyAddresses}</AppText>
          )}
          {stored.map((address) => (
            <View key={address.id} style={styles.card}>
              <AppText title>{address.label ?? address.street}</AppText>
              {address.label && <AppText>{address.street}</AppText>}
              <AppText muted>{address.landmark}</AppText>
              {address.isDefault && (
                <AppText muted>{text.defaultAddress}</AppText>
              )}
              {selectedAddressId === address.id && (
                <AppText muted>{text.selectedAddress}</AppText>
              )}
              <View style={styles.row}>
                <Button
                  label={text.selectAddress}
                  onPress={() => onSelect(address.id)}
                  disabled={busy}
                />
                <Button
                  label={text.editAddress}
                  onPress={() => {
                    setError(undefined);
                    setEditing(address);
                  }}
                  disabled={busy}
                />
                {!address.isDefault && (
                  <Button
                    label={text.makeDefault}
                    onPress={() => makeDefault(address)}
                    disabled={busy}
                  />
                )}
                <Button
                  label={text.deleteAddress}
                  onPress={() => remove(address)}
                  disabled={busy}
                />
              </View>
            </View>
          ))}
          <Button
            label={text.addAddress}
            primary
            onPress={() => {
              setError(undefined);
              setEditing(null);
            }}
            disabled={busy}
          />
        </>
      ) : (
        <AddressEditor
          request={request}
          region={region}
          existing={editing ?? undefined}
          busy={busy}
          onSave={save}
          onBack={() => {
            setError(undefined);
            setEditing(undefined);
          }}
        />
      )}
      <Status busy={busy} error={error} />
    </ScrollScreen>
  );
}
