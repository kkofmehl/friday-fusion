import type { GameAttribute } from "../../../shared/gameAttributes";

export function compareGameTitles(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: "base", numeric: true });
}

export function sortGamesByTitle<T extends { title: string }>(games: readonly T[]): T[] {
  return [...games].sort((left, right) => compareGameTitles(left.title, right.title));
}

/**
 * Attributes in the same group are alternatives (a game may match any of them).
 * A game must satisfy every group that has a selection.
 */
export const LOBBY_FILTER_GROUPS: readonly (readonly GameAttribute[])[] = [
  ["game", "activity"],
  ["scorable"],
  ["team"],
  ["short", "long"]
];

export function filterGamesByAttributes<T>(
  games: readonly T[],
  attributesFor: (game: T) => readonly GameAttribute[],
  selected: readonly GameAttribute[]
): T[] {
  if (selected.length === 0) return [...games];
  const selectedSet = new Set(selected);
  const grouped = new Set(LOBBY_FILTER_GROUPS.flat());
  const activeGroups = [
    ...LOBBY_FILTER_GROUPS.map((group) => group.filter((attribute) => selectedSet.has(attribute))).filter(
      (group) => group.length > 0
    ),
    ...selected.filter((attribute) => !grouped.has(attribute)).map((attribute) => [attribute])
  ];

  return games.filter((game) => {
    const attributes = attributesFor(game);
    return activeGroups.every((group) => group.some((attribute) => attributes.includes(attribute)));
  });
}
