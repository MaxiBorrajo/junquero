import { useQueryClient } from "@tanstack/react-query";
import { Card } from "../../components/Card";
import { Banner } from "../../components/Banner";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Changa, ReceivedApplication } from "../../api/types";
import { encodeProposeProvider } from "../../chain/group";
import { PERMIT_VALIDITY_SECONDS, permitTypedData } from "../../chain/createOrder";
import { encodeTopUp, sendViaRelay } from "../../chain/orderActions";
import { readTokenBalance, readTokenNonce } from "../../chain/reader";
import { relayDepsFor } from "../../lib/relayHelpers";
import { AGREEMENT_VALIDITY_SECONDS, ZERO_HASH, agreementTypedData, proposalPrice } from "../../chain/agreement";
import { milestoneTerms, milestoneTermsHash } from "../../chain/terms";
import { deployment } from "../../chain/deployment";
import { DetailActions } from "../../components/DetailActions";
import { PersonMenu } from "../../components/PersonMenu";
import { BackButton, Button, ErrorText, Secondary, Title } from "../../components/ui";
import { useMyAgreements, useMyChangas, useReceivedApplications } from "../../data/useMine";
import { useToast } from "../../components/Toast";
import { t } from "../../i18n";
import { formatUsdc } from "../../lib/money";
import { useSession } from "../../session/SessionProvider";
import { isRejection, signTyped } from "../../wallet/sign";
import { colors, spacing, text } from "../../theme";

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
  const toast = useToast();
  const [failed, setFailed] = useState(false);

  const confirmTopUp = (price: bigint, published: bigint) =>
    new Promise<boolean>((resolve) => {
      const body = t.received.topUpBody
        .replace(/{price}/g, formatUsdc(price.toString()))
        .replace("{published}", formatUsdc(published.toString()))
        .replace("{extra}", formatUsdc((price - published).toString()));
      Alert.alert(t.received.topUpTitle, body, [
        { text: t.common.cancel, style: "cancel", onPress: () => resolve(false) },
        { text: t.received.topUpConfirm, onPress: () => resolve(true) },
      ], { onDismiss: () => resolve(false) });
    });

  // Suma la diferencia al depósito y espera a que el backend ya muestre el monto nuevo.
  const topUp = async (target: Changa, price: bigint, published: bigint): Promise<"done" | "balance" | "waiting"> => {
    const account = address as `0x${string}`;
    const extra = price - published;
    if ((await readTokenBalance(account)) < extra) return "balance";
    const deadline = BigInt(Math.floor(Date.now() / 1000) + PERMIT_VALIDITY_SECONDS);
    const signature = await signTyped(permitTypedData(deployment, account, extra, await readTokenNonce(account), deadline));
    await sendViaRelay(relayDepsFor(api, account), encodeTopUp(BigInt(target.orderId as number), extra, { method: 0, nonce: 0n, deadline, signature }));
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const fresh = ((await mine.refetch()).data ?? []).find((item) => item.id === target.id);
      if (fresh && /^\d+$/.test(fresh.amount ?? "") && BigInt(fresh.amount as string) >= price) return "done";
    }
    return "waiting";
  };

  const proposal = changa?.orderId ? (agreements.data ?? []).find((item) => item.orderId === changa.orderId && item.status === "pending") : undefined;

  const choose = async (application: ReceivedApplication, target: Changa) => {
    if (!address || target.orderId === null) return;
    const plan = milestoneTerms(application.plan?.milestones ?? target.spec.milestones, target.specHash as `0x${string}`);
    const price = plan ? proposalPrice(null, target.amount) : proposalPrice(application.amount, target.amount);
    if (price === null) return;
    const published = target.amount !== null && /^\d+$/.test(target.amount) ? BigInt(target.amount) : null;
    const higher = !plan && published !== null && price > published;
    if (higher && !(await confirmTopUp(price, published))) return;
    setBusy(application.id);
    setFailed(false);
    try {
      if (higher) {
        const outcome = await topUp(target, price, published);
        if (outcome === "balance") {
          toast({ text: t.received.topUpBalance.replace("{extra}", formatUsdc((price - published).toString())), tone: "error" });
          return;
        }
        if (outcome === "waiting") {
          toast({ text: t.received.topUpWaiting, tone: "info" });
          return;
        }
      }
      const expiry = Math.floor(Date.now() / 1000) + AGREEMENT_VALIDITY_SECONDS;
      const terms = { orderId: BigInt(target.orderId), payer: address as `0x${string}`, payee: application.applicant as `0x${string}`, price, specHash: target.specHash as `0x${string}`, termsHash: plan ? milestoneTermsHash(plan) : ZERO_HASH, expiry };
      const signature = await signTyped(agreementTypedData(deployment, terms));
      await api.send("POST", `/me/orders/${target.orderId}/agreement`, { payee: application.applicant, price: price.toString(), expiry, signature });
      await queryClient.invalidateQueries({ queryKey: ["agreements"] });
      toast({ text: t.received.proposalSent, icon: "send" });
    } catch (error) {
      if (isRejection(error)) toast({ text: t.received.cancelled, tone: "info" });
      else setFailed(true);
    } finally {
      setBusy(null);
    }
  };

  const proposeProvider = async (application: ReceivedApplication, target: Changa) => {
    if (target.orderId === null) return;
    setBusy(application.id);
    setFailed(false);
    try {
      await sendViaRelay(relayDepsFor(api, address as string), encodeProposeProvider(BigInt(target.orderId), application.applicant as `0x${string}`));
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
            {proposal ? (
              <Banner icon="clock" action={{ label: t.received.cancelProposal, onPress: () => void cancelProposal() }}>{t.received.pendingTitle}</Banner>
            ) : null}
            {failed ? <ErrorText>{t.received.chooseFailed}</ErrorText> : null}
          </View>
        }
        ListEmptyComponent={<Secondary>{t.received.empty}</Secondary>}
        renderItem={({ item }) => (
          <Card gap="xs">
            <View style={styles.cardHeader}>
              <Text style={[text.subtitle, { flex: 1 }]} onPress={() => router.push({ pathname: "/profile-public", params: { address: item.applicant } })}>{item.profile?.name ?? item.applicant.slice(0, 8)}</Text>
              <PersonMenu role="owner" applicationId={item.id} changaId={id} counterpart={item.applicant} active={item.status === "active"} />
            </View>
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
            <DetailActions
              actions={[
                { key: "talk", label: t.received.talk, icon: "message", onPress: () => router.push({ pathname: "/chat/[id]", params: { id: String(item.id), counterpart: item.applicant, title: changa?.spec.title ?? "" } }) },
                ...(changa && changa.status === "open" && changa.spec.group && busy === null ? [{ key: "propose", label: t.group.propose, icon: "users" as const, onPress: () => void proposeProvider(item, changa) }] : []),
              ]}
            />
            {changa && changa.status === "open" ? <Button label={t.received.choose} icon="check" onPress={() => choose(item, changa)} loading={busy === item.id} disabled={busy !== null} /> : null}
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.md, gap: spacing.md },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
});
