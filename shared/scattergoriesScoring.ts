/** Count words in an answer that start with the round letter (case-insensitive). */
export const countLetterWords = (answer: string, letter: string): number => {
  const L = letter.toUpperCase();
  return answer
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => w[0]?.toUpperCase() === L).length;
};
