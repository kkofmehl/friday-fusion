import { describe, expect, it } from "vitest";
import type { GameAttribute } from "../../../shared/gameAttributes";
import { filterGamesByAttributes, sortGamesByTitle } from "./lobbyGameDisplay";

const catalog = [
  { id: "hangman", title: "Hangman", attributes: ["scorable", "game", "short"] as const },
  { id: "guessWho", title: "Guess Who Said It?", attributes: ["scorable", "game", "long"] as const },
  { id: "guessImage", title: "Guess the image", attributes: ["scorable", "game", "long"] as const },
  { id: "twenty", title: "20 Questions", attributes: ["scorable", "game", "team", "long"] as const },
  { id: "madlibs", title: "Madlibs", attributes: ["activity", "short"] as const },
  { id: "wyr", title: "Would You Rather", attributes: ["activity", "short"] as const },
  { id: "pictionary", title: "Pictionary", attributes: ["scorable", "game", "team", "long"] as const }
];

describe("lobby game display", () => {
  it("sorts titles alphabetically, ignoring case and treating leading numbers as numbers", () => {
    const sorted = sortGamesByTitle(catalog).map((game) => game.title);
    expect(sorted).toEqual([
      "20 Questions",
      "Guess the image",
      "Guess Who Said It?",
      "Hangman",
      "Madlibs",
      "Pictionary",
      "Would You Rather"
    ]);
  });

  it("returns every game when no attribute filters are selected", () => {
    expect(filterGamesByAttributes(catalog, (game) => game.attributes, [])).toEqual(catalog);
  });

  it("keeps games that have every selected attribute", () => {
    const selected: GameAttribute[] = ["activity", "short"];
    expect(filterGamesByAttributes(catalog, (game) => game.attributes, selected).map((game) => game.id)).toEqual([
      "madlibs",
      "wyr"
    ]);
  });

  it("treats Game and Activity as alternatives, and Shorter and Longer the same way", () => {
    expect(filterGamesByAttributes(catalog, (game) => game.attributes, ["game", "activity"]).map((game) => game.id)).toEqual(
      catalog.map((game) => game.id)
    );
    expect(filterGamesByAttributes(catalog, (game) => game.attributes, ["game", "team"]).map((game) => game.id)).toEqual([
      "twenty",
      "pictionary"
    ]);
  });

  it("returns an empty list when no game has every selected attribute", () => {
    const selected: GameAttribute[] = ["team", "short"];
    expect(filterGamesByAttributes(catalog, (game) => game.attributes, selected)).toEqual([]);
  });
});
