import { Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold, Outfit_800ExtraBold, useFonts } from "@expo-google-fonts/outfit";
import { AppKit, AppKitProvider } from "@reown/appkit-react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { LogBox, View } from "react-native";
import { WagmiProvider } from "wagmi";
import { ActivityProvider } from "../components/Activity";
import { ToastProvider } from "../components/Toast";
import { createQueryClient } from "../lib/queryClient";
import { colors } from "../theme";
import { PushHandler } from "../push/PushHandler";
import { ChatKeyProvider } from "../chat/ChatKeyProvider";
import { SessionProvider, useSession } from "../session/SessionProvider";
import { appKit, wagmiAdapter } from "../wallet/appkit";
import { setReturnPath } from "../wallet/sign";

SplashScreen.preventAutoHideAsync();

// Un corte de red momentáneo al bajar las fuentes del mapa no es un error de la app: en desarrollo no abre el cartel rojo.
LogBox.ignoreLogs(["Failed to load glyph range", "emitting session_request", "Can't create image with invalid metrics"]);

function Shell() {
  const { status } = useSession();
  const [fontsLoaded] = useFonts({ Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold, Outfit_800ExtraBold });
  const ready = fontsLoaded && status !== "loading";

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  const pathname = usePathname();
  useEffect(() => setReturnPath(pathname), [pathname]);

  if (!ready) return null;
  return (
    <ToastProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
    </ToastProvider>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(() => createQueryClient());
  return (
    <AppKitProvider instance={appKit}>
      <WagmiProvider config={wagmiAdapter.wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <ActivityProvider>
          <SessionProvider>
            <ChatKeyProvider>
              <Shell />
              <PushHandler />
            </ChatKeyProvider>
            <View style={{ position: "absolute", height: "100%", width: "100%" }} pointerEvents="box-none">
              <AppKit />
            </View>
          </SessionProvider>
          </ActivityProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </AppKitProvider>
  );
}
