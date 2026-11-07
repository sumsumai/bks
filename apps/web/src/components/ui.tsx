import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Icon, type IconName } from "./icons";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger" | "ai";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:opacity-90 shadow-card",
  secondary: "bg-surface text-fg border border-border hover:bg-subtle shadow-card",
  ghost: "text-muted hover:text-fg hover:bg-subtle",
  danger: "bg-surface text-bad border border-border hover:bg-bad/5",
  ai: "bg-ai text-white hover:opacity-90 shadow-card",
};
const sizes = { sm: "h-8 px-3 text-[13px] gap-1.5", md: "h-10 px-4 text-sm gap-2", lg: "h-12 px-5 text-[15px] gap-2" };

export function buttonClass(variant: Variant = "primary", size: keyof typeof sizes = "md", extra?: string) {
  return cx("inline-flex items-center justify-center rounded-[10px] font-medium transition disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap", variants[variant], sizes[size], extra);
}

export function Button({ variant = "primary", size = "md", icon, className, children, ...rest }: ComponentProps<"button"> & { variant?: Variant; size?: keyof typeof sizes; icon?: IconName }) {
  return (
    <button className={buttonClass(variant, size, className)} {...rest}>
      {icon && <Icon name={icon} size={size === "sm" ? 15 : 17} />}
      {children}
    </button>
  );
}

export function LinkButton({ variant = "primary", size = "md", icon, className, children, ...rest }: ComponentProps<typeof Link> & { variant?: Variant; size?: keyof typeof sizes; icon?: IconName }) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon && <Icon name={icon} size={size === "sm" ? 15 : 17} />}
      {children}
    </Link>
  );
}

export function Card({ className, children, ...rest }: ComponentProps<"div">) {
  return (
    <div className={cx("rounded-card border border-border bg-surface shadow-card", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
      <div>
        <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <div className="mb-1 text-[12px] font-medium uppercase tracking-wider text-faint">{eyebrow}</div>}
        <h1 className="text-[26px] font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const tones = {
  neutral: "bg-subtle text-muted border-border",
  ok: "bg-ok/10 text-ok border-ok/20",
  warn: "bg-warn/10 text-warn border-warn/20",
  bad: "bg-bad/10 text-bad border-bad/20",
  ai: "bg-ai/10 text-ai border-ai/20",
  solid: "bg-accent text-accent-fg border-transparent",
};
export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", children, className, icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: IconName }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-medium leading-5", tones[tone], className)}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

export const BOOKING_TONE: Record<string, Tone> = { pending: "warn", confirmed: "ok", completed: "neutral", cancelled: "bad", no_show: "bad" };
export const BOOKING_LABEL: Record<string, string> = { pending: "Pending", confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled", no_show: "No-show" };

export function Label({ children, htmlFor, hint }: { children: ReactNode; htmlFor?: string; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between text-[13px] font-medium">
      <span>{children}</span>
      {hint && <span className="font-normal text-faint">{hint}</span>}
    </label>
  );
}

const field = "w-full rounded-[10px] border border-border bg-surface px-3 text-[14px] text-fg placeholder:text-faint outline-none transition focus:border-fg/40 focus:ring-4 focus:ring-fg/5";

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cx(field, "h-10", className)} {...rest} />;
}
export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea className={cx(field, "min-h-24 py-2.5 leading-relaxed", className)} {...rest} />;
}
export function Select({ className, children, ...rest }: ComponentProps<"select">) {
  return (
    <select className={cx(field, "h-10 appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239a9aa3' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...rest}>
      {children}
    </select>
  );
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label hint={hint}>{label}</Label>
      {children}
    </div>
  );
}

export function Stat({ label, value, sub, icon, tone }: { label: string; value: ReactNode; sub?: ReactNode; icon?: IconName; tone?: "ai" }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between text-[13px] text-muted">
        <span>{label}</span>
        {icon && <Icon name={icon} size={16} className={tone === "ai" ? "text-ai" : "text-faint"} />}
      </div>
      <div className="mt-2 text-[28px] font-semibold tracking-tight tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-[13px] text-muted">{sub}</div>}
    </Card>
  );
}

export function Empty({ icon = "sparkles", title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 grid size-11 place-items-center rounded-full bg-subtle text-muted">
        <Icon name={icon} size={20} />
      </div>
      <div className="font-medium">{title}</div>
      {children && <p className="mt-1 max-w-sm text-[14px] text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Avatar({ name, color, size = 32 }: { name: string; color?: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  return (
    <span className="inline-grid shrink-0 place-items-center rounded-full font-semibold text-white" style={{ width: size, height: size, fontSize: size * 0.38, background: color ?? "#71717a" }}>
      {initials || "?"}
    </span>
  );
}

export function ChannelIcon({ channel, size = 14 }: { channel: string; size?: number }) {
  const map: Record<string, { icon: IconName; color: string }> = { whatsapp: { icon: "whatsapp", color: "#16a34a" }, telegram: { icon: "telegram", color: "#0284c7" }, web: { icon: "globe", color: "var(--muted)" } };
  const m = map[channel] ?? map.web;
  return <Icon name={m.icon} size={size} style={{ color: m.color }} />;
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="grid size-7 place-items-center rounded-lg bg-accent text-accent-fg">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h9a3 3 0 0 1 0 6H4zM4 13h11a3 3 0 0 1 0 6H4zM4 4v18" /></svg>
      </span>
      <span className="text-[17px]">BKS</span>
    </span>
  );
}
