import { describe, expect, it } from "vitest";
import { matchFriendlyFeudGuess } from "../../shared/friendlyFeudLogic";
import {
  buildAnswerAlts,
  enrichFriendlyFeudAnswer,
  listFriendlyFeudQuestions,
  slashPartsFromAnswer
} from "./friendlyFeudQuestions";

describe("friendlyFeudQuestions answer enrichment", () => {
  it("splits slash answers into parts", () => {
    expect(slashPartsFromAnswer("TV/Movies")).toEqual(["TV", "Movies"]);
    expect(slashPartsFromAnswer("Purse/Wallet")).toEqual(["Purse", "Wallet"]);
  });

  it("adds cops as an alt for Police via synonym groups", () => {
    const alts = buildAnswerAlts("Police");
    expect(alts.map((a) => a.toLowerCase())).toContain("cops");
    expect(alts.map((a) => a.toLowerCase())).toContain("cop");
  });

  it("enriches slash answers so short parts match", () => {
    const enriched = enrichFriendlyFeudAnswer({ ans: "TV/Movies", pnt: 66 });
    expect(enriched.alts).toEqual(expect.arrayContaining(["TV", "Movies"]));
    expect(matchFriendlyFeudGuess("tv", [enriched], [false])?.ans).toBe("TV/Movies");
  });

  it("loads bank answers with police↔cops matching", () => {
    const policeAnswer = listFriendlyFeudQuestions()
      .flatMap((q) => q.answers)
      .find((a) => a.ans.toLowerCase() === "police");
    expect(policeAnswer).toBeTruthy();
    expect(matchFriendlyFeudGuess("cops", [policeAnswer!], [false])?.ans).toBe("Police");
  });

  it("covers other common bank synonyms from enrichment", () => {
    const answers = listFriendlyFeudQuestions().flatMap((q) => q.answers);
    const find = (ans: string) => answers.find((a) => a.ans.toLowerCase() === ans.toLowerCase());

    expect(matchFriendlyFeudGuess("automobile", [find("Car")!], [false])?.ans).toBe("Car");
    expect(matchFriendlyFeudGuess("couch", [find("Sofa")!], [false])?.ans).toBe("Sofa");
    expect(matchFriendlyFeudGuess("pop", [find("Soda")!], [false])?.ans).toBe("Soda");
    expect(matchFriendlyFeudGuess("attorney", [find("Lawyer")!], [false])?.ans).toBe("Lawyer");
    expect(matchFriendlyFeudGuess("make up", [find("Makeup")!], [false])?.ans).toBe("Makeup");
    expect(matchFriendlyFeudGuess("puppy", [find("Dog")!], [false])?.ans).toBe("Dog");
    expect(matchFriendlyFeudGuess("burger", [find("Hamburger")!], [false])?.ans).toBe("Hamburger");
  });
});
