import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert } from "react-native";
import type { Changa, ReceivedApplication } from "../api/types";
import { AGREEMENT_VALIDITY_SECONDS, ZERO_HASH, agreementTypedData, proposalPrice } from "../chain/agreement";
import { PERMIT_VALIDITY_SECONDS, permitTypedData } from "../chain/createOrder";
import { deployment } from "../chain/deployment";
import { encodeTopUp, sendViaRelay } from "../chain/orderActions";
import { readTokenBalance, readTokenNonce } from "../chain/reader";
import { milestoneTerms, milestoneTermsHash, milestoneTotal } from "../chain/terms";
import { useToast } from "../components/Toast";
import { useMyChangas } from "../data/useMine";
import { t } from "../i18n";
import { useSession } from "../session/SessionProvider";
import { isRejection, signTyped } from "../wallet/sign";
import { formatUsdc } from "./money";
import { relayDepsFor } from "./relayHelpers";

// Elegir a una persona postulada: si ofrece más que lo publicado, suma la diferencia al depósito, y después firma la propuesta de acuerdo.
export function useChooseApplicant() {
  const { api, address } = useSession();
  const queryClient = useQueryClient();
  const mine = useMyChangas();
  const toast = useToast();
  const [busy, setBusy] = useState<number | null>(null);
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

  // Antes de mandar la propuesta se confirma a quién y por cuánto.
  const confirmChoice = (name: string, price: bigint) =>
    new Promise<boolean>((resolve) => {
      Alert.alert(t.received.chooseTitle.replace("{name}", name), t.received.chooseBody.replace("{price}", formatUsdc(price.toString())), [
        { text: t.common.cancel, style: "cancel", onPress: () => resolve(false) },
        { text: t.received.chooseConfirm, onPress: () => resolve(true) },
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

  // `confirmed`: la persona ya confirmó la elección en otra pantalla (por ejemplo al aceptar una propuesta), así que no se vuelve a preguntar.
  const choose = async (application: ReceivedApplication, target: Changa, confirmed = false): Promise<void> => {
    if (!address || target.orderId === null) return;
    const plan = milestoneTerms(application.plan?.milestones ?? target.spec.milestones, target.specHash as `0x${string}`);
    const chosenMilestones = application.plan?.milestones ?? target.spec.milestones;
    const price = plan && chosenMilestones ? milestoneTotal(chosenMilestones) : proposalPrice(application.amount, target.amount);
    if (price === null) return;
    const published = target.amount !== null && /^\d+$/.test(target.amount) ? BigInt(target.amount) : null;
    const higher = published !== null && price > published;
    if (higher) {
      if (!(await confirmTopUp(price, published))) return;
    } else if (!confirmed && !(await confirmChoice(application.profile?.name ?? t.received.thisPerson, price))) return;
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

  return { choose, busy, failed, setFailed };
}
