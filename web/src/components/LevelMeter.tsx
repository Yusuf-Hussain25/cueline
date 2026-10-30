"use client";

import { useEffect, useRef } from "react";

const SEGMENTS = 20;

/** Live input level, animated from a ref so audio updates never re-render React. */
export function LevelMeter({ levelRef, active }: { levelRef: React.RefObject<number>; active: boolean }) {
  const barsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const segments = barsRef.current ? (Array.from(barsRef.current.children) as HTMLElement[]) : [];
    if (!active) {
      segments.forEach((s) => s.classList.remove("on"));
      return;
    }
    let frame = 0;
    let smoothed = 0;
    const tick = () => {
      // Rise fast, fall slowly, like a hardware meter
      const level = levelRef.current ?? 0;
      smoothed = level > smoothed ? level : smoothed * 0.9;
      const lit = Math.round(Math.min(1, smoothed) * SEGMENTS);
      segments.forEach((s, i) => s.classList.toggle("on", i < lit));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, levelRef]);

  return (
    <div className="meter" ref={barsRef} aria-hidden="true">
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <span key={i} />
      ))}
    </div>
  );
}
