"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "../icons";
import { cx } from "../ui";

type Msg = { id: string; role: string; content: string };

function sessionId(slug: string) {
  const key = `bks-chat-${slug}`;
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID().replace(/-/g, "");
    localStorage.setItem(key, id);
    return id;
  } catch {
    return crypto.randomUUID().replace(/-/g, "");
  }
}

/** Booking-page chat with the business's agent. Polls while open so human replies show up too. */
export function ChatWidget({ slug, businessName, agentName, brand }: { slug: string; businessName: string; agentName: string; brand: string }) {
  const [open, setOpen] = useState(false);
  const [sid, setSid] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => setSid(sessionId(slug)), [slug]);
  useEffect(() => {
    if (!open || !sid) return;
    const load = () => fetch(`/api/v1/public/businesses/${slug}/chat?sessionId=${sid}`).then((r) => r.json()).then((j) => j.messages && setMessages(j.messages)).catch(() => {});
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [open, sid, slug]);
  useEffect(() => scroller.current?.scrollTo({ top: 1e6 }), [messages, busy]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const v = text.trim();
    if (!v || !sid || busy) return;
    setText("");
    setBusy(true);
    setMessages((m) => [...m, { id: `tmp${Date.now()}`, role: "customer", content: v }]);
    try {
      const r = await fetch(`/api/v1/public/businesses/${slug}/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: sid, text: v }) });
      const j = await r.json();
      if (j.messages) setMessages(j.messages);
      else setMessages((m) => [...m, { id: `e${Date.now()}`, role: "agent", content: j.detail ?? "Sorry, something went wrong." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {open && (
        <div className="animate-fade-up fixed right-3 bottom-20 z-50 flex h-[min(560px,75dvh)] w-[calc(100vw-1.5rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-pop">
          <div className="flex items-center gap-3 px-4 py-3 text-white" style={{ background: brand }}>
            <div className="grid size-8 place-items-center rounded-full bg-white/20"><Icon name="sparkles" size={16} /></div>
            <div className="flex-1">
              <div className="text-[14px] font-semibold">{agentName}</div>
              <div className="text-[12px] opacity-80">{businessName} · replies instantly</div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close"><Icon name="x" /></button>
          </div>
          <div ref={scroller} className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-subtle/40 p-4">
            {messages.length === 0 && <p className="py-6 text-center text-[13px] text-muted">Ask about services, prices, availability, or book directly here.</p>}
            {messages.map((m) => (
              <div key={m.id} className={cx("flex", m.role === "customer" ? "justify-end" : "justify-start")}>
                <div className={cx("max-w-[82%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[14px]", m.role === "customer" ? "rounded-br-md text-white" : "rounded-bl-md bg-surface shadow-card ring-1 ring-border")} style={m.role === "customer" ? { background: brand } : undefined}>
                  {m.role === "owner" && <div className="mb-0.5 text-[11px] font-medium text-muted">Team</div>}
                  {linkify(m.content)}
                </div>
              </div>
            ))}
            {busy && <div className="flex gap-1 px-1 py-2">{[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-pulse-dot rounded-full bg-faint" style={{ animationDelay: `${i * 0.2}s` }} />)}</div>}
          </div>
          <form onSubmit={send} className="flex gap-2 border-t border-border p-2.5">
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message…" className="h-10 flex-1 rounded-full border border-border bg-surface px-4 text-[14px] outline-none" />
            <button className="grid size-10 place-items-center rounded-full text-white disabled:opacity-50" style={{ background: brand }} disabled={busy || !text.trim()} aria-label="Send"><Icon name="send" size={16} /></button>
          </form>
          <div className="pb-2 text-center text-[10px] text-faint">AI assistant · may make mistakes · a human can take over</div>
        </div>
      )}
      <button onClick={() => setOpen((o) => !o)} className="fixed right-4 bottom-4 z-50 flex h-12 items-center gap-2 rounded-full px-5 font-medium text-white shadow-pop transition hover:scale-[1.02]" style={{ background: brand }}>
        <Icon name={open ? "x" : "chat"} size={18} /> {open ? "Close" : "Ask us anything"}
      </button>
    </>
  );
}

function linkify(text: string) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((p, i) => (/^https?:\/\//.test(p) ? <a key={i} href={p} className="underline" target="_blank" rel="noreferrer">{p.length > 40 ? `${p.slice(0, 40)}…` : p}</a> : p));
}
