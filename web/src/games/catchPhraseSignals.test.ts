import { describe, expect, it } from "vitest";
import { CATCH_PHRASE_SIGNAL_INTERVAL_MS, catchPhraseSignalStage } from "./catchPhraseSignals";

describe("catchPhraseSignals", () => {
  it("uses phase boundaries from the server (slow then medium then fast)", () => {
    const slowEnd = 100;
    const mediumEnd = 200;
    expect(catchPhraseSignalStage(0, slowEnd, mediumEnd)).toBe("slow");
    expect(catchPhraseSignalStage(99, slowEnd, mediumEnd)).toBe("slow");
    expect(catchPhraseSignalStage(100, slowEnd, mediumEnd)).toBe("medium");
    expect(catchPhraseSignalStage(199, slowEnd, mediumEnd)).toBe("medium");
    expect(catchPhraseSignalStage(200, slowEnd, mediumEnd)).toBe("fast");
    expect(catchPhraseSignalStage(500, slowEnd, mediumEnd)).toBe("fast");
  });

  it("exports descending interval cadences", () => {
    expect(CATCH_PHRASE_SIGNAL_INTERVAL_MS.slow).toBeGreaterThan(CATCH_PHRASE_SIGNAL_INTERVAL_MS.medium);
    expect(CATCH_PHRASE_SIGNAL_INTERVAL_MS.medium).toBeGreaterThan(CATCH_PHRASE_SIGNAL_INTERVAL_MS.fast);
  });
});
