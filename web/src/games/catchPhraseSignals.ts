export type CatchPhraseSignalStage = "slow" | "medium" | "fast";

export const CATCH_PHRASE_SIGNAL_INTERVAL_MS: Record<CatchPhraseSignalStage, number> = {
  slow: 2000,
  medium: 1000,
  fast: 350
};

/** Map wall-clock time to beep / UI phase using absolute phase boundaries from the server. */
export function catchPhraseSignalStage(
  nowMs: number,
  slowPhaseEndsAt: number,
  mediumPhaseEndsAt: number
): CatchPhraseSignalStage {
  if (nowMs < slowPhaseEndsAt) {
    return "slow";
  }
  if (nowMs < mediumPhaseEndsAt) {
    return "medium";
  }
  return "fast";
}
