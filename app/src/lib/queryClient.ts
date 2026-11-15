import NetInfo from "@react-native-community/netinfo";
import { focusManager, onlineManager, QueryClient } from "@tanstack/react-query";
import { AppState } from "react-native";

// React Native no avisa solo cuándo la app pasa a segundo plano ni cuándo se corta la red. Se lo contamos a react-query para
// que deje de consultar mientras nadie mira y se ponga al día al volver.
let wired = false;
export function wireQueryManagers(): void {
  if (wired) return;
  wired = true;
  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener("change", (state) => handleFocus(state === "active"));
    return () => subscription.remove();
  });
  onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)));
}

// Un dato pedido hace menos de 15 segundos no se vuelve a pedir al abrir otra pantalla que lo usa.
export const STALE_MS = 15_000;

export function createQueryClient(): QueryClient {
  wireQueryManagers();
  return new QueryClient({ defaultOptions: { queries: { staleTime: STALE_MS } } });
}
