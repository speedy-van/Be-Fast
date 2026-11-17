export interface MenuOption {
  readonly id: string;
  readonly isAvailable: boolean;
}

export interface MenuOptionGroup {
  readonly minSelect: number;
  readonly maxSelect: number;
  readonly options: readonly MenuOption[];
}

export function hasValidOptionBounds(
  minSelect: number,
  maxSelect: number,
  optionCount: number,
): boolean {
  return (
    Number.isInteger(minSelect) &&
    Number.isInteger(maxSelect) &&
    Number.isInteger(optionCount) &&
    0 <= minSelect &&
    minSelect <= maxSelect &&
    maxSelect <= optionCount
  );
}

export function validateMenuOptions(
  groups: readonly MenuOptionGroup[],
  selectedOptionIds: readonly string[],
): boolean {
  const remainingSelections = new Set(selectedOptionIds);
  if (remainingSelections.size !== selectedOptionIds.length) return false;

  for (const { minSelect, maxSelect, options } of groups) {
    if (!hasValidOptionBounds(minSelect, maxSelect, options.length))
      return false;

    let selectedCount = 0;
    for (const option of options) {
      if (!remainingSelections.delete(option.id)) continue;
      if (!option.isAvailable) return false;
      selectedCount++;
    }

    if (selectedCount < minSelect || selectedCount > maxSelect) return false;
  }

  return remainingSelections.size === 0;
}
