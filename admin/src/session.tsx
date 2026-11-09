import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { createApi, type Api } from "./lib/api";
import { API_URL, SESSION_KEY } from "./lib/config";
import { connect, signLogin, type Eip1193 } from "./lib/login";

interface Stored {
  token: string;
  address: string;
  expiresAt: number;
}

interface SessionValue {
  address: string | null;
  api: Api;
  signIn: () => Promise<void>;
  signOut: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

function load(): Stored | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    return parsed.expiresAt > Math.floor(Date.now() / 1000) ? parsed : null;
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<Stored | null>(load);

  const signOut = useCallback(() => {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {}
    setStored(null);
  }, []);

  const api = useMemo(() => createApi(API_URL, () => stored?.token ?? null, signOut), [stored, signOut]);

  const signIn = useCallback(async () => {
    const provider = (window as unknown as { ethereum?: Eip1193 }).ethereum;
    const address = await connect(provider);
    const issuedAt = Math.floor(Date.now() / 1000);
    const signature = await signLogin(provider!, address, issuedAt);
    const login = createApi(API_URL, () => null, () => {});
    const result = await login.post<{ token: string; expiresAt: number; address: string }>("/auth/login", { address, issuedAt, signature });
    const next = { token: result.token, expiresAt: result.expiresAt, address: result.address };
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
    } catch {}
    setStored(next);
  }, []);

  const value = useMemo(() => ({ address: stored?.address ?? null, api, signIn, signOut }), [stored, api, signIn, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("SessionProvider ausente");
  return value;
}
