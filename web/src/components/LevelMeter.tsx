"use client";

import { useEffect, useRef } from "react";

const BARS = 14;

/** Live input level, animated from a ref so audio updates never re-render React. */
export function LevelMeter({ levelRef, active }: { levelRef: React.RefObject<number>; active: boolean }) {
  const barsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bars = barsRef.current ? Array.from(barsRef.current.children) as HTMLElement[] : [];
    if (!active) {
      bars.forEach((b) => (b.style.height = "3px"));
      return;
    }
    let frame = 0;
    const history: number[] = Array(BARS).fill(0);
    const tick = () => {
      history.push(levelRef.current ?? 0);
      history.shift();
      bars.forEach((bar, i) => {
        bar.style.height = `${Math.max(3, Math.round(history[i] * 22))}px`;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, levelRef]);

  return (
    <div className="meter" ref={barsRef} aria-hidden="true">
      {Array.from({ length: BARS }, (_, i) => (
        <span key={i} style={{ height: 3 }} />
      ))}
    </div>
  );
}
