"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** Wraps a horizontally scrolling child ([data-slot=table-container] or tabs-list) and fades its right edge while more content is off-screen. */
export function ScrollFade({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const check = useCallback(() => {
    const el = ref.current?.querySelector<HTMLElement>("[data-slot=table-container],[data-slot=tabs-list]");
    if (el) setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);
  useEffect(() => {
    check();
    window.addEventListener("resize", check);
    const t = setTimeout(check, 300);
    return () => {
      window.removeEventListener("resize", check);
      clearTimeout(t);
    };
  }, [check]);
  return (
    <div ref={ref} onScrollCapture={check} className={`${className} ${more ? "[mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)]" : ""}`}>
      {children}
    </div>
  );
}
