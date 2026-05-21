export const PROFILE_USERNAME_STORAGE_KEY = "friday-fusion.profile-username";

export const readStoredProfileUsername = (): string => {
  if (typeof window === "undefined") {
    return "";
  }
  const value = window.localStorage.getItem(PROFILE_USERNAME_STORAGE_KEY);
  return value ? value.trim() : "";
};

export const writeStoredProfileUsername = (username: string): void => {
  if (typeof window === "undefined") {
    return;
  }
  const normalized = username.trim();
  if (!normalized) {
    window.localStorage.removeItem(PROFILE_USERNAME_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(PROFILE_USERNAME_STORAGE_KEY, normalized);
};
