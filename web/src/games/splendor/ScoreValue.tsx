import { useEffect, useRef, useState, type JSX } from "react";
import { animateNumber } from "./animate";

export function ScoreValue({
  value,
  from,
  className
}: {
  value: number;
  from?: number;
  className?: string;
}): JSX.Element {
  const [shown, setShown] = useState(from ?? value);
  const shownRef = useRef(from ?? value);

  useEffect(() => {
    const start = shownRef.current;
    if (start === value) {
      return;
    }
    return animateNumber((next) => {
      shownRef.current = next;
      setShown(next);
    }, start, value);
  }, [value]);

  return (
    <span className={["splendor-score", className].filter(Boolean).join(" ")}>
      {shown}
    </span>
  );
}
