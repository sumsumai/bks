"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Button, cx } from "./ui";
import type { IconName } from "./icons";

export function SubmitButton({ children, variant, size, icon, className, pendingText }: { children: ReactNode; variant?: "primary" | "secondary" | "ghost" | "danger" | "ai"; size?: "sm" | "md" | "lg"; icon?: IconName; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} variant={variant} size={size} icon={pending ? undefined : icon} className={className}>
      {pending && <span className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}

/** Submit button that asks for confirmation first. */
export function ConfirmSubmit({ children, message, variant = "danger", size = "sm", icon }: { children: ReactNode; message: string; variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md"; icon?: IconName }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      icon={icon}
      disabled={pending}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}

export function Toggle({ name, defaultChecked, label, description }: { name: string; defaultChecked?: boolean; label: ReactNode; description?: ReactNode }) {
  const [on, setOn] = useState(Boolean(defaultChecked));
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-[14px] font-medium">{label}</span>
        {description && <span className="block text-[13px] text-muted">{description}</span>}
      </span>
      <input type="hidden" name={name} value={on ? "on" : "off"} />
      <button type="button" role="switch" aria-checked={on} onClick={() => setOn(!on)} className={cx("relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition", on ? "bg-accent" : "bg-border")}>
        <span className={cx("absolute top-0.5 size-5 rounded-full bg-surface shadow transition-all", on ? "left-[18px]" : "left-0.5")} />
      </button>
    </label>
  );
}

/** Live notification toast + refresh, fed by the SSE endpoint. */
export function LiveEvents() {
  const [toast, setToast] = useState<{ title: string; body: string; href?: string } | null>(null);
  const router = useRouter();
  useEffect(() => {
    const es = new EventSource("/api/v1/events");
    es.addEventListener("notification", (e) => {
      const n = JSON.parse((e as MessageEvent).data);
      setToast({ title: n.title, body: n.body, href: n.href ?? undefined });
      router.refresh();
      setTimeout(() => setToast(null), 6000);
    });
    return () => es.close();
  }, [router]);
  if (!toast) return null;
  return (
    <a href={toast.href ?? "#"} className="animate-fade-up fixed right-4 bottom-4 z-50 w-80 rounded-card border border-border bg-surface p-4 shadow-pop">
      <div className="flex items-center gap-2 text-[13px] font-semibold">
        <span className="size-2 rounded-full bg-ai" /> {toast.title}
      </div>
      {toast.body && <div className="mt-1 line-clamp-2 text-[13px] text-muted">{toast.body}</div>}
    </a>
  );
}
