import { useAppKit } from "@reown/appkit-react-native";
import { useFocusedInterval } from "../../lib/useFocusedInterval";
import type { PublicProfile } from "../../api/types";
import { Card } from "../../components/Card";
import { HistoryCard } from "../../components/HistoryCard";
import { ReceiptsCard } from "../../components/ReceiptsCard";
import { useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { readTokenBalance } from "../../chain/reader";
import { DetailActions } from "../../components/DetailActions";
import { Icon } from "../../components/Icon";
import { Logo } from "../../components/Logo";
import { Body, Button, Screen, Secondary, Title } from "../../components/ui";
import { API_URL } from "../../config";
import { t } from "../../i18n";
import { useToast } from "../../components/Toast";
import { formatUsdc } from "../../lib/money";
import { useActivity } from "../../data/useActivity";
import { useSummary } from "../../data/useSummary";
import { useManualRefresh } from "../../lib/useManualRefresh";
import { unregisterPush } from "../../push/register";
import { useSession } from "../../session/SessionProvider";
import { colors, fonts, radius, spacing, text } from "../../theme";

const SELFIE_BADGE = {
  approved: { text: t.me.verified, icon: "info", color: colors.success },
  pending: { text: t.me.pending, icon: "clock", color: colors.warning },
  rejected: { text: t.me.rejected, icon: "info", color: colors.error },
  none: { text: t.me.notVerified, icon: "info", color: colors.muted },
} as const;

export default function Profile() {
  const { profile, address, api, signOut, refresh: refreshSession } = useSession();
  const { disconnect } = useAppKit();
  const toast = useToast();
  const activity = useActivity();
  const summary = useSummary();
  const unread = summary.data?.unreadNotifications ?? 0;
  const balance = useQuery({
    queryKey: ["balance", address],
    enabled: Boolean(address),
    refetchInterval: useFocusedInterval(60_000),
    queryFn: () => readTokenBalance(address as `0x${string}`),
  });

  const mine = useQuery({ queryKey: ["profile", address], enabled: Boolean(address), queryFn: async () => (await api.get<{ profile: PublicProfile }>(`/profiles/${address}`)).profile });

  const refresh = useManualRefresh([() => refreshSession(), () => balance.refetch(), () => activity.refetch(), () => summary.refetch(), () => mine.refetch()]);

  if (!address) {
    return (
      <Screen footer={<Button label={t.me.signIn} icon="wallet" onPress={() => router.push("/welcome")} />}>
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
    toast({ text: t.me.copied, icon: "copy" });
  };

  const selfie = profile?.selfieStatus ?? "none";

  return (
    <Screen refresh={refresh}>
      <View style={styles.header}>
        {profile?.photo ? <Image source={{ uri: `${API_URL}${profile.photo.url}` }} style={styles.photo} /> : <View style={[styles.photo, styles.empty]} />}
        <View style={{ flex: 1 }}>
          <Title>{profile?.name ?? t.me.title}</Title>
          <View style={[styles.badge, { backgroundColor: `${SELFIE_BADGE[selfie].color}1A` }]}>
            {selfie === "approved" ? (
              <Logo size={20} color={SELFIE_BADGE[selfie].color} />
            ) : selfie === "pending" ? (
              <Image source={require("../../../assets/images/junco-pin.png")} style={styles.junco} tintColor={SELFIE_BADGE[selfie].color} />
            ) : (
              <Icon name={SELFIE_BADGE[selfie].icon} size={16} color={SELFIE_BADGE[selfie].color} />
            )}
            <Text style={[styles.badgeText, { color: SELFIE_BADGE[selfie].color }]}>{SELFIE_BADGE[selfie].text}</Text>
          </View>
        </View>
      </View>
      <Card gap="xs">
        <Text style={text.label}>{t.me.balance}</Text>
        <Text style={text.amount}>{balance.data !== undefined ? formatUsdc(balance.data.toString()) : "-"}</Text>
        <Secondary>{t.me.faucetNote}</Secondary>
        <Button label={t.me.reloadBalance} variant="ghost" icon="refresh" loading={balance.isFetching} onPress={() => void balance.refetch()} />
      </Card>
      <Card gap="xs">
        <Text style={text.label}>{t.activity.title}</Text>
        <View style={styles.grid}>
          <Figure label={t.activity.earned} value={activity.data?.earned} tone="good" />
          <Figure label={t.activity.spent} value={activity.data?.spent} />
          <Figure label={t.activity.toCollect} value={activity.data?.toCollect} />
          <Figure label={t.activity.inEscrow} value={activity.data?.inEscrow} />
        </View>
        {activity.data ? <Secondary>{`${activity.data.settledAsPayee} ${t.activity.closedAsPayee} · ${activity.data.settledAsPayer} ${t.activity.closedAsPayer}`}</Secondary> : null}
        <Secondary>{t.activity.note}</Secondary>
      </Card>
      {mine.data?.stats ? <HistoryCard stats={mine.data.stats} title={t.history.mine} /> : null}
      <ReceiptsCard address={address} count={mine.data?.receiptsCount ?? 0} mine />
      <Card gap="xs">
        <Text style={text.label}>{t.me.wallet}</Text>
        <Body>{`${address.slice(0, 8)}…${address.slice(-6)}`}</Body>
        <Button label={t.me.copyAddress} variant="ghost" icon="copy" onPress={copy} />
      </Card>
      <DetailActions
        actions={[
          ...(selfie === "rejected" || selfie === "none" ? [{ key: "selfie", label: t.me.retakeSelfie, icon: "camera" as const, onPress: () => router.push("/selfie") }] : []),
          { key: "notifications", label: t.notifications.title, icon: "bell", badge: unread > 0 ? unread : undefined, onPress: () => router.push("/notifications") },
          { key: "jury", label: t.jury.title, icon: "scale", onPress: () => router.push("/jury") },
          { key: "edit", label: t.me.edit, icon: "edit", onPress: () => router.push("/profile-setup") },
          { key: "settings", label: t.settings.open, icon: "settings", onPress: () => router.push("/settings") },
          { key: "logout", label: t.me.logout, icon: "logout", danger: true, onPress: () => void leave() },
        ]}
      />
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
  badge: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: spacing.xs, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999 },
  junco: { width: 20, height: 20 },
  badgeText: { fontFamily: fonts.semibold, fontSize: 13 },
  header: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  photo: { width: 72, height: 72, borderRadius: radius.pill },
  empty: { backgroundColor: colors.map },
});
