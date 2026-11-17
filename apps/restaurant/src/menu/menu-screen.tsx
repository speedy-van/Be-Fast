import { ApiClientError } from "@be-fast/api-client";
import {
  restaurantMenuSchema,
  type RestaurantMenu,
  type RestaurantMenuGroup,
  type RestaurantMenuItem,
  type RestaurantMenuSection,
} from "@be-fast/contracts";
import { formatMoney, type DisplayMode } from "@be-fast/domain";
import { restaurantMenuText as t } from "@be-fast/i18n";
import { colors } from "@be-fast/ui-tokens";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, SectionList, StyleSheet, Switch, View } from "react-native";
import { pickRestaurantImage } from "../media";
import { useRestaurantSession } from "../session";
import { AppText as Text, Button as MenuButton, nativeFont } from "../ui";
import { MenuEditor } from "./menu-editor";
import {
  mayEditMenu,
  menuPath,
  type MenuSave,
  type MenuTarget,
} from "./menu-model";

interface Actions {
  edit(target: MenuTarget): void;
  remove(path: string, name: string): void;
  toggle(kind: "items" | "options", id: string, available: boolean): void;
  duplicate(id: string): void;
  changePhoto(id: string): void;
}

function Availability({
  name,
  value,
  disabled,
  onChange,
}: {
  name: string;
  value: boolean;
  disabled: boolean;
  onChange: (available: boolean) => void;
}) {
  return (
    <View style={styles.availability}>
      <Text style={styles.secondary}>
        {value ? t.available : t.unavailable}
      </Text>
      <Switch
        accessibilityLabel={t.toggleAvailability(name)}
        disabled={disabled}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.brandText }}
        thumbColor={colors.panel}
        hitSlop={8}
        style={styles.switch}
      />
    </View>
  );
}

interface MenuRowControls {
  canEdit: boolean;
  busy: boolean;
  mode: DisplayMode;
  actions: Actions;
}

function OptionGroup({
  group,
  canEdit,
  busy,
  mode,
  actions,
}: MenuRowControls & { group: RestaurantMenuGroup }) {
  return (
    <View style={styles.subcard}>
      <Text style={styles.name}>{group.name}</Text>
      <Text style={styles.secondary}>
        {t.groupRange(group.minSelect, group.maxSelect)}
      </Text>
      {canEdit ? (
        <View style={styles.buttons}>
          <MenuButton
            label={t.editGroup}
            disabled={busy}
            onPress={() =>
              actions.edit({
                kind: "group",
                itemId: group.menuItemId,
                existing: group,
              })
            }
          />
          <MenuButton
            label={t.addOption}
            disabled={busy}
            onPress={() => actions.edit({ kind: "option", groupId: group.id })}
          />
          <MenuButton
            label={t.remove}
            disabled={busy}
            onPress={() =>
              actions.remove(
                `${menuPath}/option-groups/${group.id}`,
                group.name,
              )
            }
          />
        </View>
      ) : null}
      {group.options.map((option) => (
        <View key={option.id} style={styles.option}>
          <View style={styles.between}>
            <View style={styles.names}>
              <Text style={styles.name}>{option.name}</Text>
              {canEdit ? (
                <Text style={styles.secondary}>
                  {formatMoney(option.priceMinor, mode)}
                </Text>
              ) : null}
            </View>
            <Availability
              name={option.name}
              value={option.isAvailable}
              disabled={busy}
              onChange={(available) =>
                actions.toggle("options", option.id, available)
              }
            />
          </View>
          {canEdit ? (
            <View style={styles.buttons}>
              <MenuButton
                label={t.editOption}
                disabled={busy}
                onPress={() =>
                  actions.edit({
                    kind: "option",
                    groupId: group.id,
                    existing: option,
                  })
                }
              />
              <MenuButton
                label={t.remove}
                disabled={busy || group.options.length <= group.maxSelect}
                onPress={() =>
                  actions.remove(
                    `${menuPath}/options/${option.id}`,
                    option.name,
                  )
                }
              />
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function MenuItemCard({
  item,
  canEdit,
  busy,
  mode,
  actions,
}: MenuRowControls & { item: RestaurantMenuItem }) {
  const [expanded, setExpanded] = useState(false);
  const showDetails = canEdit || item.optionGroups.length > 0;
  return (
    <View style={styles.card}>
      <View style={styles.between}>
        <View style={styles.names}>
          <Text style={styles.itemName}>{item.name}</Text>
          {item.description ? (
            <Text style={styles.secondary}>{item.description}</Text>
          ) : null}
          {canEdit && item.imageKey ? (
            <Text style={styles.secondary}>{t.photoAttached}</Text>
          ) : null}
        </View>
        <Availability
          name={item.name}
          value={item.isAvailable}
          disabled={busy}
          onChange={(available) => actions.toggle("items", item.id, available)}
        />
      </View>
      <View style={styles.buttons}>
        {showDetails ? (
          <MenuButton
            label={expanded ? t.collapseItem : t.itemDetails}
            onPress={() => setExpanded((previous) => !previous)}
          />
        ) : null}
        {canEdit ? (
          <>
            <MenuButton
              label={t.editItem}
              disabled={busy}
              onPress={() =>
                actions.edit({
                  kind: "item",
                  sectionId: item.sectionId,
                  existing: item,
                })
              }
            />
            <MenuButton
              label={t.duplicate}
              disabled={busy}
              onPress={() => actions.duplicate(item.id)}
            />
            <MenuButton
              label={item.imageKey ? t.changePhoto : t.addPhoto}
              disabled={busy}
              onPress={() => actions.changePhoto(item.id)}
            />
            <MenuButton
              label={t.remove}
              disabled={busy}
              onPress={() =>
                actions.remove(`${menuPath}/items/${item.id}`, item.name)
              }
            />
          </>
        ) : null}
      </View>

      {expanded && showDetails ? (
        <View style={styles.details}>
          {canEdit ? (
            <>
              <Text accessibilityRole="header" style={styles.groupTitle}>
                {t.sizes}
              </Text>
              {item.sizes.map((size) => (
                <View key={size.id} style={styles.subcard}>
                  <Text style={styles.name}>
                    {item.sizes.length === 1 ? t.oneSize : size.name}
                  </Text>
                  <Text style={styles.secondary}>
                    {formatMoney(size.priceMinor, mode)}
                  </Text>
                  <View style={styles.buttons}>
                    <MenuButton
                      label={t.editSize}
                      disabled={busy}
                      onPress={() =>
                        actions.edit({
                          kind: "size",
                          itemId: item.id,
                          existing: size,
                        })
                      }
                    />
                    <MenuButton
                      label={t.remove}
                      disabled={busy || item.sizes.length === 1}
                      onPress={() =>
                        actions.remove(
                          `${menuPath}/sizes/${size.id}`,
                          size.name,
                        )
                      }
                    />
                  </View>
                </View>
              ))}
              <MenuButton
                label={t.addSize}
                disabled={busy}
                onPress={() => actions.edit({ kind: "size", itemId: item.id })}
              />
            </>
          ) : null}
          {canEdit || item.optionGroups.length > 0 ? (
            <Text accessibilityRole="header" style={styles.groupTitle}>
              {t.groups}
            </Text>
          ) : null}
          {item.optionGroups.map((group) => (
            <OptionGroup
              key={group.id}
              group={group}
              canEdit={canEdit}
              busy={busy}
              mode={mode}
              actions={actions}
            />
          ))}
          {canEdit ? (
            <MenuButton
              label={t.addGroup}
              disabled={busy}
              onPress={() => actions.edit({ kind: "group", itemId: item.id })}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

interface ListSection {
  key: string;
  menuSection: RestaurantMenuSection;
}

function readableError(error: unknown, fallback: string) {
  return error instanceof ApiClientError
    ? (error.publicMessage ?? fallback)
    : fallback;
}

export function MenuScreen() {
  const { request, role, restaurantId, currencyDisplayMode } =
    useRestaurantSession();
  const [loaded, setLoaded] = useState<{
    restaurantId: string;
    menu: RestaurantMenu;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [target, setTarget] = useState<MenuTarget | null>(null);
  const actionActive = useRef(false);
  const menuRead = useRef<AbortController | null>(null);
  const canEdit = mayEditMenu(role);
  const menu = loaded?.restaurantId === restaurantId ? loaded.menu : null;
  const busy = loading || saving;

  const refresh = useCallback(async () => {
    menuRead.current?.abort();
    const controller = new AbortController();
    menuRead.current = controller;
    const { signal } = controller;
    setLoading(true);
    try {
      const next = await request(menuPath, { signal }, restaurantMenuSchema);
      if (signal.aborted) return;
      setLoaded({ restaurantId, menu: next });
      setLoadError(null);
    } catch (error) {
      if (!signal.aborted) setLoadError(readableError(error, t.loadFailed));
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [request, restaurantId]);

  useEffect(() => {
    void refresh();
    return () => menuRead.current?.abort();
  }, [refresh]);

  async function perform(
    change: () => Promise<boolean | void>,
    closeEditor = false,
  ) {
    if (actionActive.current || loading) return;
    actionActive.current = true;
    setSaving(true);
    setActionError(null);
    try {
      if ((await change()) === false) return;
      if (closeEditor) setTarget(null);
      await refresh();
    } catch (error) {
      setActionError(readableError(error, t.saveFailed));
    } finally {
      actionActive.current = false;
      setSaving(false);
    }
  }

  const actions: Actions = {
    edit(next) {
      if (!canEdit || busy) return;
      setActionError(null);
      setTarget(next);
    },
    remove(path, name) {
      if (!canEdit || busy) return;
      Alert.alert(t.deleteTitle, t.confirmDelete(name), [
        { text: t.cancel, style: "cancel" },
        {
          text: t.remove,
          style: "destructive",
          onPress: () =>
            void perform(async () => {
              await request(path, { method: "DELETE" });
            }),
        },
      ]);
    },
    toggle(kind, id, available) {
      void perform(async () => {
        await request(`${menuPath}/${kind}/${id}/availability`, {
          method: "PATCH",
          body: { isAvailable: available },
        });
      });
    },
    duplicate(id) {
      if (canEdit)
        void perform(async () => {
          await request(`${menuPath}/items/${id}/duplicate`, {
            method: "POST",
          });
        });
    },
    changePhoto(id) {
      if (canEdit)
        void perform(async () => {
          const body = await pickRestaurantImage();
          if (!body) return false;
          await request(`${menuPath}/items/${id}/image`, {
            method: "POST",
            body,
          });
        });
    },
  };

  function save({ path, method, body }: MenuSave) {
    if (canEdit)
      void perform(async () => {
        await request(path, { method, body });
      }, true);
  }

  const sections =
    menu?.sections.map((section) => ({
      key: section.id,
      menuSection: section,
      data: section.items,
    })) ?? [];
  return (
    <View style={styles.page}>
      <SectionList<RestaurantMenuItem, ListSection>
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        stickySectionHeadersEnabled={false}
        refreshing={loading}
        onRefresh={() => {
          if (!actionActive.current) void refresh();
        }}
        ListHeaderComponent={
          <View style={styles.heading}>
            <Text accessibilityRole="header" style={styles.title}>
              {t.title}
            </Text>
            {canEdit ? (
              <MenuButton
                label={t.addSection}
                primary
                disabled={busy || menu === null}
                onPress={() => actions.edit({ kind: "section" })}
              />
            ) : null}
            {loading || saving ? (
              <Text accessibilityLiveRegion="polite" style={styles.secondary}>
                {saving ? t.saving : t.refreshing}
              </Text>
            ) : null}
            {loadError === null ? null : (
              <View style={styles.heading}>
                <Text accessibilityRole="alert" style={styles.error}>
                  {loadError}
                </Text>
                {menu ? <Text style={styles.secondary}>{t.stale}</Text> : null}
                <MenuButton
                  label={t.retry}
                  disabled={busy}
                  onPress={() => void refresh()}
                />
              </View>
            )}
            {target === null && actionError ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {actionError}
              </Text>
            ) : null}
            {menu?.sections.length === 0 && !loading ? (
              <Text style={styles.secondary}>{t.empty}</Text>
            ) : null}
          </View>
        }
        renderSectionHeader={({ section: { menuSection } }) => (
          <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              {menuSection.name}
            </Text>
            {canEdit ? (
              <View style={styles.buttons}>
                <MenuButton
                  label={t.addItem}
                  disabled={busy}
                  onPress={() =>
                    actions.edit({ kind: "item", sectionId: menuSection.id })
                  }
                />
                <MenuButton
                  label={t.editSection}
                  disabled={busy}
                  onPress={() =>
                    actions.edit({ kind: "section", existing: menuSection })
                  }
                />
                <MenuButton
                  label={t.remove}
                  disabled={busy}
                  onPress={() =>
                    actions.remove(
                      `${menuPath}/sections/${menuSection.id}`,
                      menuSection.name,
                    )
                  }
                />
              </View>
            ) : null}
            {menuSection.items.length === 0 ? (
              <Text style={styles.secondary}>{t.noItems}</Text>
            ) : null}
          </View>
        )}
        renderItem={({ item }) => (
          <MenuItemCard
            item={item}
            canEdit={canEdit}
            busy={busy}
            mode={currencyDisplayMode}
            actions={actions}
          />
        )}
      />
      {target && menu && canEdit ? (
        <MenuEditor
          key={currencyDisplayMode}
          target={target}
          sections={menu.sections}
          mode={currencyDisplayMode}
          busy={saving}
          error={actionError}
          onClose={() => setTarget(null)}
          onSave={save}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 14, paddingBottom: 20 },
  heading: { gap: 10, marginVertical: 10, alignItems: "flex-start" },
  title: { fontSize: 26, fontFamily: nativeFont.bold },
  section: { gap: 8, paddingVertical: 10 },
  sectionTitle: { fontSize: 21, fontFamily: nativeFont.bold },
  card: {
    gap: 12,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.subtleBorder,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  subcard: {
    gap: 8,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.subtleBorder,
    borderRadius: 10,
    padding: 10,
  },
  option: {
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: colors.subtleBorder,
  },
  between: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  names: { flex: 1, gap: 4 },
  itemName: { fontSize: 19, fontFamily: nativeFont.bold },
  name: { fontSize: 16, fontFamily: nativeFont.bold },
  groupTitle: { fontSize: 17, fontFamily: nativeFont.bold },
  secondary: { color: colors.mutedInk, fontSize: 15 },
  error: { color: colors.brandText, fontSize: 16 },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  details: { gap: 8 },
  availability: { flexDirection: "row", alignItems: "center", gap: 2 },
  switch: { minHeight: 48, minWidth: 48 },
});
