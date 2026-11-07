"use client";

import { useRef, useState, useTransition } from "react";
import { playgroundSend } from "@/actions/workspace";
import { Icon } from "../icons";
import { Badge, Button, cx } from "../ui";

type Msg = { id: string; role: string; content: string };
type Act = { id: string; tool: string; status: string; summary: string };

const SUGGESTIONS = ["What do you offer and how much?", "Can I book something tomorrow afternoon?", "Where can I park?", "I want a refund for my last visit"];

export function Playground({ agentName, live }: { agentName: string; live: boolean }) {
  const [session, setSession] = useState(() => Math.random().toString(36).slice(2, 12));
  const [messages, setMessages] = useState<Msg[]>([]);
  const [actions, setActions] = useState<Act[]>([]);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);

  const send = (value: string) => {
    const v = value.trim();
    if (!v || pending) return;
    setText("");
    setMessages((m) => [...m, { id: `tmp${Date.now()}`, role: "customer", content: v }]);
    start(async () => {
      try {
        const r = await playgroundSend(session, v);
        setMessages(r.messages);
        setActions(r.actions);
      } catch {
        setMessages((m) => [...m, { id: `err${Date.now()}`, role: "system", content: "The agent could not answer. Check the server logs." }]);
      }
      requestAnimationFrame(() => scroller.current?.scrollTo({ top: 1e6, behavior: "smooth" }));
    });
  };

  return (
    <div className="flex h-[560px] flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5 text-[13px]">
        <span className="flex items-center gap-2 font-medium"><span className="size-2 rounded-full bg-ok" /> Test as a customer</span>
        <span className="flex items-center gap-2">
          {!live && <Badge tone="warn">Offline mode</Badge>}
          <button className="text-muted hover:text-fg" onClick={() => { setSession(Math.random().toString(36).slice(2, 12)); setMessages([]); setActions([]); }}>Reset</button>
        </span>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto bg-subtle/40 p-4">
        {messages.length === 0 && (
          <div className="pt-6 text-center">
            <div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-ai/10 text-ai"><Icon name="sparkles" /></div>
            <div className="text-[14px] font-medium">Chat with {agentName}</div>
            <p className="mx-auto mt-1 max-w-xs text-[13px] text-muted">Real tools, real availability. Test bookings appear in your calendar and can be cancelled there.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-full border border-border bg-surface px-3 py-1 text-[12px] hover:bg-subtle">{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) =>
          m.role === "system" ? (
            <div key={m.id} className="text-center text-[12px] text-faint">{m.content}</div>
          ) : (
            <div key={m.id} className={cx("flex", m.role === "customer" ? "justify-end" : "justify-start")}>
              <div className={cx("max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[14px]", m.role === "customer" ? "rounded-br-md bg-accent text-accent-fg" : "rounded-bl-md bg-surface shadow-card ring-1 ring-border")}>{m.content}</div>
            </div>
          ),
        )}
        {pending && (
          <div className="flex gap-1 px-1 py-2">
            {[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-pulse-dot rounded-full bg-faint" style={{ animationDelay: `${i * 0.2}s` }} />)}
          </div>
        )}
      </div>
      {actions.length > 0 && (
        <div className="max-h-28 overflow-y-auto border-t border-border px-4 py-2 text-[12px]">
          {actions.map((a) => (
            <div key={a.id} className="flex items-center gap-2 py-0.5 text-muted">
              <Icon name="bolt" size={12} className="text-ai" /> <span className="truncate">{a.summary || a.tool}</span>
              <Badge tone={a.status === "executed" ? "ok" : a.status === "pending_approval" ? "warn" : a.status === "failed" ? "bad" : "neutral"}>{a.status.replace("_", " ")}</Badge>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="flex gap-2 border-t border-border p-3">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message your agent…" className="h-10 flex-1 rounded-[10px] border border-border bg-surface px-3 text-[14px] outline-none focus:border-fg/40" />
        <Button type="submit" disabled={pending || !text.trim()} icon="send" aria-label="Send" />
      </form>
    </div>
  );
}
