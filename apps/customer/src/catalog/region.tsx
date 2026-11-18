import { publicGeoSchema } from "@be-fast/contracts";
import { customerCatalog as text } from "@be-fast/i18n";
import { BrandMark, enterUp, GradientFill, Icon, PressableScale } from "@be-fast/ui-native";
import { colors, gradients, radius, spacing } from "@be-fast/ui-tokens";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { useAndroidBack } from "../android-back";
import type { CustomerRequest } from "../api";
import { AppText, Button, IconButton } from "../ui";
import { usePublicQuery } from "./query";
import { CatalogNotice } from "./shared";
import type { Region } from "./types";

type Place = { id: string; name: string };

function PlaceChoices({
  step,
  label,
  choices,
  selected,
  choose,
}: {
  step: number;
  label: string;
  choices: readonly Place[];
  selected: string | undefined;
  choose: (id: string) => void;
}) {
  return (
    <Animated.View entering={enterUp(step)} style={styles.step}>
      <View style={styles.stepHead}>
        <View style={[styles.stepNumber, selected && styles.stepDone]}>
          {selected ? (
            <Icon name="check" size={16} color={colors.onBrand} strokeWidth={3} />
          ) : (
            <AppText weight="bold" variant="small" tone="brand">
              {step + 1}
            </AppText>
          )}
        </View>
        <AppText variant="title">{label}</AppText>
      </View>
      <View style={styles.options}>
        {choices.map(({ id, name }) => {
          const active = id === selected;
          return (
            <PressableScale
              key={id}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={name}
              onPress={() => choose(id)}
              style={[styles.option, active && styles.optionActive]}
            >
              <Icon
                name="pin"
                size={18}
                color={active ? colors.brandText : colors.mutedInk}
              />
              <AppText
                weight={active ? "bold" : "medium"}
                tone={active ? "brand" : undefined}
                numberOfLines={1}
              >
                {name}
              </AppText>
            </PressableScale>
          );
        })}
      </View>
    </Animated.View>
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
  useAndroidBack(onCancel);

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
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <GradientFill from={gradients.brand[0]} to={gradients.brand[1]} id="region" />
          {onCancel && (
            <View style={styles.back}>
              <IconButton icon="back" label={text.back} onPress={onCancel} tone="glass" />
            </View>
          )}
          <BrandMark size={96} body={colors.onBrand} bolt={colors.brandStrong} gap={gradients.brand[0]} />
          <AppText variant="headline" tone="onBrand" accessibilityRole="header" center>
            {text.chooseArea}
          </AppText>
          <AppText tone="onBrand" center>
            {text.stepArea}
          </AppText>
        </View>
        <View style={styles.body}>
          <CatalogNotice
            loading={geo.isPending}
            error={geo.isError}
            dataUpdatedAt={geo.dataUpdatedAt}
            retry={() => {
              void geo.refetch();
            }}
          />
          {geo.data?.length === 0 && (
            <AppText muted center>
              {text.noPlaces}
            </AppText>
          )}
          {geo.data && geo.data.length > 0 && (
            <PlaceChoices
              step={0}
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
              key={governorate.id}
              step={1}
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
              key={city.id}
              step={2}
              label={text.neighborhood}
              choices={city.neighborhoods}
              selected={neighborhoodId}
              choose={setNeighborhood}
            />
          )}
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <Button
          label={text.confirmArea}
          primary
          icon="check"
          disabled={!neighborhood}
          onPress={confirm}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { paddingBottom: 120 },
  hero: {
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl,
    borderBottomLeftRadius: radius.xl + 8,
    borderBottomRightRadius: radius.xl + 8,
    overflow: "hidden",
  },
  back: { position: "absolute", top: spacing.md, start: spacing.lg },
  body: { padding: spacing.lg, gap: spacing.xl },
  step: { gap: spacing.md },
  stepHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTint,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDone: { backgroundColor: colors.success },
  options: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    borderWidth: 1.5,
    borderColor: colors.subtleBorder,
  },
  optionActive: { borderColor: colors.brandText, backgroundColor: colors.brandTint },
  footer: {
    position: "absolute",
    start: 0,
    end: 0,
    bottom: 0,
    padding: spacing.lg,
    backgroundColor: colors.panel,
    borderTopWidth: 1,
    borderTopColor: colors.subtleBorder,
    elevation: 12,
  },
});
