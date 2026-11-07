"use client";

import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useState, useTransition } from "react";
import { startWhatsAppLinkAction, whatsAppLinkState } from "@/actions/workspace";
import { Icon } from "../icons";
import { Button, cx, Input } from "../ui";

type LinkState = Awaited<ReturnType<typeof whatsAppLinkState>>;

/**
 * Link the business's WhatsApp Business app as a device. QR on a computer; on the phone itself (where you
 * can't scan your own screen) the owner enters their number and types the 8-character code in WhatsApp.
 */
export function WhatsAppLink({ initial }: { initial: LinkState }) {
  const router = useRouter();
  const [state, setState] = useState<LinkState>(initial);
  const [method, setMethod] = useState<"qr" | "code">("qr");
  const [phone, setPhone] = useState("");
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const linking = state?.status === "pairing";

  // Poll while linking; the gateway refreshes the QR roughly every 20 seconds.
  useEffect(() => {
    if (!linking) return;
    const t = setInterval(async () => {
      const s = await whatsAppLinkState();
      setState(s);
      if (s?.status === "connected") router.refresh();
    }, 2000);
    return () => clearInterval(t);
  }, [linking, router]);

  useEffect(() => {
    const qr = state?.pairing?.qr;
    if (!qr) return setSvg(null);
    QRCode.toString(qr, { type: "svg", margin: 1, errorCorrectionLevel: "L" }).then(setSvg).catch(() => setSvg(null));
  }, [state?.pairing?.qr]);

  const begin = () =>
    start(async () => {
      setError(null);
      const r = await startWhatsAppLinkAction(method === "code" ? phone : undefined);
      if (r?.error) return setError(r.error);
      setState(await whatsAppLinkState());
    });

  if (linking) {
    const code = state?.pairing?.code;
    return (
      <div className="rounded-xl border border-border bg-subtle/50 p-5">
        {code ? (
          <div className="text-center">
            <div className="text-[13px] text-muted">Enter this code on +{state?.pairing?.phone}</div>
            <div className="mt-2 font-mono text-[32px] font-semibold tracking-[0.25em]">{code.slice(0, 4)}-{code.slice(4)}</div>
          </div>
        ) : svg ? (
          <div className="mx-auto w-56 rounded-xl bg-white p-3" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <div className="mx-auto grid size-56 place-items-center rounded-xl bg-surface text-[13px] text-muted">Preparing…</div>
        )}
        <ol className="mt-5 space-y-1.5 text-[13px] text-muted">
          <li>1. Open <span className="font-medium text-fg">WhatsApp Business</span> on your phone</li>
          <li>2. Go to <span className="font-medium text-fg">Settings → Linked devices → Link a device</span></li>
          <li>3. {code ? <>Tap <span className="font-medium text-fg">Link with phone number instead</span> and enter the code</> : "Point your phone at this QR code"}</li>
        </ol>
        <div className="mt-4 flex items-center gap-2 text-[12px] text-faint">
          <span className="size-1.5 animate-pulse-dot rounded-full bg-ai" /> Waiting for your phone…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex rounded-[10px] border border-border bg-surface p-0.5 text-[13px]">
        {(["qr", "code"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMethod(m)} className={cx("flex-1 rounded-lg px-3 py-1.5", method === m ? "bg-subtle font-medium" : "text-muted")}>
            {m === "qr" ? "Scan a QR code" : "Use a code (on your phone)"}
          </button>
        ))}
      </div>
      {method === "code" && <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="Your WhatsApp Business number, e.g. +33 6 12 34 56 78" />}
      <Button type="button" onClick={begin} disabled={pending || (method === "code" && phone.replace(/\D/g, "").length < 8)} icon="whatsapp">
        {pending ? "Starting…" : "Link WhatsApp Business"}
      </Button>
      {(error || state?.lastError) && <p className="rounded-lg bg-bad/10 px-3 py-2 text-[13px] text-bad">{error ?? state?.lastError}</p>}
      <p className="flex gap-1.5 text-[12px] text-faint"><Icon name="shield" size={13} className="mt-0.5 shrink-0" /> Linked like WhatsApp Web: your phone stays the main device and you can unlink anytime from WhatsApp.</p>
    </div>
  );
}
