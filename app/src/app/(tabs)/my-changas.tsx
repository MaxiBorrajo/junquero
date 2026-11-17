import { router } from "expo-router";
import { Card } from "../../components/Card";
import { useState } from "react";
import { FlatList, SectionList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { AgreementRecord, Changa, MyApplication } from "../../api/types";
import { StatusChip } from "../../components/StatusChip";
import { StatusStrip, type StripData } from "../../components/StatusStrip";
import { ChangaCard } from "../../components/ChangaCard";
import { PullSpinner } from "../../components/PullSpinner";
import { SearchField } from "../../components/SearchField";
import { Button, Chip, Row, Secondary, Title } from "../../components/ui";
import { effectiveStatus, useCancelling } from "../../data/cancelling";
import { useMyCases } from "../../data/useCases";
import { disputesByOrder, matchesDisputeFilter, type DisputeFilter, type DisputeInfo } from "../../lib/disputes";
import { useMyAgreements, useMyApplications, useMyChangas, useMyContributions } from "../../data/useMine";
import { t } from "../../i18n";
import { formatClock, formatDate, sameDay } from "../../lib/format";
import { agendaItems, buildAgenda, closedJobs, type AgendaItem, type ClosedJob } from "../../lib/agenda";
import { Icon } from "../../components/Icon";
import { formatUsdc } from "../../lib/money";
import { matchesQuery } from "../../lib/search";
import { usePullGesture } from "../../lib/usePullGesture";
import { useManualRefresh } from "../../lib/useManualRefresh";
import { statusLabel } from "../../lib/status";
import { applicationView } from "../../lib/applicationState";
import { useSession } from "../../session/SessionProvider";
import { colors, radius, spacing, text } from "../../theme";

type Tab = "agenda" | "published" | "applied" | "closed" | "contributions" | "disputes";

export default function MyChangas() {
  const { address } = useSession();
  const [tab, setTab] = useState<Tab>("agenda");
  const [queries, setQueries] = useState<Record<Tab, string>>({ agenda: "", published: "", applied: "", closed: "", contributions: "", disputes: "" });
  const [disputeFilter, setDisputeFilter] = useState<DisputeFilter>("all");
  const query = queries[tab] ?? "";
  const published = useMyChangas();
  const applied = useMyApplications();
  const agreements = useMyAgreements();
  const contributions = useMyContributions();
  const cases = useMyCases();
  const disputes = disputesByOrder(cases.data?.asParty ?? [], address ?? null);

  const refresh = useManualRefresh([() => published.refetch(), () => applied.refetch(), () => agreements.refetch(), () => contributions.refetch(), () => cases.refetch()]);
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
          <Chip icon="calendar" label={t.mine.agenda} selected={tab === "agenda"} onPress={() => setTab("agenda")} />
          <Chip icon="briefcase" label={t.mine.published} selected={tab === "published"} onPress={() => setTab("published")} />
          <Chip icon="send" label={t.mine.applied} badge={toConfirm.length} selected={tab === "applied"} onPress={() => setTab("applied")} />
          <Chip icon="check" label={t.mine.closed} selected={tab === "closed"} onPress={() => setTab("closed")} />
          <Chip icon="users" label={t.mine.contributions} selected={tab === "contributions"} onPress={() => setTab("contributions")} />
          <Chip icon="scale" label={t.disputesTab.title} badge={[...disputes.values()].filter((item) => item.open).length} selected={tab === "disputes"} onPress={() => setTab("disputes")} />
        </Row>
        <SearchField value={query} onChange={(value) => setQueries((current) => ({ ...current, [tab]: value }))} placeholder={t.mine.search} />
      </View>
      {tab === "agenda" ? (
        <AgendaList items={agendaItems(published.data ?? [], applied.data ?? [])} disputes={disputes} query={query} pull={pull} refreshing={refresh.refreshing} />
      ) : tab === "published" ? (
        <FlatList
          contentContainerStyle={styles.list}
          {...pull}
          ListHeaderComponent={<PullSpinner active={refresh.refreshing} />}
          data={(published.data ?? []).filter((item) => matchesQuery(query, [item.spec.title, item.spec.description, t.publish.categories[item.spec.category], statusLabel(item.status)]))}
          keyExtractor={(item) => String(item.id)}
          ListEmptyComponent={<Secondary>{t.mine.emptyPublished}</Secondary>}
          renderItem={({ item }) => <PublishedItem changa={item} dispute={item.orderId !== null ? disputes.get(item.orderId) : undefined} waiting={item.orderId !== null && waiting.has(item.orderId)} />}
        />
      ) : tab === "closed" ? (
        <FlatList
          contentContainerStyle={styles.list}
          {...pull}
          ListHeaderComponent={<PullSpinner active={refresh.refreshing} />}
          data={closedJobs(published.data ?? [], applied.data ?? []).filter((job) => matchesQuery(query, [job.title, job.closedAt ? formatDate(job.closedAt) : null, job.role === "payee" ? t.history.asPayee : t.history.asPayer]))}
          keyExtractor={(job) => String(job.orderId)}
          ListEmptyComponent={<Secondary>{t.history.closedEmpty}</Secondary>}
          renderItem={({ item }) => <ClosedRow job={item} />}
        />
      ) : tab === "disputes" ? (
        <DisputesList
          items={[
            ...(published.data ?? []).filter((item) => item.orderId !== null && disputes.has(item.orderId)).map((item) => ({ orderId: item.orderId!, title: item.spec.title, amount: item.amount, info: disputes.get(item.orderId!)! })),
            ...(applied.data ?? []).filter((item) => item.changa.orderId !== null && disputes.has(item.changa.orderId)).map((item) => ({ orderId: item.changa.orderId!, title: item.changa.title, amount: item.changa.amount, info: disputes.get(item.changa.orderId!)! })),
          ]}
          query={query}
          filter={disputeFilter}
          onFilter={setDisputeFilter}
          pull={pull}
          refreshing={refresh.refreshing}
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
          renderItem={({ item }) => <AppliedItem application={item} dispute={item.changa.orderId !== null ? disputes.get(item.changa.orderId) : undefined} proposal={(agreements.data ?? []).find((agreement) => agreement.payee === address && agreement.specHash === item.changa.specHash && (agreement.status === "pending" || agreement.status === "sending"))} />}
        />
      )}
    </SafeAreaView>
  );
}

function AgendaList({ items, disputes, query, pull, refreshing }: { items: AgendaItem[]; disputes: Map<number, DisputeInfo>; query: string; pull: object; refreshing: boolean }) {
  const now = Math.floor(Date.now() / 1000);
  const shown = items.filter((item) => matchesQuery(query, [item.title, statusLabel(item.status), t.mine.agendaRole[item.role]]));
  const sections = buildAgenda(shown, now).map((group) => ({ key: group.section, title: t.mine.agendaSections[group.section], data: group.items }));
  return (
    <SectionList
      contentContainerStyle={styles.list}
      {...pull}
      ListHeaderComponent={<PullSpinner active={refreshing} />}
      sections={sections}
      keyExtractor={(item) => String(item.orderId)}
      stickySectionHeadersEnabled={false}
      ListEmptyComponent={<Secondary>{t.mine.agendaEmpty}</Secondary>}
      renderSectionHeader={({ section }) => <Text style={[text.subtitle, styles.sectionTitle]}>{section.title}</Text>}
      renderItem={({ item }) => <AgendaRow item={item} now={now} dispute={disputes.get(item.orderId)} />}
      SectionSeparatorComponent={() => <View style={{ height: spacing.xs }} />}
      ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
    />
  );
}

function AgendaRow({ item, now, dispute }: { item: AgendaItem; now: number; dispute?: DisputeInfo }) {
  const open = () => router.push({ pathname: "/order/[orderId]", params: { orderId: String(item.orderId), title: item.title } });
  const when = item.startsAt ? (sameDay(item.startsAt, now) ? formatClock(item.startsAt) : `${formatDate(item.startsAt)} · ${formatClock(item.startsAt)}`) : item.remote ? t.mine.agendaNoTime : null;
  return (
    <Card gap="sm" onPress={open}>
      <View style={styles.titleRow}>
        <Text style={[text.subtitle, { flex: 1 }]} numberOfLines={2}>{item.title}</Text>
        {item.amount ? <Text style={[text.subtitle, { color: colors.brick }]}>{formatUsdc(item.amount)}</Text> : null}
      </View>
      {when ? (
        <View style={styles.whenRow}>
          <Icon name="clock" size={16} color={colors.brick} />
          <Text style={text.label}>{when}</Text>
        </View>
      ) : null}
      <View style={styles.titleRow}>
        <StatusChip label={t.mine.agendaRole[item.role]} />
        <StatusChip label={statusLabel(item.status)} />
        {disputeBadge(dispute, item.status)}
      </View>
    </Card>
  );
}

function ClosedRow({ job }: { job: ClosedJob }) {
  const open = () => router.push({ pathname: "/order/[orderId]", params: { orderId: String(job.orderId), title: job.title } });
  return (
    <Card gap="sm" onPress={open}>
      <View style={styles.titleRow}>
        <Text style={[text.subtitle, { flex: 1 }]} numberOfLines={2}>{job.title}</Text>
        {job.amount ? <Text style={[text.subtitle, { color: colors.brick }]}>{formatUsdc(job.amount)}</Text> : null}
      </View>
      {job.closedAt ? <Text style={text.secondary}>{t.history.closedOn.replace("{date}", formatDate(job.closedAt))}</Text> : null}
      <View style={styles.titleRow}>
        <StatusChip label={job.role === "payee" ? t.history.asPayee : t.history.asPayer} />
      </View>
    </Card>
  );
}

function PublishedItem({ changa, waiting, dispute }: { changa: Changa; waiting: boolean; dispute?: DisputeInfo }) {
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
      <ChangaCard changa={changa} status={status} badges={disputeBadges(dispute, status)} action={action} strip={waiting ? { tone: "info", icon: "clock", title: t.mine.waitingTitle, body: t.mine.waitingAgreement } : undefined} onPress={changa.status === "draft" ? () => undefined : open} />
    </View>
  );
}

function AppliedItem({ application, proposal, dispute }: { application: MyApplication; proposal: AgreementRecord | undefined; dispute?: DisputeInfo }) {
  const { changa } = application;
  const open = () => router.push({ pathname: "/changa/[specHash]", params: { specHash: changa.specHash } });
  const where = [changa.category !== null ? t.publish.categories[changa.category] : null, changa.modality === "remote" ? t.map.remoteTag : changa.modality === "onsite" ? t.map.onsiteTag : null, changa.when ? formatDate(changa.when) : null].filter(Boolean).join(" · ");
  const states = t.mine.applicationState;
  const toOrder = changa.orderId !== null ? () => router.push({ pathname: "/order/[orderId]", params: { orderId: String(changa.orderId) } }) : undefined;
  const view = applicationView(application.status, changa.status);
  const progress = {
    inProgress: { tone: "info", icon: "briefcase", title: states.inProgressTitle, body: states.inProgress },
    delivered: { tone: "info", icon: "clock", title: states.deliveredTitle, body: states.delivered },
    settled: { tone: "success", icon: "check", title: states.settledTitle, body: states.settled },
    disputed: { tone: "info", icon: "alert", title: states.disputedTitle, body: states.disputed },
    cancelled: { tone: "neutral", icon: "close", title: states.cancelledTitle, body: states.cancelled },
  } as const;
  let data: StripData;
  if (view in progress) {
    const shown = progress[view as keyof typeof progress];
    data = { ...shown, action: toOrder && view !== "cancelled" ? { label: t.mine.openOrder, onPress: toOrder } : undefined };
  } else if (proposal?.status === "sending") data = { tone: "info", icon: "clock", title: states.confirmingTitle, body: states.confirming };
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
      {dispute ? <View style={styles.titleRow}>{disputeBadge(dispute, changa.status)}</View> : null}
      {state}
    </Card>
  );
}

// Si el trabajo tiene un reclamo, se marca en la tarjeta. Con el trabajo ya "en reclamo" el estado lo dice solo.
function disputeBadges(dispute: DisputeInfo | undefined, status: string): { label: string; warn?: boolean }[] {
  if (!dispute) return [];
  if (dispute.open) return status === "disputed" ? [] : [{ label: t.disputesTab.open, warn: true }];
  return [{ label: t.disputesTab.had }];
}

function disputeBadge(dispute: DisputeInfo | undefined, status: string) {
  return disputeBadges(dispute, status).map((badge) => <StatusChip key={badge.label} label={badge.label} warn={badge.warn} />);
}

type DisputeRow = { orderId: number; title: string; amount: string | null; info: DisputeInfo };

function DisputesList({ items, query, filter, onFilter, pull, refreshing }: { items: DisputeRow[]; query: string; filter: DisputeFilter; onFilter: (value: DisputeFilter) => void; pull: object; refreshing: boolean }) {
  const shown = items.filter((item) => matchesDisputeFilter(item.info, filter) && matchesQuery(query, [item.title]));
  return (
    <FlatList
      contentContainerStyle={styles.list}
      {...pull}
      ListHeaderComponent={
        <View style={{ gap: spacing.sm }}>
          <PullSpinner active={refreshing} />
          <Row>
            {(["all", "open", "byMe", "byThem"] as const).map((key) => (
              <Chip key={key} label={t.disputesTab.filters[key]} selected={filter === key} onPress={() => onFilter(key)} />
            ))}
          </Row>
        </View>
      }
      data={shown}
      keyExtractor={(item) => String(item.orderId)}
      ListEmptyComponent={<Secondary>{t.disputesTab.empty}</Secondary>}
      renderItem={({ item }) => (
        <Card gap="sm" onPress={() => router.push({ pathname: "/order/[orderId]", params: { orderId: String(item.orderId), title: item.title } })}>
          <View style={styles.titleRow}>
            <Text style={[text.subtitle, { flex: 1 }]} numberOfLines={2}>{item.title}</Text>
            {item.amount ? <Text style={[text.subtitle, { color: colors.brick }]}>{formatUsdc(item.amount)}</Text> : null}
          </View>
          <View style={styles.titleRow}>
            <StatusChip label={item.info.open ? t.disputesTab.open : t.disputesTab.had} warn={item.info.open} />
            <StatusChip label={item.info.byMe ? t.disputesTab.byMe : t.disputesTab.byThem} />
          </View>
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  pad: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: 0, gap: spacing.md },
  list: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.md },
  item: { gap: spacing.xs },
  sectionTitle: { paddingTop: spacing.sm },
  whenRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  titleRow: { flexDirection: "row", gap: spacing.sm },
  banner: { backgroundColor: colors.sand, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
});
