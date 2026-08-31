import type { JSX } from "react";

export function SetBonusIcons({ house, hotel }: { house: boolean; hotel: boolean }): JSX.Element | null {
  if (!house && !hotel) {
    return null;
  }
  return (
    <span className="md-set-bonus-icons" aria-hidden>
      {house ? (
        <span className="md-set-bonus-icon md-set-bonus-icon--house">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path
              fill="currentColor"
              d="M12 3 3 11h2v9h6v-6h2v6h6v-9h2L12 3zm0 2.8 6 5.4V18h-2v-6H8v6H6v-6.8l6-5.4z"
            />
          </svg>
        </span>
      ) : null}
      {hotel ? (
        <span className="md-set-bonus-icon md-set-bonus-icon--hotel">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path
              fill="currentColor"
              d="M4 20V8l8-5 8 5v12H4zm2-2h12v-8.7l-6-3.75-6 3.75V18zm3-2h2v-2H9v2zm4 0h2v-2h-2v2zm-4-3h2v-2H9v2zm4 0h2v-2h-2v2z"
            />
          </svg>
        </span>
      ) : null}
    </span>
  );
}
