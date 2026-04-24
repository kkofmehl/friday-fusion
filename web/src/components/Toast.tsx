import { useEffect } from "react";

export type ToastKind = "error" | "info";

export function Toast({
  message,
  kind = "error",
  onDismiss
}: {
  message: string;
  kind?: ToastKind;
  onDismiss: () => void;
}): JSX.Element | null {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;
  return (
    <div className={`toast toast-${kind}`} role="alert">
      <span>{message}</span>
      <button type="button" className="toast-close" onClick={onDismiss} aria-label="Dismiss">
        &times;
      </button>
    </div>
  );
}
