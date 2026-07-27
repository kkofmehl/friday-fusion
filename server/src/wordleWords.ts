import answers from "./data/wordleAnswers.json";
import guesses from "./data/wordleGuesses.json";
import { pickRandomAnswer, WORDLE_WORD_LENGTH } from "../../shared/wordleLogic";

const ANSWER_LIST: readonly string[] = answers as string[];
const GUESS_SET = new Set((guesses as string[]).map((w) => w.toLowerCase()));

export function getWordleAnswers(): readonly string[] {
  return ANSWER_LIST;
}

export function isValidWordleGuess(word: string): boolean {
  const normalized = word.trim().toLowerCase();
  return normalized.length === WORDLE_WORD_LENGTH && GUESS_SET.has(normalized);
}

export function pickWordleAnswer(usedAnswers: readonly string[], random?: () => number): string {
  return pickRandomAnswer(ANSWER_LIST, usedAnswers, random);
}
