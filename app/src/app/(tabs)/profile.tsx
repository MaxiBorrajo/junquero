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
import { useActivity } from "../../data/useActivity";
import { useLastSeen, useNotifications, countUnread } from "../../data/useNotifications";
import { useManualRefresh } from "../../lib/useManualRefresh";
import { unregisterPush } from "../../push/register";
import { useSession } from "../../session/SessionProvider";
import { colors, radius, spacing, text } from "../../theme";

const SELFIE_TEXT = { approved: t.me.verified, pending: t.me.pending, rejected: t.me.rejected, none: t.me.notVerified } as const;

export default function Profile() {
  const { profile, address, api, signOut } = useSession();
  const { disconnect } = useAppKit();
  const [copied, setCopied] = useState(false);
  const activity = useActivity();
  const notifications = useNotifications();
  const lastSeen = useLastSeen();
  const unread = countUnread(notifications.data ?? [], lastSeen.data ?? 0);
  const balance = useQuery({
    queryKey: ["balance", address],
    enabled: Boolean(address),
    refetchInterval: 30_000,
    queryFn: () => readTokenBalance(address as `0x${string}`),
  });

  const refresh = useManualRefresh([() => balance.refetch(), () => activity.refetch(), () => notifications.refetch()]);

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
    <Screen refresh={refresh}>
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
        <Text style={text.label}>{t.activity.title}</Text>
        <View style={styles.grid}>
          <Figure label={t.activity.earned} value={activity.data?.earned} tone="good" />
          <Figure label={t.activity.spent} value={activity.data?.spent} />
          <Figure label={t.activity.toCollect} value={activity.data?.toCollect} />
          <Figure label={t.activity.inEscrow} value={activity.data?.inEscrow} />
        </View>
        {activity.data ? <Secondary>{`${activity.data.settledAsPayee} ${t.activity.closedAsPayee} · ${activity.data.settledAsPayer} ${t.activity.closedAsPayer}`}</Secondary> : null}
        <Secondary>{t.activity.note}</Secondary>
      </View>
      <View style={styles.box}>
        <Text style={text.label}>{t.me.wallet}</Text>
        <Body>{`${address.slice(0, 8)}…${address.slice(-6)}`}</Body>
        <Button label={copied ? t.me.copied : t.me.copyAddress} variant="ghost" onPress={copy} />
      </View>
      {selfie === "rejected" || selfie === "none" ? <Button label={t.me.retakeSelfie} variant="secondary" onPress={() => router.push("/selfie")} /> : null}
      <Button label={unread > 0 ? `${t.notifications.title} (${unread})` : t.notifications.title} variant="secondary" onPress={() => router.push("/notifications")} />
      <Button label={t.jury.title} variant="secondary" onPress={() => router.push("/jury")} />
      <Button label={t.me.edit} variant="secondary" onPress={() => router.push("/profile-setup")} />
      <Button label={t.me.logout} variant="danger" icon="logout" onPress={leave} />
    </Screen>
  );
}

function Figure({ label, value, tone }: { label: string; value?: string; tone?: "good" }) {
  return (
    <View style={styles.figure}>
      <Text style={text.secondary}>{label}</Text>
      <Text style={[text.subtitle, tone === "good" && styles.good]}>{value === undefined ? "-" : formatUsdc(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  figure: { width: "46%", gap: 2 },
  good: { color: colors.success },
  header: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  photo: { width: 72, height: 72, borderRadius: radius.pill },
  empty: { backgroundColor: colors.map },
  box: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs, borderWidth: 1, borderColor: colors.line },
});
