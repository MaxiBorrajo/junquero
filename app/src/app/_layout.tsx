import { Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold, Outfit_800ExtraBold, useFonts } from "@expo-google-fonts/outfit";
import { AppKit, AppKitProvider } from "@reown/appkit-react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { WagmiProvider } from "wagmi";
import { colors } from "../theme";
import { ChatKeyProvider } from "../chat/ChatKeyProvider";
import { SessionProvider, useSession } from "../session/SessionProvider";
import { appKit, wagmiAdapter } from "../wallet/appkit";

SplashScreen.preventAutoHideAsync();

function Shell() {
  const { status } = useSession();
  const [fontsLoaded] = useFonts({ Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold, Outfit_800ExtraBold });
  const ready = fontsLoaded && status !== "loading";

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
    </>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <AppKitProvider instance={appKit}>
      <WagmiProvider config={wagmiAdapter.wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            <ChatKeyProvider>
              <Shell />
            </ChatKeyProvider>
            <View style={{ position: "absolute", height: "100%", width: "100%" }} pointerEvents="box-none">
              <AppKit />
            </View>
          </SessionProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </AppKitProvider>
  );
}
