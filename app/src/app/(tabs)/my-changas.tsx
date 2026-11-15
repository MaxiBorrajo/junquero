import { router } from "expo-router";
import { Card } from "../../components/Card";
import { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { AgreementRecord, Changa, MyApplication } from "../../api/types";
import { StatusChip } from "../../components/StatusChip";
import { StatusStrip, type StripData } from "../../components/StatusStrip";
import { Banner } from "../../components/Banner";
import { ChangaCard } from "../../components/ChangaCard";
import { PullSpinner } from "../../components/PullSpinner";
import { SearchField } from "../../components/SearchField";
import { Button, Chip, Row, Secondary, Title } from "../../components/ui";
import { effectiveStatus, useCancelling } from "../../data/cancelling";
import { useMyAgreements, useMyApplications, useMyChangas, useMyContributions } from "../../data/useMine";
import { t } from "../../i18n";
import { formatDate } from "../../lib/format";
import { formatUsdc } from "../../lib/money";
import { matchesQuery } from "../../lib/search";
import { usePullGesture } from "../../lib/usePullGesture";
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
  const pull = usePullGesture(refresh);

  if (!address) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.pad}>
          <Title>{t.tabs.myChangas}</Title>
          <Secondary>{t.mine.needAccount}</Secondary>
          <Button label={t.mine.enter} icon="wallet" onPress={() => router.push("/welcome")} />
        </View>
      </SafeAreaView>
    );
  }

  const toConfirm = (agreements.data ?? []).filter((item) => item.payee === address && item.status === "pending");
  const waiting = new Set((agreements.data ?? []).filter((item) => item.payer === address && (item.status === "pending" || item.status === "sending")).map((item) => item.orderId));

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.pad}>
        <Title>{t.tabs.myChangas}</Title>
        <Row>
          <Chip icon="briefcase" label={t.mine.published} selected={tab === "published"} onPress={() => setTab("published")} />
          <Chip icon="send" label={t.mine.applied} badge={toConfirm.length} selected={tab === "applied"} onPress={() => setTab("applied")} />
          <Chip icon="users" label={t.mine.contributions} selected={tab === "contributions"} onPress={() => setTab("contributions")} />
        </Row>
        <SearchField value={query} onChange={(value) => setQueries((current) => ({ ...current, [tab]: value }))} placeholder={t.mine.search} />
      </View>
      {tab === "published" ? (
        <FlatList
          contentContainerStyle={styles.list}
          {...pull}
          ListHeaderComponent={<PullSpinner active={refresh.refreshing} />}
          data={(published.data ?? []).filter((item) => matchesQuery(query, [item.spec.title, item.spec.description, t.publish.categories[item.spec.category], statusLabel(item.status)]))}
          keyExtractor={(item) => String(item.id)}
          ListEmptyComponent={<Secondary>{t.mine.emptyPublished}</Secondary>}
          renderItem={({ item }) => <PublishedItem changa={item} waiting={item.orderId !== null && waiting.has(item.orderId)} />}
        />
      ) : tab === "contributions" ? (
        <FlatList
          contentContainerStyle={styles.list}
          {...pull}
          ListHeaderComponent={<PullSpinner active={refresh.refreshing} />}
          data={(contributions.data ?? []).filter((item) => matchesQuery(query, [item.title, statusLabel(item.status ?? "")]))}
          keyExtractor={(item) => String(item.orderId)}
          ListEmptyComponent={<Secondary>{t.contributions.empty}</Secondary>}
          renderItem={({ item }) => (
            <View style={styles.item}>
              <View style={styles.titleRow}>
                <Text style={[text.subtitle, { flex: 1 }]}>{item.title ?? `#${item.orderId}`}</Text>
                <StatusChip label={statusLabel(item.status ?? "")} />
              </View>
              <Button label={t.contributions.open} icon="users" variant="outline" onPress={() => router.push({ pathname: "/group/[orderId]", params: { orderId: String(item.orderId), title: item.title ?? "" } })} />
              {item.status === "delivered" || item.status === "agreed" ? <Button label={t.mine.openOrder} icon="briefcase" variant="ghost" onPress={() => router.push({ pathname: "/order/[orderId]", params: { orderId: String(item.orderId), title: item.title ?? "" } })} /> : null}
            </View>
          )}
        />
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          {...pull}
          ListHeaderComponent={<PullSpinner active={refresh.refreshing} />}
          data={(applied.data ?? []).filter((item) => matchesQuery(query, [item.changa.title, item.message, statusLabel(item.status)]))}
          keyExtractor={(item) => String(item.id)}
          ListEmptyComponent={<Secondary>{t.mine.emptyApplied}</Secondary>}
          renderItem={({ item }) => <AppliedItem application={item} proposal={(agreements.data ?? []).find((agreement) => agreement.payee === address && agreement.specHash === item.changa.specHash && (agreement.status === "pending" || agreement.status === "sending"))} />}
        />
      )}
    </SafeAreaView>
  );
}

function PublishedItem({ changa, waiting }: { changa: Changa; waiting: boolean }) {
  const status = effectiveStatus(changa, useCancelling());
  const open = () => router.push({ pathname: "/changa/[specHash]", params: { specHash: changa.specHash } });
  const hasOrder = changa.orderId !== null && ["agreed", "delivered", "settled", "disputed"].includes(changa.status);
  const action =
    status === "open"
      ? { label: t.mine.viewApplications, onPress: () => router.push({ pathname: "/applications/[changaId]", params: { changaId: String(changa.id) } }) }
      : hasOrder
        ? { label: t.mine.openOrder, onPress: () => router.push({ pathname: "/order/[orderId]", params: { orderId: String(changa.orderId), title: changa.spec.title } }) }
        : undefined;
  return (
    <View style={styles.item}>
      <ChangaCard changa={changa} status={status} action={action} onPress={changa.status === "draft" ? () => undefined : open} />
      {waiting ? <Banner icon="clock">{t.mine.waitingAgreement}</Banner> : null}
    </View>
  );
}

function AppliedItem({ application, proposal }: { application: MyApplication; proposal: AgreementRecord | undefined }) {
  const { changa } = application;
  const open = () => router.push({ pathname: "/changa/[specHash]", params: { specHash: changa.specHash } });
  const where = [changa.category !== null ? t.publish.categories[changa.category] : null, changa.modality === "remote" ? t.map.remoteTag : changa.modality === "onsite" ? t.map.onsiteTag : null, changa.when ? formatDate(changa.when) : null].filter(Boolean).join(" · ");
  const states = t.mine.applicationState;
  const toOrder = changa.orderId !== null ? () => router.push({ pathname: "/order/[orderId]", params: { orderId: String(changa.orderId) } }) : undefined;
  let data: StripData;
  if (proposal?.status === "sending") data = { tone: "info", icon: "clock", title: states.confirmingTitle, body: states.confirming };
  else if (proposal) data = { tone: "info", icon: "check", title: states.chosenTitle, body: states.proposal, action: { label: t.mine.confirmAgreement, onPress: () => router.push({ pathname: "/agreement/[orderId]", params: { orderId: String(proposal.orderId) } }) } };
  else if (application.status === "chosen") data = { tone: "success", icon: "check", title: states.chosenTitle, body: states.chosen, action: toOrder ? { label: t.mine.openOrder, onPress: toOrder } : undefined };
  else if (application.status === "active") data = { tone: "neutral", icon: "clock", title: states.waitingTitle, body: states.waiting };
  else data = { tone: "neutral", icon: "close", title: states.closedTitle, body: states[application.status as "closed" | "dismissed" | "withdrawn"] ?? states.closed };
  const state = <StatusStrip data={data} />;
  return (
    <Card gap="sm" onPress={open}>
      <View style={styles.titleRow}>
        <Text style={[text.subtitle, { flex: 1 }]} numberOfLines={2}>{changa.title}</Text>
        {changa.amount ? <Text style={[text.subtitle, { color: colors.brick }]}>{formatUsdc(changa.amount)}</Text> : null}
      </View>
      {where ? <Text style={text.secondary}>{where}</Text> : null}
      {state}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  pad: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: 0, gap: spacing.md },
  list: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.md },
  item: { gap: spacing.xs },
  titleRow: { flexDirection: "row", gap: spacing.sm },
  banner: { backgroundColor: colors.sand, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
});
