"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

/** Right-hand sheet with a scrim; closes on Escape or a click outside. */
export function Drawer({
  title,
  subtitle,
  icon,
  onClose,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("textarea, input, button:not([data-close])")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);

  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" ref={ref}>
        <div className="drawer-head">
          <span className="card-title">
            <span className="ico">{icon}</span>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id="drawer-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="btn btn-ghost icon-btn" onClick={onClose} aria-label="Close" data-close>
            <X size={18} />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </div>
    </>
  );
}
