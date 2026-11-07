import { stopImpersonating } from "@/actions/admin-platform";
import { currentUser } from "@/lib/auth";
import { Icon } from "./icons";

/** Shown on every workspace page while platform staff are signed in as someone else. */
export async function ImpersonationBanner() {
  const u = await currentUser();
  if (!u?.impersonatorId) return null;
  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-warn px-4 py-2 text-[13px] font-medium text-white">
      <span className="flex items-center gap-1.5"><Icon name="eye" size={15} /> You&apos;re viewing as {u.name} ({u.email}). Actions are recorded under your admin account.</span>
      <form action={stopImpersonating}>
        <button className="rounded-md bg-white/20 px-2.5 py-0.5 hover:bg-white/30">Return to admin</button>
      </form>
    </div>
  );
}
