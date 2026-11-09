import { useAppKit } from "@reown/appkit-react-native";
import { useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { readTokenBalance } from "../../chain/reader";
import { Body, Button, Screen, Secondary, Title } from "../../components/ui";
import { API_URL } from "../../config";
import { t } from "../../i18n";
import { formatUsdc } from "../../lib/money";
import { unregisterPush } from "../../push/register";
import { useSession } from "../../session/SessionProvider";
import { colors, radius, spacing, text } from "../../theme";

const SELFIE_TEXT = { approved: t.me.verified, pending: t.me.pending, rejected: t.me.rejected, none: t.me.notVerified } as const;

export default function Profile() {
  const { profile, address, api, signOut } = useSession();
  const { disconnect } = useAppKit();
  const [copied, setCopied] = useState(false);
  const balance = useQuery({
    queryKey: ["balance", address],
    enabled: Boolean(address),
    refetchInterval: 30_000,
    queryFn: () => readTokenBalance(address as `0x${string}`),
  });

  if (!address) {
    return (
      <Screen footer={<Button label={t.me.signIn} onPress={() => router.push("/welcome")} />}>
        <Title>{t.me.title}</Title>
        <Secondary>{t.me.notSignedIn}</Secondary>
      </Screen>
    );
  }

  const leave = async () => {
    await unregisterPush(api).catch(() => {});
    try {
      await disconnect();
    } catch {}
    await signOut();
    router.replace("/welcome");
  };

  const copy = async () => {
    await Clipboard.setStringAsync(address);
    setCopied(true);
  };

  const selfie = profile?.selfieStatus ?? "none";

  return (
    <Screen footer={<Button label={t.me.logout} variant="ghost" onPress={leave} />}>
      <View style={styles.header}>
        {profile?.photo ? <Image source={{ uri: `${API_URL}${profile.photo.url}` }} style={styles.photo} /> : <View style={[styles.photo, styles.empty]} />}
        <View style={{ flex: 1 }}>
          <Title>{profile?.name ?? t.me.title}</Title>
          <Secondary>{SELFIE_TEXT[selfie]}</Secondary>
        </View>
      </View>
      <View style={styles.box}>
        <Text style={text.label}>{t.me.balance}</Text>
        <Text style={text.amount}>{balance.data !== undefined ? formatUsdc(balance.data.toString()) : "-"}</Text>
        <Secondary>{t.me.faucetNote}</Secondary>
      </View>
      <View style={styles.box}>
        <Text style={text.label}>{t.me.wallet}</Text>
        <Body>{`${address.slice(0, 8)}…${address.slice(-6)}`}</Body>
        <Button label={copied ? t.me.copied : t.me.copyAddress} variant="ghost" onPress={copy} />
      </View>
      {selfie === "rejected" || selfie === "none" ? <Button label={t.me.retakeSelfie} variant="secondary" onPress={() => router.push("/selfie")} /> : null}
      <Button label={t.jury.title} variant="secondary" onPress={() => router.push("/jury")} />
      <Button label={t.me.edit} variant="secondary" onPress={() => router.push("/profile-setup")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  photo: { width: 72, height: 72, borderRadius: radius.pill },
  empty: { backgroundColor: colors.map },
  box: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs, borderWidth: 1, borderColor: colors.line },
});
