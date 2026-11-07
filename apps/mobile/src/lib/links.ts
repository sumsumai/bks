import type { Href } from "expo-router";

/**
 * Notifications carry web workspace links (e.g. /app/inbox/cnv_…, /app/bookings?focus=bkg_…).
 * Map them to the matching app screen. Parsed by hand: React Native's URL is incomplete.
 */
export function appRoute(href: string | null | undefined): Href | null {
  if (!href) return null;
  const [path, search = ""] = href.replace(/^https?:\/\/[^/]+/, "").split("?");
  const conv = /^\/app\/inbox\/([\w-]+)/.exec(path);
  if (conv) return { pathname: "/conversation/[id]", params: { id: conv[1] } };
  if (path.startsWith("/app/bookings")) {
    const focus = /(?:^|&)focus=([\w-]+)/.exec(search)?.[1];
    return focus ? { pathname: "/booking/[id]", params: { id: focus } } : "/bookings";
  }
  if (path.startsWith("/app/approvals")) return "/approvals";
  if (path.startsWith("/app/inbox")) return "/inbox";
  if (path.startsWith("/app/agent")) return "/agent";
  return null;
}
