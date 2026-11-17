import type { RestaurantMenuSection } from "@be-fast/contracts";
import type { DisplayMode } from "@be-fast/domain";
import { restaurantMenuText as t } from "@be-fast/i18n";
import { darkColors as colors } from "@be-fast/ui-tokens";
import { useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  AppText as Text,
  Button as MenuButton,
  Field as MenuField,
  nativeFont,
} from "../ui";
import {
  initializeMenuDraft,
  prepareMenuSave,
  type MenuDraft,
  type MenuSave,
  type MenuTarget,
} from "./menu-model";

const titles = {
  section: { create: t.addSection, edit: t.editSection },
  item: { create: t.addItem, edit: t.editItem },
  size: { create: t.addSize, edit: t.editSize },
  group: { create: t.addGroup, edit: t.editGroup },
  option: { create: t.addOption, edit: t.editOption },
} as const;

interface EditorProps {
  target: MenuTarget;
  sections: RestaurantMenuSection[];
  mode: DisplayMode;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (mutation: MenuSave) => void;
}

export function MenuEditor({
  target,
  sections,
  mode,
  busy,
  error,
  onClose,
  onSave,
}: EditorProps) {
  const [draft, setDraft] = useState(() => initializeMenuDraft(target, mode));
  const [invalid, setInvalid] = useState(false);
  const nextOptionId = useRef(0);
  const title = titles[target.kind][target.existing ? "edit" : "create"];
  const amountInputMode = mode === "OLD" ? "numeric" : "decimal";

  function update<Field extends keyof MenuDraft>(
    key: Field,
    value: MenuDraft[Field],
  ) {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setInvalid(false);
  }

  function save() {
    const mutation = prepareMenuSave(target, draft, mode);
    setInvalid(mutation === null);
    if (mutation !== null) onSave(mutation);
  }

  const nameLabel = target.kind === "size" ? t.sizeName : t.name;
  const formError = invalid ? t.checkFields : error;
  return (
    <Modal
      visible
      animationType="none"
      onRequestClose={busy ? undefined : onClose}
    >
      <SafeAreaView style={styles.modal}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text accessibilityRole="header" style={styles.pageTitle}>
            {title}
          </Text>
          <MenuField
            label={nameLabel}
            value={draft.name}
            onChangeText={(value) => update("name", value)}
            editable={!busy}
          />
          <MenuField
            label={t.sortOrder}
            value={draft.sortOrder}
            onChangeText={(value) => update("sortOrder", value)}
            editable={!busy}
          />

          {target.kind === "item" ? (
            <>
              <MenuField
                label={t.description}
                value={draft.description}
                onChangeText={(value) => update("description", value)}
                multiline
                editable={!busy}
              />
              <Text style={styles.groupTitle}>{t.section}</Text>
              <View accessibilityRole="radiogroup" style={styles.buttons}>
                {sections.map((section) => {
                  const selected = section.id === draft.sectionId;
                  return (
                    <Pressable
                      key={section.id}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected, disabled: busy }}
                      disabled={busy}
                      onPress={() => update("sectionId", section.id)}
                      style={[styles.radio, selected && styles.selected]}
                    >
                      <Text style={styles.groupTitle}>{section.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <MenuField
                label={t.availableFrom}
                value={draft.availableFrom}
                onChangeText={(value) => update("availableFrom", value)}
                placeholder={t.timePlaceholder}
                maxLength={5}
                editable={!busy}
              />
              <MenuField
                label={t.availableTo}
                value={draft.availableTo}
                onChangeText={(value) => update("availableTo", value)}
                placeholder={t.timePlaceholder}
                maxLength={5}
                editable={!busy}
              />
              {target.existing ? null : (
                <>
                  <MenuField
                    label={t.firstSizeName}
                    value={draft.sizeName}
                    onChangeText={(value) => update("sizeName", value)}
                    editable={!busy}
                  />
                  <MenuField
                    label={t.firstSizePrice}
                    inputMode={amountInputMode}
                    maxLength={30}
                    value={draft.price}
                    onChangeText={(value) => update("price", value)}
                    editable={!busy}
                  />
                </>
              )}
            </>
          ) : null}

          {target.kind === "size" || target.kind === "option" ? (
            <MenuField
              label={t.price}
              inputMode={amountInputMode}
              maxLength={30}
              value={draft.price}
              onChangeText={(value) => update("price", value)}
              editable={!busy}
            />
          ) : null}

          {target.kind === "group" ? (
            <>
              <MenuField
                label={t.minSelect}
                inputMode="numeric"
                value={draft.minSelect}
                onChangeText={(value) => update("minSelect", value)}
                editable={!busy}
              />
              <MenuField
                label={t.maxSelect}
                inputMode="numeric"
                value={draft.maxSelect}
                onChangeText={(value) => update("maxSelect", value)}
                editable={!busy}
              />
              {target.existing ? null : (
                <>
                  {draft.options.map((option) => (
                    <View key={option.id} style={styles.option}>
                      <MenuField
                        label={t.name}
                        value={option.name}
                        onChangeText={(name) =>
                          update(
                            "options",
                            draft.options.map((entry) =>
                              entry.id === option.id
                                ? { ...entry, name }
                                : entry,
                            ),
                          )
                        }
                        editable={!busy}
                      />
                      <MenuField
                        label={t.price}
                        inputMode={amountInputMode}
                        maxLength={30}
                        value={option.price}
                        onChangeText={(price) =>
                          update(
                            "options",
                            draft.options.map((entry) =>
                              entry.id === option.id
                                ? { ...entry, price }
                                : entry,
                            ),
                          )
                        }
                        editable={!busy}
                      />
                      <MenuButton
                        label={t.remove}
                        disabled={busy}
                        onPress={() =>
                          update(
                            "options",
                            draft.options.filter(({ id }) => id !== option.id),
                          )
                        }
                      />
                    </View>
                  ))}
                  <MenuButton
                    label={t.addOption}
                    disabled={busy}
                    onPress={() =>
                      update("options", [
                        ...draft.options,
                        { id: nextOptionId.current++, name: "", price: "" },
                      ])
                    }
                  />
                </>
              )}
            </>
          ) : null}

          {formError === null ? null : (
            <Text accessibilityRole="alert" style={styles.notice}>
              {formError}
            </Text>
          )}
          <View style={styles.buttons}>
            <MenuButton
              label={busy ? t.saving : t.save}
              primary
              disabled={busy}
              onPress={save}
            />
            <MenuButton label={t.cancel} disabled={busy} onPress={onClose} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 14 },
  pageTitle: { fontSize: 24, fontFamily: nativeFont.bold },
  groupTitle: { fontSize: 15, fontFamily: nativeFont.bold },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  radio: {
    minHeight: 48,
    minWidth: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.panel,
  },
  selected: {
    borderColor: colors.brandText,
    borderWidth: 2,
    backgroundColor: colors.highlight,
  },
  option: {
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.subtleBorder,
    borderRadius: 10,
  },
  notice: { color: colors.brandText, fontSize: 16 },
});
