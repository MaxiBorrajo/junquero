import Constants from "expo-constants";
import * as Clipboard from "expo-clipboard";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, StyleSheet, Switch, Text, View } from "react-native";
import { Body, Button, ErrorText, Screen, Secondary, Title } from "../components/ui";
import { API_URL } from "../config";
import { t } from "../i18n";
import { pushEnabledByUser, setPushEnabledByUser } from "../push/preference";
import { registerForPush, unregisterPush } from "../push/register";
import { useSession } from "../session/SessionProvider";
import { colors, radius, spacing, text } from "../theme";

type PushState = "on" | "off" | "blocked" | "unavailable";

const projectId = () => (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;

async function readPushState(): Promise<PushState> {
  if (!Device.isDevice || !projectId()) return "unavailable";
  const { granted, canAskAgain } = await Notifications.getPermissionsAsync();
  if (!granted) return canAskAgain ? "off" : "blocked";
  return (await pushEnabledByUser()) ? "on" : "off";
}

export default function Settings() {
  const { address, api } = useSession();
  const [push, setPush] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    readPushState().then(setPush).catch(() => setPush("unavailable"));
  }, []);

  useEffect(() => {
    load();
    const sub = AppState.addEventListener("change", (state) => state === "active" && load());
    return () => sub.remove();
  }, [load]);

  const toggle = async (next: boolean) => {
    setBusy(true);
    setFailed(false);
    try {
      if (next) {
        await setPushEnabledByUser(true);
        const outcome = await registerForPush(api);
        if (outcome === "denied") await setPushEnabledByUser(false);
      } else {
        await unregisterPush(api);
        await setPushEnabledByUser(false);
      }
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      load();
    }
  };

  const copy = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    setCopied(true);
  };

  const pushLabel = push === "on" ? t.settings.notificationsOn : push === "off" ? t.settings.notificationsOff : push === "blocked" ? t.settings.notificationsBlocked : t.settings.notificationsUnavailable;

  return (
    <Screen>
      <Title>{t.settings.title}</Title>

      {address ? (
        <View style={styles.box}>
          <Text style={text.label}>{t.settings.account}</Text>
          <Body>{`${address.slice(0, 8)}…${address.slice(-6)}`}</Body>
          <Button label={copied ? t.me.copied : t.me.copyAddress} variant="ghost" icon="copy" onPress={copy} />
          <Button label={t.me.edit} variant="secondary" icon="edit" onPress={() => router.push("/profile-setup")} />
          <Button label={t.me.retakeSelfie} variant="secondary" icon="camera" onPress={() => router.push("/selfie")} />
        </View>
      ) : null}

      <View style={styles.box}>
        <Text style={text.label}>{t.settings.notifications}</Text>
        <View style={styles.line}>
          <View style={styles.grow}>
            <Body>{pushLabel}</Body>
          </View>
          {push === "on" || push === "off" ? (
            <Switch value={push === "on"} disabled={busy} onValueChange={toggle} trackColor={{ true: colors.brick, false: colors.line }} thumbColor={colors.white} />
          ) : null}
        </View>
        <Secondary>{t.settings.notificationsHint}</Secondary>
        {failed ? <ErrorText>{t.settings.notificationsFailed}</ErrorText> : null}
        {push === "blocked" ? <Button label={t.settings.openPhoneSettings} variant="secondary" onPress={() => void Linking.openSettings()} /> : null}
        <Button label={t.notifications.open} variant="ghost" icon="bell" onPress={() => router.push("/notifications")} />
      </View>

      <View style={styles.box}>
        <Text style={text.label}>{t.settings.about}</Text>
        <Row label={t.settings.version} value={Constants.expoConfig?.version ?? "-"} />
        <Row label={t.settings.network} value={t.settings.networkValue} />
        <Row label={t.settings.server} value={API_URL.replace(/^https?:\/\//, "")} />
        <Secondary>{t.settings.networkNote}</Secondary>
      </View>

      <View style={styles.box}>
        <Text style={text.subtitle}>{t.settings.howItWorks}</Text>
        <Secondary>{t.settings.howItWorksBody}</Secondary>
      </View>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={text.secondary}>{label}</Text>
      <Text style={[text.body, styles.value]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: colors.line },
  line: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  grow: { flex: 1 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  value: { flexShrink: 1, textAlign: "right" },
});
