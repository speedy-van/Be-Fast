import { publicGeoSchema } from "@be-fast/contracts";
import { restaurantApp as text } from "@be-fast/i18n";
import { useState } from "react";
import { View } from "react-native";
import { Choices, Status, styles } from "./ui";
import { useRestaurantResource } from "./use-resource";

const choices = (items: readonly { id: string; name: string }[]) => items.map(({ id, name }) => ({ id, label: name }));

export function useRestaurantGeo() { return useRestaurantResource("/public/geo", publicGeoSchema); }

export function RegionSelector({ neighborhoodId, onSelect, geo }: { neighborhoodId?: string; onSelect: (id: string) => void; geo: ReturnType<typeof useRestaurantGeo> }) {
  const [selectedGovernorate, setGovernorate] = useState<string>();
  const [selectedCity, setCity] = useState<string>();
  const currentGovernorate = geo.data?.find(({ cities }) => cities.some(({ neighborhoods }) => neighborhoods.some(({ id }) => id === neighborhoodId)));
  const governorate = geo.data?.find(({ id }) => id === selectedGovernorate) ?? currentGovernorate;
  const city = governorate?.cities.find(({ id }) => id === selectedCity) ?? governorate?.cities.find(({ neighborhoods }) => neighborhoods.some(({ id }) => id === neighborhoodId));
  return (
    <View style={styles.field}>
      <Status busy={geo.loading} error={geo.error} retry={geo.reload} />
      {geo.data && <Choices label={text.governorate} values={choices(geo.data)} selected={governorate?.id} onSelect={(id) => { setGovernorate(id); setCity(undefined); onSelect(""); }} />}
      {governorate && <Choices label={text.city} values={choices(governorate.cities)} selected={city?.id} onSelect={(id) => { setCity(id); onSelect(""); }} />}
      {city && <Choices label={text.neighborhood} values={choices(city.neighborhoods)} selected={neighborhoodId} onSelect={onSelect} />}
    </View>
  );
}
