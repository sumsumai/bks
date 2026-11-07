import { Icon } from "../icons";
import { Avatar, Badge, Card, LinkButton } from "../ui";

export function Author({ name, business, admin, date }: { name: string; business?: string | null; admin?: boolean; date?: Date }) {
  return (
    <div className="flex items-center gap-2.5">
      <Avatar name={name} color={admin ? "#18181b" : "#6d28d9"} size={30} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 text-[14px]">
          <span className="font-medium">{name}</span>
          {business && <span className="text-muted">· {business}</span>}
          {admin || !business ? <Badge tone="solid" icon="shield">Platform team</Badge> : <Badge tone="ai" icon="checkCircle">Verified VIP</Badge>}
        </div>
        {date && <div className="text-[12px] text-faint">{relative(date)}</div>}
      </div>
    </div>
  );
}

export function relative(d: Date) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Prose with paragraphs; bodies are plain text (no HTML is rendered). */
export function Prose({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-[15px] leading-relaxed">
      {text.split(/\n{2,}/).map((p, i) => (
        <p key={i} className="whitespace-pre-wrap">{p}</p>
      ))}
    </div>
  );
}

export function LockedCommunity() {
  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-0 opacity-50" style={{ background: "radial-gradient(50% 60% at 85% 10%, color-mix(in oklab, var(--ai) 30%, transparent) 0%, transparent 70%)" }} />
      <div className="relative grid gap-8 p-8 md:grid-cols-[1.3fr_1fr] md:p-10">
        <div>
          <Badge tone="ai" icon="crown">VIP only</Badge>
          <h2 className="mt-4 font-display text-[38px] leading-[1.1]">A private room for the best independent businesses.</h2>
          <p className="mt-3 max-w-lg text-muted">
            Verified VIP owners swap what actually works: pricing, no-show tactics, agent instructions, hiring. Moderated by the platform team, with exclusive content and early access to new NanoClaw features.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <LinkButton href="/app/billing" variant="ai" icon="crown">Upgrade to VIP</LinkButton>
            <LinkButton href="/app/billing" variant="secondary">Compare plans</LinkButton>
          </div>
        </div>
        <ul className="space-y-3 self-center text-[14px]">
          {[
            ["users", "Peer discussions with verified owners"],
            ["sparkles", "Agent playbooks and prompt templates"],
            ["bell", "Announcements and early feature access"],
            ["shield", "Private and moderated, never public"],
          ].map(([icon, text]) => (
            <li key={text} className="flex items-center gap-3 rounded-lg border border-border bg-surface/70 px-3 py-2.5">
              <Icon name={icon as "users"} size={17} className="text-ai" /> {text}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
