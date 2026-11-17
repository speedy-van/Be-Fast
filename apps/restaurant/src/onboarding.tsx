import {
  adminRestaurantProfileSchema, publicFoodCategoriesSchema, restaurantDocumentSchema,
  restaurantDocumentTypeSchema, restaurantImageUploadSchema, restaurantProfilePatchSchema,
} from "@be-fast/contracts";
import { messages, restaurantApp as text } from "@be-fast/i18n";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { z } from "zod";
import { serviceError } from "./api";
import { BranchControls } from "./branch-controls";
import { pickRestaurantImage } from "./media";
import { RegionSelector, useRestaurantGeo } from "./region";
import { useRestaurantSession } from "./session";
import { AppText, Button, Choices, Field, ScrollScreen, Status, styles } from "./ui";
import { useRestaurantResource } from "./use-resource";

const profilePath = "/restaurant/profile";
const documentsPath = "/restaurant/documents";
const documentListSchema = restaurantDocumentSchema.array();
const documentTypes = restaurantDocumentTypeSchema.options.map((id) => ({ id, label: text.documentTypes[id] }));
const steps = ["profile", "location", "photos", "hours", "review"] as const;
type Step = (typeof steps)[number];
type Profile = z.infer<typeof adminRestaurantProfileSchema>;
type ProfilePatch = z.input<typeof restaurantProfilePatchSchema>;

function ProfileFields({ profile, onSubmit, busy }: { profile: Profile; onSubmit: (patch: ProfilePatch) => void; busy: boolean }) {
  const categories = useRestaurantResource("/public/categories", publicFoodCategoriesSchema);
  const [name, setName] = useState(profile.name ?? "");
  const [contactPhone, setPhone] = useState(profile.contactPhone ?? "");
  const [categoryIds, setCategories] = useState(profile.categoryIds);
  return (
    <View style={styles.card}>
      <Field label={text.restaurantName} value={name} onChangeText={setName} />
      <Field label={text.contact} value={contactPhone} onChangeText={setPhone} keyboardType="phone-pad" style={styles.numeric} />
      <AppText>{text.categories}</AppText>
      <Status busy={categories.loading} error={categories.error} retry={categories.reload} />
      <View style={styles.row}>
        {categories.data?.map((category) => {
          const selected = categoryIds.includes(category.id);
          return <Pressable key={category.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected }}
            onPress={() => setCategories((ids) => selected ? ids.filter((id) => id !== category.id) : [...ids, category.id])}
            style={[styles.button, selected && styles.pressed]}><AppText>{category.name}</AppText></Pressable>;
        })}
      </View>
      <Button label={text.next} primary onPress={() => onSubmit({ name, contactPhone, categoryIds })} disabled={busy || categoryIds.length === 0} />
    </View>
  );
}

function LocationFields({ profile, geo, onSubmit, busy }: { profile: Profile; geo: ReturnType<typeof useRestaurantGeo>; onSubmit: (patch: ProfilePatch) => void; busy: boolean }) {
  const [neighborhoodId, setNeighborhood] = useState(profile.branch?.neighborhoodId ?? "");
  const [address, setAddress] = useState(profile.branch?.address ?? "");
  return (
    <View style={styles.card}>
      <RegionSelector geo={geo} neighborhoodId={neighborhoodId} onSelect={setNeighborhood} />
      <Field label={text.address} value={address} onChangeText={setAddress} />
      <Button label={text.next} primary onPress={() => onSubmit({ neighborhoodId, address })} disabled={busy} />
    </View>
  );
}

function Documents({ profile, onChanged, onContinue }: { profile: Profile; onChanged: () => void; onContinue: () => void }) {
  const { request } = useRestaurantSession();
  const documents = useRestaurantResource(documentsPath, documentListSchema);
  const [documentType, setDocumentType] = useState<(typeof documentTypes)[number]["id"]>("BUSINESS_REGISTRATION");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function upload(kind: "logo" | "cover" | "document") {
    setBusy(true); setError(undefined);
    try {
      const body = await pickRestaurantImage();
      if (!body) return;
      if (kind === "document") {
        const created = await request(`${documentsPath}/${documentType}`, { method: "POST", body }, restaurantDocumentSchema);
        documents.setData((previous) => [...(previous ?? []), created]);
      } else {
        await request(`${profilePath}/images/${kind}`, { method: "POST", body }, restaurantImageUploadSchema);
      }
      onChanged();
    } catch (cause) { setError(serviceError(cause)); }
    finally { setBusy(false); }
  }
  return (
    <View style={styles.card}>
      <Button label={text.logo} onPress={() => void upload("logo")} disabled={busy} />
      {profile.logoKey && <AppText muted>{text.logo} · {text.photoAdded}</AppText>}
      <Button label={text.cover} onPress={() => void upload("cover")} disabled={busy} />
      {profile.coverImageKey && <AppText muted>{text.cover} · {text.photoAdded}</AppText>}
      <Choices label={text.documents} values={documentTypes} selected={documentType} onSelect={setDocumentType} />
      <Button label={text.add} onPress={() => void upload("document")} disabled={busy} />
      <Status busy={documents.loading} error={documents.error} retry={documents.reload} />
      {documents.data?.map((doc) => <AppText key={doc.id}>{text.documentTypes[doc.type]} · {text.photoAdded}</AppText>)}
      <Status busy={busy} error={error} />
      <Button label={text.next} onPress={onContinue} primary disabled={busy || !profile.logoKey || !profile.coverImageKey || (documents.data?.length ?? 0) === 0} />
    </View>
  );
}

export function OnboardingScreen() {
  const { request } = useRestaurantSession();
  const profileResource = useRestaurantResource(profilePath, adminRestaurantProfileSchema);
  const geo = useRestaurantGeo();
  const [step, setStep] = useState<Step>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const profile = profileResource.data;
  const current = step ?? (!profile?.name ? "profile" : !profile.branch?.neighborhoodId ? "location" : !profile.logoKey || !profile.coverImageKey || !profile.documentCount ? "photos" : !profile.branch.openingPeriods.length || !profile.branch.deliveryZones.length ? "hours" : "review");

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(undefined);
    try { await action(); }
    catch (cause) { setError(serviceError(cause)); }
    finally { setBusy(false); }
  }

  function save(patch: ProfilePatch, next: Step) {
    const result = restaurantProfilePatchSchema.safeParse(patch);
    if (!result.success) return setError(messages.errors.validationError);
    void run(async () => {
      profileResource.setData(await request(profilePath, { method: "PATCH", body: result.data }, adminRestaurantProfileSchema));
      setStep(next);
    });
  }

  const editable = profile?.status === "DRAFT" || profile?.status === "REJECTED";
  return (
    <ScrollScreen>
      <AppText title>{text.onboarding}</AppText>
      <Status busy={profileResource.loading} error={profileResource.error} retry={profileResource.reload} />
      {profile && (
        <>
          <View style={styles.card}>
            <AppText>{profile.name ?? text.nameless} · {text.reviewStatus[profile.status]}</AppText>
            {profile.reviewReason && <AppText>{profile.reviewReason}</AppText>}
            {!editable && <Button label={text.retry} onPress={profileResource.reload} />}
          </View>
          {editable && (
            <>
              <Choices label={text.onboarding} values={steps.map((id) => ({ id, label: text[id] }))} selected={current} onSelect={(next) => { if (!busy) { setStep(next); setError(undefined); } }} />
              {current === "profile" && <ProfileFields profile={profile} onSubmit={(patch) => save(patch, "location")} busy={busy} />}
              {current === "location" && <LocationFields profile={profile} geo={geo} onSubmit={(patch) => save(patch, "photos")} busy={busy} />}
              {current === "photos" && <Documents profile={profile} onChanged={profileResource.reload} onContinue={() => setStep("hours")} />}
              {current === "hours" && <><BranchControls geo={geo} onSaved={profileResource.reload} /><Button label={text.next} onPress={() => setStep("review")} disabled={!profile.branch?.openingPeriods.length || !profile.branch.deliveryZones.length} /></>}
              {current === "review" && <Button label={text.submitReview} primary disabled={busy || !profile.logoKey || !profile.coverImageKey} onPress={() => void run(async () => {
                await request(`${profilePath}/submit`, { method: "POST" });
                profileResource.reload();
              })} />}
              <Status busy={busy} message={undefined} error={error} />
            </>
          )}
        </>
      )}
    </ScrollScreen>
  );
}
