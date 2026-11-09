import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Changa, ReceivedApplication } from "../../api/types";
import { encodeProposeProvider } from "../../chain/group";
import { sendViaRelay } from "../../chain/orderActions";
import { relayDepsFor } from "../../lib/relayHelpers";
import { AGREEMENT_VALIDITY_SECONDS, ZERO_HASH, agreementTypedData, proposalPrice } from "../../chain/agreement";
import { milestoneTerms, milestoneTermsHash } from "../../chain/terms";
import { deployment } from "../../chain/deployment";
import { Button, ErrorText, Secondary, Title } from "../../components/ui";
import { useMyAgreements, useMyChangas, useReceivedApplications } from "../../data/useMine";
import { t } from "../../i18n";
import { formatUsdc } from "../../lib/money";
import { useSession } from "../../session/SessionProvider";
import { isRejection, signTyped } from "../../wallet/sign";
import { colors, radius, spacing, text } from "../../theme";

export default function ReceivedApplications() {
  const { changaId } = useLocalSearchParams<{ changaId: string }>();
  const id = Number(changaId);
  const { api, address } = useSession();
  const queryClient = useQueryClient();
  const applications = useReceivedApplications(id);
  const mine = useMyChangas();
  const agreements = useMyAgreements();
  const changa = (mine.data ?? []).find((item) => item.id === id) ?? null;
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const proposal = changa?.orderId ? (agreements.data ?? []).find((item) => item.orderId === changa.orderId && item.status === "pending") : undefined;

  const choose = async (application: ReceivedApplication, target: Changa) => {
    if (!address || target.orderId === null) return;
    const plan = milestoneTerms(application.plan?.milestones ?? target.spec.milestones, application.plan ? application.plan.advance : target.spec.advance, target.specHash as `0x${string}`);
    const price = plan ? proposalPrice(null, target.amount) : proposalPrice(application.amount, target.amount);
    if (price === null) return;
    setBusy(application.id);
    setMessage(null);
    setFailed(false);
    try {
      const expiry = Math.floor(Date.now() / 1000) + AGREEMENT_VALIDITY_SECONDS;
      const terms = { orderId: BigInt(target.orderId), payer: address as `0x${string}`, payee: application.applicant as `0x${string}`, price, specHash: target.specHash as `0x${string}`, termsHash: plan ? milestoneTermsHash(plan) : ZERO_HASH, expiry };
      const signature = await signTyped(agreementTypedData(deployment, terms));
      await api.send("POST", `/me/orders/${target.orderId}/agreement`, { payee: application.applicant, price: price.toString(), expiry, signature });
      await queryClient.invalidateQueries({ queryKey: ["agreements"] });
      setMessage(t.received.proposalSent);
    } catch (error) {
      if (isRejection(error)) setMessage(t.received.cancelled);
      else setFailed(true);
    } finally {
      setBusy(null);
    }
  };

  const proposeProvider = async (application: ReceivedApplication, target: Changa) => {
    if (target.orderId === null) return;
    setBusy(application.id);
    setMessage(null);
    setFailed(false);
    try {
      await sendViaRelay(relayDepsFor(api, address as string), encodeProposeProvider(BigInt(target.orderId), application.applicant as `0x${string}`));
      setMessage(t.group.proposeDone);
    } catch (error) {
      if (isRejection(error)) setMessage(t.received.cancelled);
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
      <FlatList
        contentContainerStyle={styles.list}
        data={applications.data ?? []}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={
          <View style={{ gap: spacing.sm }}>
            <Title>{t.received.title}</Title>
            {proposal ? (
              <View style={styles.banner}>
                <Text style={text.body}>{t.received.pendingTitle}</Text>
                <Button label={t.received.cancelProposal} variant="ghost" onPress={cancelProposal} />
              </View>
            ) : null}
            {message ? <Secondary>{message}</Secondary> : null}
            {failed ? <ErrorText>{t.received.chooseFailed}</ErrorText> : null}
          </View>
        }
        ListEmptyComponent={<Secondary>{t.received.empty}</Secondary>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={text.subtitle} onPress={() => router.push({ pathname: "/profile-public", params: { address: item.applicant } })}>{item.profile?.name ?? item.applicant.slice(0, 8)}</Text>
            <Secondary>{item.profile?.verified ? t.received.verified : t.received.unverified}</Secondary>
            <Text style={text.body}>{`${t.received.offer}: ${item.amount ? formatUsdc(item.amount) : changa ? `${formatUsdc(changa.amount)}` : t.received.publishedAmount}`}</Text>
            {item.message ? <Text style={text.body}>{item.message}</Text> : null}
            {item.plan ? (
              <View style={{ gap: 2 }}>
                <Text style={text.label}>{t.planChange.proposes}</Text>
                {item.plan.milestones.map((m, i) => (
                  <Secondary key={i}>{`${i + 1}. ${m.name} · ${formatUsdc(m.amount)} · ${m.criteria}`}</Secondary>
                ))}
              </View>
            ) : null}
            <Button label={t.received.talk} variant="ghost" onPress={() => router.push({ pathname: "/chat/[id]", params: { id: String(item.id), counterpart: item.applicant, title: changa?.spec.title ?? "" } })} />
            {changa && changa.status === "open" && changa.spec.group ? <Button label={t.group.propose} variant="secondary" onPress={() => proposeProvider(item, changa)} loading={busy === item.id} disabled={busy !== null} /> : null}
            {changa && changa.status === "open" ? <Button label={t.received.choose} onPress={() => choose(item, changa)} loading={busy === item.id} disabled={busy !== null} /> : null}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.md, gap: spacing.md },
  card: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs, borderWidth: 1, borderColor: colors.line },
  banner: { backgroundColor: colors.sand, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
});
