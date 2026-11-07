"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import type { ActionState } from "@/actions/workspace";
import { cx } from "../ui";

/** A form bound to a server action returning ActionState; shows the result inline. */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  onSuccess,
}: {
  action: (prev: ActionState, f: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: () => void;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.();
    }
  }, [state, resetOnSuccess, onSuccess]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state && (state.error || state.message) && (
        <p className={cx("mt-3 rounded-lg px-3 py-2 text-[13px]", state.error ? "bg-bad/10 text-bad" : "bg-ok/10 text-ok")}>{state.error ?? state.message}</p>
      )}
    </form>
  );
}
