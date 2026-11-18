import { forwardRef } from "react";

/** Native <select> styled like Input: keyboard and screen-reader support for free. */
export const NativeSelect = forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(function NativeSelect({ className = "", ...p }, ref) {
  return (
    <select
      ref={ref}
      className={`h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive ${className}`}
      {...p}
    />
  );
});

export function FieldError({ id, msg }: { id: string; msg?: string }) {
  return msg ? <p id={id} className="text-sm text-destructive">{msg}</p> : null;
}
