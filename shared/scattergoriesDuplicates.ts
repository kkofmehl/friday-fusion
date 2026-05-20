/** Normalized answer key for duplicate checks; empty answers do not participate. */
export const normalizeScattergoriesAnswer = (text: string): string | null => {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed.toLocaleLowerCase();
};

/** Indices of answers that repeat another non-empty answer on the same card. */
export const scattergoriesDuplicateIndices = (answers: string[]): Set<number> => {
  const duplicates = new Set<number>();
  const seen = new Map<string, number>();
  for (let index = 0; index < answers.length; index++) {
    const key = normalizeScattergoriesAnswer(answers[index] ?? "");
    if (!key) {
      continue;
    }
    const firstIndex = seen.get(key);
    if (firstIndex === undefined) {
      seen.set(key, index);
      continue;
    }
    duplicates.add(firstIndex);
    duplicates.add(index);
  }
  return duplicates;
};

export const isScattergoriesDuplicateAt = (answers: string[], index: number): boolean =>
  scattergoriesDuplicateIndices(answers).has(index);

/** True when this prompt's answer repeats another prompt for the same participant. */
export const participantHasDuplicateForPrompt = (answers: string[], promptIndex: number): boolean =>
  isScattergoriesDuplicateAt(answers, promptIndex);
