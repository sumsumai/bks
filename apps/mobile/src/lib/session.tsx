import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { api, configureSession } from "./api";
import { POLL_INTERVAL_MS } from "./config";
import { registerForPush } from "./push";
import type { BusinessSummary, Counts, Me, User } from "./types";

const TOKEN_KEY = "bks.token";
const BUSINESS_KEY = "bks.business";

type SessionState = {
  ready: boolean;
  token: string | null;
  user: User | null;
  businesses: BusinessSummary[];
  business: BusinessSummary | null;
  counts: Counts;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  selectBusiness: (id: string) => Promise<void>;
  refreshMe: () => Promise<void>;
  refreshCounts: () => Promise<void>;
};

const Ctx = createContext<SessionState | null>(null);
const ZERO: Counts = { notifications: 0, approvals: 0, escalations: 0 };

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [counts, setCounts] = useState<Counts>(ZERO);
  const signingOut = useRef(false);

  const clear = useCallback(async () => {
    configureSession({ token: null, businessId: null });
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
    setToken(null);
    setMe(null);
    setBusinessId(null);
    setCounts(ZERO);
  }, []);

  const loadMe = useCallback(async () => {
    const data = await api<Me>("/api/v1/me");
    setMe(data);
    const saved = await SecureStore.getItemAsync(BUSINESS_KEY).catch(() => null);
    const pick = data.businesses.find((b) => b.id === saved) ?? data.businesses[0] ?? null;
    configureSession({ businessId: pick?.id ?? null });
    setBusinessId(pick?.id ?? null);
  }, []);

  // Restore a saved session on launch.
  useEffect(() => {
    configureSession({
      onUnauthorized: () => {
        if (signingOut.current) return;
        signingOut.current = true;
        void clear().finally(() => (signingOut.current = false));
      },
    });
    (async () => {
      const saved = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
      if (saved) {
        configureSession({ token: saved });
        setToken(saved);
        try {
          await loadMe();
        } catch {
          // Offline or expired: an expired token is cleared by onUnauthorized; offline keeps the token.
        }
      }
      setReady(true);
    })();
  }, [clear, loadMe]);

  const refreshCounts = useCallback(async () => {
    if (!token || !businessId) return;
    try {
      const r = await api<{ counts: Counts }>("/api/v1/notifications");
      setCounts(r.counts);
    } catch {}
  }, [token, businessId]);

  // Poll unread counts while the app is in the foreground.
  useEffect(() => {
    if (!token || !businessId) return;
    void refreshCounts();
    let timer: ReturnType<typeof setInterval> | null = setInterval(refreshCounts, POLL_INTERVAL_MS);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refreshCounts();
        if (!timer) timer = setInterval(refreshCounts, POLL_INTERVAL_MS);
      } else if (timer) {
        clearInterval(timer);
        timer = null;
      }
    });
    return () => {
      if (timer) clearInterval(timer);
      sub.remove();
    };
  }, [token, businessId, refreshCounts]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const r = await api<{ token: string; user: User }>("/api/v1/auth/login", { method: "POST", body: { email: email.trim(), password, client: "mobile" } });
      await SecureStore.setItemAsync(TOKEN_KEY, r.token);
      configureSession({ token: r.token });
      setToken(r.token);
      await loadMe();
      void registerForPush();
    },
    [loadMe],
  );

  const signOut = useCallback(async () => {
    signingOut.current = true;
    try {
      await api("/api/v1/auth/logout", { method: "POST" });
    } catch {}
    await clear();
    signingOut.current = false;
  }, [clear]);

  const selectBusiness = useCallback(async (id: string) => {
    await SecureStore.setItemAsync(BUSINESS_KEY, id).catch(() => {});
    configureSession({ businessId: id });
    setBusinessId(id);
    setCounts(ZERO);
  }, []);

  // Re-register push on every launch with a session (tokens can rotate).
  useEffect(() => {
    if (ready && token) void registerForPush();
  }, [ready, token]);

  const value = useMemo<SessionState>(
    () => ({
      ready,
      token,
      user: me?.user ?? null,
      businesses: me?.businesses ?? [],
      business: me?.businesses.find((b) => b.id === businessId) ?? null,
      counts,
      signIn,
      signOut,
      selectBusiness,
      refreshMe: loadMe,
      refreshCounts,
    }),
    [ready, token, me, businessId, counts, signIn, signOut, selectBusiness, loadMe, refreshCounts],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession must be used inside SessionProvider");
  return v;
}

/** The selected business. Screens under the tab navigator only render when one exists. */
export function useBusiness(): BusinessSummary {
  const { business } = useSession();
  if (!business) throw new Error("No business selected");
  return business;
}
