import { publicGeoSchema } from "@be-fast/contracts";
import { customerCatalog as text } from "@be-fast/i18n";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import type { CustomerRequest } from "../api";
import { AppText } from "../ui";
import { usePublicQuery } from "./query";
import {
  CatalogButton,
  CatalogNotice,
  catalogStyles as styles,
} from "./shared";
import type { Region } from "./types";

type Place = { id: string; name: string };

function PlaceChoices({
  label,
  choices,
  selected,
  choose,
}: {
  label: string;
  choices: readonly Place[];
  selected: string | undefined;
  choose: (id: string) => void;
}) {
  return (
    <View style={styles.stack}>
      <AppText title>{label}</AppText>
      <View style={styles.row}>
        {choices.map(({ id, name }) => (
          <CatalogButton
            key={id}
            label={name}
            selected={id === selected}
            onPress={() => choose(id)}
          />
        ))}
      </View>
    </View>
  );
}

export function RegionPicker({
  request,
  initialRegion,
  onSelect,
  onCancel,
}: {
  request: CustomerRequest;
  initialRegion?: Region | null;
  onSelect: (region: Region) => void;
  onCancel?: () => void;
}) {
  const geo = usePublicQuery("/public/geo", publicGeoSchema, request);
  const [governorateId, setGovernorate] = useState(
    initialRegion?.governorateId,
  );
  const [cityId, setCity] = useState(initialRegion?.cityId);
  const [neighborhoodId, setNeighborhood] = useState(
    initialRegion?.neighborhoodId,
  );
  const governorate = geo.data?.find(({ id }) => id === governorateId);
  const city = governorate?.cities.find(({ id }) => id === cityId);
  const neighborhood = city?.neighborhoods.find(
    ({ id }) => id === neighborhoodId,
  );

  function confirm() {
    if (!governorate || !city || !neighborhood) return;
    onSelect({
      governorateId: governorate.id,
      governorateName: governorate.name,
      cityId: city.id,
      cityName: city.name,
      neighborhoodId: neighborhood.id,
      neighborhoodName: neighborhood.name,
    });
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <AppText title accessibilityRole="header">
        {text.chooseArea}
      </AppText>
      <CatalogNotice
        loading={geo.isPending}
        error={geo.isError}
        dataUpdatedAt={geo.dataUpdatedAt}
        retry={() => {
          void geo.refetch();
        }}
      />
      {geo.data?.length === 0 && <AppText muted>{text.noPlaces}</AppText>}
      {geo.data && geo.data.length > 0 && (
        <PlaceChoices
          label={text.governorate}
          choices={geo.data}
          selected={governorateId}
          choose={(id) => {
            setGovernorate(id);
            setCity(undefined);
            setNeighborhood(undefined);
          }}
        />
      )}
      {governorate && (
        <PlaceChoices
          label={text.city}
          choices={governorate.cities}
          selected={cityId}
          choose={(id) => {
            setCity(id);
            setNeighborhood(undefined);
          }}
        />
      )}
      {city && (
        <PlaceChoices
          label={text.neighborhood}
          choices={city.neighborhoods}
          selected={neighborhoodId}
          choose={setNeighborhood}
        />
      )}
      <CatalogButton
        label={text.confirmArea}
        primary
        disabled={!neighborhood}
        onPress={confirm}
      />
      {onCancel && <CatalogButton label={text.back} onPress={onCancel} />}
    </ScrollView>
  );
}
