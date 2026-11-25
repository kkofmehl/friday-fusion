export const ACCENT_STORAGE_KEY = "friday-fusion-accent";

export const ACCENT_IDS = ["orange", "blue", "green", "purple", "red", "yellow", "cyan"] as const;

export type AccentId = (typeof ACCENT_IDS)[number];

export const DEFAULT_ACCENT: AccentId = "orange";

export const ACCENT_LABELS: Record<AccentId, string> = {
  orange: "Orange",
  blue: "Blue",
  green: "Green",
  purple: "Purple",
  red: "Red",
  yellow: "Yellow",
  cyan: "Cyan"
};

export const isAccentId = (value: string | null | undefined): value is AccentId =>
  typeof value === "string" && (ACCENT_IDS as readonly string[]).includes(value);

export const readAccent = (): AccentId => {
  if (typeof window === "undefined") {
    return DEFAULT_ACCENT;
  }
  const value = window.localStorage.getItem(ACCENT_STORAGE_KEY);
  return isAccentId(value) ? value : DEFAULT_ACCENT;
};

export const writeAccent = (accent: AccentId): void => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(ACCENT_STORAGE_KEY, accent);
};

/** Sets `document.documentElement.dataset.accent`. Orange clears the attribute so `:root` defaults apply. */
export const applyAccent = (accent: AccentId): void => {
  if (typeof document === "undefined") {
    return;
  }
  if (accent === DEFAULT_ACCENT) {
    delete document.documentElement.dataset.accent;
  } else {
    document.documentElement.dataset.accent = accent;
  }
};

export const setAccent = (accent: AccentId): void => {
  writeAccent(accent);
  applyAccent(accent);
};
