import { router } from "expo-router";
import { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { AgreementRecord, Changa, MyApplication } from "../../api/types";
import { ChangaCard } from "../../components/ChangaCard";
import { Button, Chip, Row, Secondary, Title } from "../../components/ui";
import { useMyAgreements, useMyApplications, useMyChangas, useMyContributions } from "../../data/useMine";
import { t } from "../../i18n";
import { statusLabel } from "../../lib/status";
import { useSession } from "../../session/SessionProvider";
import { colors, radius, spacing, text } from "../../theme";

type Tab = "published" | "applied" | "contributions";

export default function MyChangas() {
  const { address } = useSession();
  const [tab, setTab] = useState<Tab>("published");
  const published = useMyChangas();
  const applied = useMyApplications();
  const agreements = useMyAgreements();
  const contributions = useMyContributions();

  if (!address) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.pad}>
          <Title>{t.tabs.myChangas}</Title>
          <Secondary>{t.mine.needAccount}</Secondary>
          <Button label={t.mine.enter} onPress={() => router.push("/welcome")} />
        </View>
      </SafeAreaView>
    );
  }

  const toConfirm = (agreements.data ?? []).filter((item) => item.payee === address && item.status === "pending");
  const waiting = new Set((agreements.data ?? []).filter((item) => item.payer === address).map((item) => item.orderId));

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.pad}>
        <Title>{t.tabs.myChangas}</Title>
        <Row>
          <Chip label={t.mine.published} selected={tab === "published"} onPress={() => setTab("published")} />
          <Chip label={t.mine.applied} selected={tab === "applied"} onPress={() => setTab("applied")} />
          <Chip label={t.mine.contributions} selected={tab === "contributions"} onPress={() => setTab("contributions")} />
        </Row>
        {toConfirm.map((item) => (
          <AgreementBanner key={item.orderId} agreement={item} />
        ))}
      </View>
      {tab === "published" ? (
        <FlatList
          contentContainerStyle={styles.list}
          data={published.data ?? []}
          keyExtractor={(item) => String(item.id)}
          ListEmptyComponent={<Secondary>{t.mine.emptyPublished}</Secondary>}
          renderItem={({ item }) => <PublishedItem changa={item} waiting={item.orderId !== null && waiting.has(item.orderId)} />}
        />
      ) : tab === "contributions" ? (
        <FlatList
          contentContainerStyle={styles.list}
          data={contributions.data ?? []}
          keyExtractor={(item) => String(item.orderId)}
          ListEmptyComponent={<Secondary>{t.contributions.empty}</Secondary>}
          renderItem={({ item }) => (
            <View style={styles.item}>
              <Text style={text.subtitle}>{item.title ?? `#${item.orderId}`}</Text>
              <Text style={styles.status}>{statusLabel(item.status ?? "")}</Text>
              <Button label={t.contributions.open} variant="secondary" onPress={() => router.push({ pathname: "/group/[orderId]", params: { orderId: String(item.orderId), title: item.title ?? "" } })} />
              {item.status === "delivered" || item.status === "agreed" ? <Button label={t.mine.openOrder} variant="ghost" onPress={() => router.push({ pathname: "/order/[orderId]", params: { orderId: String(item.orderId), title: item.title ?? "" } })} /> : null}
            </View>
          )}
        />
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={applied.data ?? []}
          keyExtractor={(item) => String(item.id)}
          ListEmptyComponent={<Secondary>{t.mine.emptyApplied}</Secondary>}
          renderItem={({ item }) => <AppliedItem application={item} />}
        />
      )}
    </SafeAreaView>
  );
}

function AgreementBanner({ agreement }: { agreement: AgreementRecord }) {
  return (
    <View style={styles.banner}>
      <Text style={text.body}>{t.mine.pendingAgreement}</Text>
      <Button label={t.mine.confirmAgreement} onPress={() => router.push({ pathname: "/agreement/[orderId]", params: { orderId: String(agreement.orderId) } })} />
    </View>
  );
}

function PublishedItem({ changa, waiting }: { changa: Changa; waiting: boolean }) {
  const open = () => router.push({ pathname: "/changa/[specHash]", params: { specHash: changa.specHash } });
  return (
    <View style={styles.item}>
      <ChangaCard changa={changa} onPress={changa.status === "draft" ? () => undefined : open} />
      <Text style={styles.status}>{statusLabel(changa.status)}</Text>
      {waiting ? <Secondary>{t.mine.waitingAgreement}</Secondary> : null}
      {changa.orderId !== null && ["agreed", "delivered", "settled", "disputed"].includes(changa.status) ? (
        <Button label={t.mine.openOrder} variant="secondary" onPress={() => router.push({ pathname: "/order/[orderId]", params: { orderId: String(changa.orderId), title: changa.spec.title } })} />
      ) : null}
      {changa.status === "open" ? <Button label={t.mine.viewApplications} variant="secondary" onPress={() => router.push({ pathname: "/applications/[changaId]", params: { changaId: String(changa.id) } })} /> : null}
    </View>
  );
}

function AppliedItem({ application }: { application: MyApplication }) {
  return (
    <View style={styles.item}>
      <Text style={text.subtitle}>{statusLabel(application.status)}</Text>
      <Secondary>{application.message || " "}</Secondary>
      {application.status === "chosen" && application.changa.orderId !== null ? (
        <Button label={t.mine.openOrder} variant="secondary" onPress={() => router.push({ pathname: "/order/[orderId]", params: { orderId: String(application.changa.orderId) } })} />
      ) : null}
      <Button label={t.mine.viewChanga} variant="ghost" onPress={() => router.push({ pathname: "/changa/[specHash]", params: { specHash: application.changa.specHash } })} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  pad: { padding: spacing.md, gap: spacing.md },
  list: { padding: spacing.md, gap: spacing.md },
  item: { gap: spacing.xs },
  status: { ...text.label, color: colors.brick },
  banner: { backgroundColor: colors.sand, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
});
