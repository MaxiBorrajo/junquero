import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";
import type { ChatKeyPair } from "../crypto/chat";
import { loadChatKey } from "../crypto/keyManager";
import { secureKeyStorage } from "../crypto/secureKeyStorage";
import { useSession } from "../session/SessionProvider";
import { useActivity } from "../components/Activity";
import { t } from "../i18n";
import { signText } from "../wallet/sign";

interface ChatKeyValue {
  ensure: () => Promise<ChatKeyPair>;
}

const ChatKeyContext = createContext<ChatKeyValue | null>(null);

export function ChatKeyProvider({ children }: { children: ReactNode }) {
  const { api, address } = useSession();
  const track = useActivity();
  const cached = useRef<{ address: string; pair: Promise<ChatKeyPair> } | null>(null);

  const ensure = useCallback(() => {
    if (!address) return Promise.reject(new Error("sin sesión"));
    if (cached.current?.address === address) return cached.current.pair;
    const pair = track(t.common.keyActivating, () =>
      loadChatKey({
        api,
        storage: secureKeyStorage,
        address,
        signMessage: signText,
      }),
    );
    cached.current = { address, pair };
    pair.catch(() => {
      if (cached.current?.pair === pair) cached.current = null;
    });
    return pair;
  }, [api, address, track]);

  const value = useMemo(() => ({ ensure }), [ensure]);
  return <ChatKeyContext.Provider value={value}>{children}</ChatKeyContext.Provider>;
}

export function useChatKey(): ChatKeyValue {
  const value = useContext(ChatKeyContext);
  if (!value) throw new Error("ChatKeyProvider ausente");
  return value;
}
