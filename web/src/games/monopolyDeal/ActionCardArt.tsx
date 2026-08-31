import type { JSX } from "react";
import type { ActionType } from "../../../../shared/monopolyDealData";

function IconShell({ children, className }: { children: JSX.Element; className: string }): JSX.Element {
  return (
    <div className={`md-action-icon ${className}`} aria-hidden>
      {children}
    </div>
  );
}

export function ActionCardArt({ action }: { action: ActionType }): JSX.Element | null {
  switch (action) {
    case "justSayNo":
      return (
        <IconShell className="md-action-icon--justSayNo">
          <svg viewBox="0 0 48 48" width="40" height="40">
            <circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" strokeWidth="4" />
            <path d="M14 14 34 34" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          </svg>
        </IconShell>
      );
    case "dealBreaker":
      return (
        <IconShell className="md-action-icon--dealBreaker">
          <svg viewBox="0 0 48 48" width="40" height="40">
            <path
              fill="currentColor"
              d="M10 36 22 8l4 10 12-2-8 20H10zm14-18-6 14h8l4-10-6-4z"
            />
          </svg>
        </IconShell>
      );
    case "slyDeal":
      return (
        <IconShell className="md-action-icon--slyDeal">
          <svg viewBox="0 0 48 48" width="40" height="40">
            <path
              fill="currentColor"
              d="M8 30c8-2 12-8 14-16 6 4 12 4 18 0-2 10-8 18-20 22l-12-6z"
            />
            <circle cx="34" cy="12" r="4" fill="currentColor" />
          </svg>
        </IconShell>
      );
    case "forcedDeal":
      return (
        <IconShell className="md-action-icon--forcedDeal">
          <svg viewBox="0 0 48 48" width="40" height="40">
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="3.5"
              strokeLinecap="round"
              d="M10 18h12M26 30h12M18 14l6 8M30 34l-6-8"
            />
          </svg>
        </IconShell>
      );
    case "debtCollector":
      return (
        <IconShell className="md-action-icon--debtCollector">
          <svg viewBox="0 0 48 48" width="40" height="40">
            <rect x="10" y="16" width="28" height="18" rx="3" fill="currentColor" opacity="0.2" />
            <path
              fill="currentColor"
              d="M14 20h20v2H14v-2zm0 6h14v2H14v-2zm18-2h2v6h-2v-6zM24 10c-4 0-7 3-7 7h4a3 3 0 1 1 6 0h4c0-4-3-7-7-7z"
            />
          </svg>
        </IconShell>
      );
    case "itsMyBirthday":
      return (
        <IconShell className="md-action-icon--itsMyBirthday">
          <svg viewBox="0 0 48 48" width="40" height="40">
            <path fill="currentColor" d="M10 34h28v4H10v-4zm4-8 4-10 4 6 4-6 4 10H14z" />
            <rect x="12" y="34" width="24" height="4" fill="currentColor" opacity="0.35" />
          </svg>
        </IconShell>
      );
    case "doubleTheRent":
      return (
        <IconShell className="md-action-icon--doubleTheRent">
          <svg viewBox="0 0 48 48" width="40" height="40">
            <text x="8" y="32" fill="currentColor" fontSize="22" fontWeight="800">
              2x
            </text>
            <path fill="currentColor" d="M28 14h10v4H28v-4zm0 8h10v4H28v-4zm0 8h10v4H28v-4z" opacity="0.55" />
          </svg>
        </IconShell>
      );
    case "passGo":
      return (
        <IconShell className="md-action-icon--passGo">
          <svg viewBox="0 0 48 48" width="40" height="40">
            <path
              fill="currentColor"
              d="M10 24h22l-6-6v4H10v4h16v4l6-6zM34 16v16l6-8-6-8z"
            />
          </svg>
        </IconShell>
      );
    default:
      return null;
  }
}

export function actionCardModifier(action: ActionType): string {
  return `md-card--action-${action}`;
}
