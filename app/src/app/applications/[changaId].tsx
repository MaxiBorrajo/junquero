import { useQueryClient } from "@tanstack/react-query";
import { useActivity } from "../../components/Activity";
import { Card } from "../../components/Card";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Changa, ReceivedApplication } from "../../api/types";
import { encodeProposeProvider } from "../../chain/group";
import { sendViaRelay } from "../../chain/orderActions";
import { relayDepsFor } from "../../lib/relayHelpers";
import { DetailActions } from "../../components/DetailActions";
import { useChooseApplicant } from "../../lib/useChooseApplicant";
import { useRejectOffer } from "../../lib/useRejectOffer";
import { offerTotal } from "../../lib/offer";
import { PersonMenu } from "../../components/PersonMenu";
import { Icon } from "../../components/Icon";
import { BackButton, ErrorText, Secondary, Title } from "../../components/ui";
import { useMyAgreements, useMyChangas, useReceivedApplications } from "../../data/useMine";
import { useToast } from "../../components/Toast";
import { t } from "../../i18n";
import { formatUsdc } from "../../lib/money";
import { useSession } from "../../session/SessionProvider";
import { isRejection } from "../../wallet/sign";
import { colors, fonts, radius, spacing, text } from "../../theme";

export default function ReceivedApplications() {
  const { changaId } = useLocalSearchParams<{ changaId: string }>();
  const id = Number(changaId);
  const { api, address } = useSession();
  const queryClient = useQueryClient();
  const applications = useReceivedApplications(id);
  const mine = useMyChangas();
  const agreements = useMyAgreements();
  const changa = (mine.data ?? []).find((item) => item.id === id) ?? null;
  const track = useActivity();
  const [busy, setBusy] = useState<number | null>(null);
  const toast = useToast();
  const [failed, setFailed] = useState(false);

  const proposal = changa?.orderId ? (agreements.data ?? []).find((item) => item.orderId === changa.orderId && (item.status === "pending" || item.status === "sending")) : undefined;

  const { reject: rejectOffer } = useRejectOffer();
  const { choose, busy: choosing, failed: chooseFailed } = useChooseApplicant();
  const working = busy ?? choosing;

  const proposeProvider = async (application: ReceivedApplication, target: Changa) => {
    if (target.orderId === null) return;
    setBusy(application.id);
    setFailed(false);
    try {
      await track(t.common.working, () => sendViaRelay(relayDepsFor(api, address as string), encodeProposeProvider(BigInt(target.orderId!), application.applicant as `0x${string}`)));
      toast({ text: t.group.proposeDone, icon: "users" });
    } catch (error) {
      if (isRejection(error)) toast({ text: t.received.cancelled, tone: "info" });
      else setFailed(true);
    } finally {
      setBusy(null);
    }
  };

  const cancelProposal = async () => {
    if (!changa?.orderId) return;
    try {
      await api.send("DELETE", `/me/orders/${changa.orderId}/agreement`);
      await queryClient.invalidateQueries({ queryKey: ["agreements"] });
    } catch {
      setFailed(true);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <BackButton />
      <FlatList
        contentContainerStyle={styles.list}
        data={applications.data ?? []}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={
          <View style={{ gap: spacing.sm }}>
            <Title>{t.received.title}</Title>
            {failed || chooseFailed ? <ErrorText>{t.received.chooseFailed}</ErrorText> : null}
          </View>
        }
        ListEmptyComponent={<Secondary>{t.received.empty}</Secondary>}
        renderItem={({ item }) => {
          const name = item.profile?.name ?? item.applicant.slice(0, 8);
          const offer = item.amount ? formatUsdc(item.amount) : changa ? formatUsdc(changa.amount) : t.received.publishedAmount;
          const verified = item.profile?.verified ? t.received.verified : t.received.unverified;
          const sentToThis = proposal?.payee.toLowerCase() === item.applicant.toLowerCase();
          const open = changa !== null && changa.status === "open" && !proposal;
          const talk = () => router.push({ pathname: "/chat/[id]", params: { id: String(item.id), counterpart: item.applicant, title: changa?.spec.title ?? "" } });
          const hasOffer = open && !(agreements.data ?? []).some((agreement) => agreement.orderId === changa?.orderId && agreement.status === "submitted") && offerTotal(item.plan, item.amount, changa?.amount ?? null) !== null;
          const choosePress = () => changa && void choose(item, changa);
          const menu = <PersonMenu role="owner" applicationId={item.id} changaId={id} counterpart={item.applicant} active={item.status === "active"} />;
          const plan = item.plan ? (
            <View style={{ gap: 2 }}>
              <Text style={text.label}>{t.planChange.proposes}</Text>
              {item.plan.milestones.map((m, i) => (
                <Secondary key={i}>{`${i + 1}. ${m.name} · ${formatUsdc(m.amount)} · ${m.criteria}`}</Secondary>
              ))}
            </View>
          ) : null;
          const propose = changa && open && changa.spec.group && busy === null ? <DetailActions actions={[{ key: "propose", label: t.group.propose, icon: "users", onPress: () => void proposeProvider(item, changa) }]} /> : null;
          const avatar = (
            <View style={styles.avatar}>
              <Text style={[text.subtitle, { color: colors.brick }]}>{name.trim().charAt(0).toUpperCase() || "?"}</Text>
            </View>
          );
          const message = item.message ? <Text style={text.body}>{item.message}</Text> : null;
          return (
            <Card gap="md">
              <View style={styles.cardHeader}>
                <Pressable accessibilityRole="button" accessibilityLabel={t.received.viewProfile} onPress={() => router.push({ pathname: "/profile-public", params: { address: item.applicant } })} style={styles.who}>
                  {avatar}
                  <View style={{ flex: 1 }}>
                    <Text style={text.subtitle}>{name}</Text>
                    <Text style={[text.secondary, { color: colors.brick }]}>{`${verified} · ${t.received.viewProfile}`}</Text>
                  </View>
                </Pressable>
                <Text style={[text.subtitle, { color: colors.brick }]}>{offer}</Text>
                {menu}
              </View>
              {message}
              {plan}
              {propose}
              <View style={styles.actions}>
                <Pressable accessibilityRole="button" onPress={talk} style={[styles.small, styles.smallOutline]}>
                  <Icon name="message" size={16} color={colors.brick} />
                  <Text style={[styles.smallLabel, { color: colors.brick }]}>{t.received.talk}</Text>
                </Pressable>
                {sentToThis ? (
                  <View style={[styles.small, styles.smallOutline]}>
                    <Icon name="clock" size={16} color={colors.brick} />
                    <Text style={[styles.smallLabel, { color: colors.brick }]}>{t.received.proposalSentTag}</Text>
                  </View>
                ) : null}
                {open ? (
                  <Pressable accessibilityRole="button" disabled={working !== null} onPress={choosePress} style={[styles.small, styles.smallSolid, working !== null && { opacity: 0.5 }]}>
                    <Icon name="check" size={16} color={colors.white} />
                    <Text style={[styles.smallLabel, { color: colors.white }]}>{t.received.choose}</Text>
                  </Pressable>
                ) : null}
              </View>
              {sentToThis ? (
                <Pressable accessibilityRole="button" onPress={() => void cancelProposal()} style={[styles.small, styles.smallOutline]}>
                  <Icon name="close" size={16} color={colors.brick} />
                  <Text style={[styles.smallLabel, { color: colors.brick }]}>{t.received.cancelProposal}</Text>
                </Pressable>
              ) : null}
              {hasOffer ? (
                <Pressable accessibilityRole="button" onPress={() => rejectOffer(item.id, name)} style={[styles.small, styles.smallOutline]}>
                  <Icon name="close" size={16} color={colors.brick} />
                  <Text style={[styles.smallLabel, { color: colors.brick }]}>{t.offer.rejectConfirm}</Text>
                </Pressable>
              ) : null}
            </Card>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.md, gap: spacing.md },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.sand, alignItems: "center", justifyContent: "center" },
  who: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  actions: { flexDirection: "row", gap: spacing.sm },
  small: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, height: 40, borderRadius: radius.pill },
  smallOutline: { borderWidth: 1.5, borderColor: colors.brick },
  smallSolid: { backgroundColor: colors.brick },
  smallLabel: { ...text.secondary, fontFamily: fonts.semibold },
});
