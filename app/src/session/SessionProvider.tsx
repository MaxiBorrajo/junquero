import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { API_URL } from "../config";
import { createApi, type Api } from "../api/client";
import type { MeResponse, MyProfile } from "../api/types";
import { clearSession, loadSession, saveSession, type StoredSession } from "./tokenStore";
import { isExpired, loginWithWallet, type SignMessage } from "./login";

type Status = "loading" | "anonymous" | "ready";

interface SessionValue {
  status: Status;
  address: string | null;
  profile: MyProfile | null;
  api: Api;
  signIn: (address: string, sign: SignMessage) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [session, setSession] = useState<StoredSession | null>(null);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = session?.token ?? null;

  const signOut = useCallback(async () => {
    await clearSession();
    setSession(null);
    setProfile(null);
    setStatus("anonymous");
  }, []);

  const api = useMemo(() => createApi({ baseUrl: API_URL, getToken: () => tokenRef.current, onUnauthorized: () => void signOut() }), [signOut]);

  const refresh = useCallback(async () => {
    const me = await api.get<MeResponse>("/me");
    setProfile(me.profile);
  }, [api]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const stored = await loadSession();
      if (!alive) return;
      if (!stored || isExpired(stored.expiresAt, Math.floor(Date.now() / 1000))) {
        if (stored) await clearSession();
        setStatus("anonymous");
        return;
      }
      tokenRef.current = stored.token;
      setSession(stored);
      try {
        const me = await api.get<MeResponse>("/me");
        if (alive) setProfile(me.profile);
      } catch {}
      if (alive) setStatus("ready");
    })();
    return () => {
      alive = false;
    };
  }, [api]);

  const signIn = useCallback(
    async (address: string, sign: SignMessage) => {
      const result = await loginWithWallet(api, address, sign, Math.floor(Date.now() / 1000));
      const stored = { token: result.token, expiresAt: result.expiresAt, address: result.address };
      await saveSession(stored);
      tokenRef.current = stored.token;
      setSession(stored);
      const me = await api.get<MeResponse>("/me");
      setProfile(me.profile);
      setStatus("ready");
    },
    [api],
  );

  const value = useMemo<SessionValue>(
    () => ({ status, address: session?.address ?? null, profile, api, signIn, signOut, refresh }),
    [status, session, profile, api, signIn, signOut, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("SessionProvider ausente");
  return value;
}
