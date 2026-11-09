import { router } from "expo-router";
import { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { AgreementRecord, Changa, MyApplication } from "../../api/types";
import { ChangaCard } from "../../components/ChangaCard";
import { PullRefreshControl } from "../../components/PullRefreshControl";
import { SearchField } from "../../components/SearchField";
import { Button, Chip, Row, Secondary, Title } from "../../components/ui";
import { useMyAgreements, useMyApplications, useMyChangas, useMyContributions } from "../../data/useMine";
import { t } from "../../i18n";
import { matchesQuery } from "../../lib/search";
import { useManualRefresh } from "../../lib/useManualRefresh";
import { statusLabel } from "../../lib/status";
import { useSession } from "../../session/SessionProvider";
import { colors, radius, spacing, text } from "../../theme";

type Tab = "published" | "applied" | "contributions";

export default function MyChangas() {
  const { address } = useSession();
  const [tab, setTab] = useState<Tab>("published");
  const [queries, setQueries] = useState<Record<Tab, string>>({ published: "", applied: "", contributions: "" });
  const query = queries[tab];
  const published = useMyChangas();
  const applied = useMyApplications();
  const agreements = useMyAgreements();
  const contributions = useMyContributions();

  const refresh = useManualRefresh([() => published.refetch(), () => applied.refetch(), () => agreements.refetch(), () => contributions.refetch()]);

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
        <SearchField value={query} onChange={(value) => setQueries((current) => ({ ...current, [tab]: value }))} placeholder={t.mine.search} />
        {toConfirm.map((item) => (
          <AgreementBanner key={item.orderId} agreement={item} />
        ))}
      </View>
      {tab === "published" ? (
        <FlatList
          contentContainerStyle={styles.list}
          refreshControl={<PullRefreshControl refresh={refresh} />}
          data={(published.data ?? []).filter((item) => matchesQuery(query, [item.spec.title, item.spec.description, t.publish.categories[item.spec.category], statusLabel(item.status)]))}
          keyExtractor={(item) => String(item.id)}
          ListEmptyComponent={<Secondary>{t.mine.emptyPublished}</Secondary>}
          renderItem={({ item }) => <PublishedItem changa={item} waiting={item.orderId !== null && waiting.has(item.orderId)} />}
        />
      ) : tab === "contributions" ? (
        <FlatList
          contentContainerStyle={styles.list}
          refreshControl={<PullRefreshControl refresh={refresh} />}
          data={(contributions.data ?? []).filter((item) => matchesQuery(query, [item.title, statusLabel(item.status ?? "")]))}
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
          refreshControl={<PullRefreshControl refresh={refresh} />}
          data={(applied.data ?? []).filter((item) => matchesQuery(query, [item.changa.title, item.message, statusLabel(item.status)]))}
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
  const hasOrder = changa.orderId !== null && ["agreed", "delivered", "settled", "disputed"].includes(changa.status);
  const action =
    changa.status === "open"
      ? { label: t.mine.viewApplications, onPress: () => router.push({ pathname: "/applications/[changaId]", params: { changaId: String(changa.id) } }) }
      : hasOrder
        ? { label: t.mine.openOrder, onPress: () => router.push({ pathname: "/order/[orderId]", params: { orderId: String(changa.orderId), title: changa.spec.title } }) }
        : undefined;
  return (
    <View style={styles.item}>
      <ChangaCard changa={changa} status={changa.status} action={action} onPress={changa.status === "draft" ? () => undefined : open} />
      {waiting ? <Secondary>{t.mine.waitingAgreement}</Secondary> : null}
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
