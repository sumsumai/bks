import Link from "next/link";
import { saveAgent, savePermissions, toggleAgent } from "@/actions/workspace";
import { SubmitButton, Toggle } from "@/components/client";
import { Icon } from "@/components/icons";
import { Badge, Button, Card, CardHeader, ChannelIcon, Field, Input, PageHeader, Select, Stat, Textarea } from "@/components/ui";
import { ActionForm } from "@/components/workspace/action-form";
import { Playground } from "@/components/workspace/playground";
import { getAgent, isLiveMode } from "@/lib/agent/runtime";
import { getSetting } from "@/lib/settings";
import { modeFor, TOOLS } from "@/lib/agent/tools";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { businessMetrics } from "@/lib/metrics";
import { currentTenant, requirePermission } from "@/lib/tenant";

export const metadata = { title: "Agent" };

export default async function AgentPage() {
  const t = await currentTenant();
  requirePermission(t, "agent.manage");
  const [agent, m, channels] = await Promise.all([getAgent(t.business.id), businessMetrics(t.business.id, 30), db.select().from(schema.channels).where(eq(schema.channels.businessId, t.business.id))]);
  if (!agent) return <p>Agent not provisioned. Contact support.</p>;
  const p = agent.persona;
  const live = await isLiveMode();
  const defaultModel = await getSetting("ai.model");

  return (
    <>
      <PageHeader
        eyebrow="NanoClaw agent"
        title={agent.name}
        description="Your dedicated AI assistant. It answers customers on every channel from your services, policies and knowledge, books real slots, and hands over to you when it should."
        actions={
          <form action={toggleAgent}>
            <input type="hidden" name="status" value={agent.status === "active" ? "paused" : "active"} />
            {agent.status === "active" ? <Button variant="secondary" icon="pause">Pause agent</Button> : <Button variant="ai" icon="play">Resume agent</Button>}
          </form>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2 text-[13px]">
        <Badge tone={agent.status === "active" ? "ok" : "warn"}>{agent.status === "active" ? "Online" : "Paused"}</Badge>
        <Badge icon="lock">Isolated runtime</Badge>
        <Badge>{live ? agent.model || defaultModel : "offline mode (no model key)"}</Badge>
        {channels.filter((c) => c.status === "connected").map((c) => (
          <Badge key={c.id}><ChannelIcon channel={c.kind} size={12} /> {c.kind === "web" ? "Web chat" : c.displayName}</Badge>
        ))}
        <Link href="/app/channels" className="text-muted underline-offset-2 hover:text-fg hover:underline">Manage channels</Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Conversations · 30d" value={m.conversations} sub={`${m.agentTurns} replies`} icon="chat" tone="ai" />
        <Stat label="Resolved without you" value={m.resolutionRate === null ? "—" : `${Math.round(m.resolutionRate * 100)}%`} sub={`${m.escalated} escalated`} icon="checkCircle" tone="ai" />
        <Stat label="Bookings by agent" value={m.agentBookings} sub={`${m.actionsExecuted} actions · ${m.actionsFailed} failed`} icon="calendar" tone="ai" />
        <Stat label="Avg. response" value={`${(m.avgLatencyMs / 1000).toFixed(1)}s`} sub={`${(m.tokens / 1000).toFixed(0)}k tokens`} icon="bolt" tone="ai" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader title="Personality & instructions" description="How your agent sounds and what it should always or never do." />
            <ActionForm action={saveAgent} className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Agent name"><Input name="name" defaultValue={agent.name} required /></Field>
                <Field label="Tone">
                  <Select name="tone" defaultValue={p.tone}>
                    <option value="warm">Warm & friendly</option><option value="professional">Professional</option><option value="playful">Playful</option><option value="luxury">Luxury concierge</option><option value="concise">Concise</option>
                  </Select>
                </Field>
                <Field label="Formality">
                  <Select name="formality" defaultValue={p.formality}><option value="casual">Casual</option><option value="neutral">Neutral</option><option value="formal">Formal</option></Select>
                </Field>
                <Field label="Default language" hint="mirrors the customer">
                  <Select name="language" defaultValue={p.language}><option value="en">English</option><option value="fr">Français</option><option value="es">Español</option><option value="de">Deutsch</option><option value="it">Italiano</option><option value="pt">Português</option><option value="ar">العربية</option></Select>
                </Field>
              </div>
              <Field label="Greeting"><Input name="greeting" defaultValue={p.greeting} placeholder="Hi! Welcome to …" /></Field>
              <Field label="Sign-off" hint="used on confirmations"><Input name="signature" defaultValue={p.signature} placeholder="— The team" /></Field>
              <Toggle name="emoji" defaultChecked={p.emoji} label="Use emoji" description="A few, tastefully." />
              <Field label="Instructions" hint="plain language">
                <Textarea name="instructions" rows={6} defaultValue={agent.instructions} placeholder={"e.g. Always suggest a patch test for first-time colour clients.\nNever offer discounts.\nIf someone asks for Maya on Saturday, offer Sami."} />
              </Field>
              <Field label="Always escalate when a customer mentions" hint="comma-separated">
                <Input name="escalationKeywords" defaultValue={agent.escalationKeywords} />
              </Field>
              <SubmitButton>Save</SubmitButton>
            </ActionForm>
          </Card>

          <Card>
            <CardHeader title="Permissions" description="What your agent may do on its own, what needs your approval, and what it can't do at all." />
            <ActionForm action={savePermissions} className="p-5">
              <ul className="divide-y divide-border">
                {TOOLS.map((tool) => (
                  <li key={tool.name} className="flex items-center justify-between gap-4 py-2.5">
                    <div>
                      <div className="text-[14px] font-medium">{tool.label}</div>
                      <div className="text-[12px] text-faint">{tool.name}</div>
                    </div>
                    {tool.locked ? (
                      <Badge icon="lock">Always on</Badge>
                    ) : (
                      <Select name={`perm:${tool.name}`} defaultValue={modeFor(agent, tool.name)} className="h-9 w-48">
                        <option value="auto">Do it automatically</option>
                        <option value="approve">Ask me first</option>
                        <option value="off">Not allowed</option>
                      </Select>
                    )}
                  </li>
                ))}
              </ul>
              <SubmitButton className="mt-4">Save permissions</SubmitButton>
            </ActionForm>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card className="overflow-hidden lg:sticky lg:top-6">
            <Playground agentName={agent.name} live={live} />
          </Card>
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <Icon name="book" className="mt-0.5 text-ai" />
              <div>
                <div className="font-medium">Knowledge</div>
                <p className="text-[13px] text-muted">Your agent already knows your services, prices, team, hours and booking policy. Add FAQs and documents for everything else.</p>
                <Link href="/app/agent/knowledge" className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium">Manage knowledge <Icon name="arrowRight" size={14} /></Link>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
