import { useAppKit } from "@reown/appkit-react-native";
import { router } from "expo-router";
import { useCallback } from "react";
import { useSession } from "./SessionProvider";

// Corta la billetera y la sesión para poder elegir otra cuenta desde el principio del ingreso.
export function useSwitchAccount() {
  const { disconnect } = useAppKit();
  const { signOut } = useSession();
  return useCallback(
    async (to: "/welcome" | "/connect" = "/welcome") => {
      try {
        await disconnect();
      } catch {}
      await signOut();
      router.replace(to);
    },
    [disconnect, signOut],
  );
}
