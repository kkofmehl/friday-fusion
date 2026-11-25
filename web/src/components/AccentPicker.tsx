import { useState } from "react";
import {
  ACCENT_IDS,
  ACCENT_LABELS,
  type AccentId,
  readAccent,
  setAccent
} from "../theme/accentTheme";

export function AccentPicker(): JSX.Element {
  const [accent, setAccentState] = useState<AccentId>(() => readAccent());

  const select = (next: AccentId) => {
    setAccent(next);
    setAccentState(next);
  };

  return (
    <div className="accent-picker" role="group" aria-label="Color scheme">
      <p className="accent-picker-label">Color</p>
      <div className="accent-picker-swatches">
        {ACCENT_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className="accent-swatch"
            data-accent-swatch={id}
            aria-label={ACCENT_LABELS[id]}
            aria-pressed={accent === id}
            title={ACCENT_LABELS[id]}
            onClick={() => select(id)}
          />
        ))}
      </div>
    </div>
  );
}
