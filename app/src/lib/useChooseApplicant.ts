import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert } from "react-native";
import { ApiError } from "../api/client";
import type { Changa, ReceivedApplication } from "../api/types";
import { AGREEMENT_VALIDITY_SECONDS, ZERO_HASH, agreementTypedData, proposalPrice } from "../chain/agreement";
import { PERMIT_VALIDITY_SECONDS, permitTypedData } from "../chain/createOrder";
import { deployment } from "../chain/deployment";
import { encodeTopUp, sendViaRelay } from "../chain/orderActions";
import { readTokenBalance, readTokenNonce } from "../chain/reader";
import { fetchOrder, markFresh } from "../chain/serverReads";
import { milestoneTerms, milestoneTermsHash, milestoneTotal } from "../chain/terms";
import { useToast } from "../components/Toast";
import { t } from "../i18n";
import { useSession } from "../session/SessionProvider";
import { isRejection, signTyped } from "../wallet/sign";
import { formatUsdc } from "./money";
import { relayDepsFor } from "./relayHelpers";

// Elegir a una persona postulada: si ofrece más que lo publicado, suma la diferencia al depósito, y después firma la propuesta de acuerdo.
export function useChooseApplicant() {
  const { api, address } = useSession();
  const queryClient = useQueryClient();
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
  const topUp = async (target: Changa, price: bigint, published: bigint): Promise<"done" | "balance"> => {
    const account = address as `0x${string}`;
    const extra = price - published;
    // Si un intento anterior ya sumó la diferencia en la red, no se vuelve a depositar: solo se espera a que el servidor la vea.
    markFresh();
    const onChain = await fetchOrder(api, target.orderId as number).catch(() => null);
    const alreadyDone = onChain !== null && onChain.deposited >= price;
    if (!alreadyDone) {
      if ((await readTokenBalance(account)) < extra) return "balance";
      await sendTopUp(target, account, extra);
    }
    return "done";
  };

  const sendTopUp = async (target: Changa, account: `0x${string}`, extra: bigint) => {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + PERMIT_VALIDITY_SECONDS);
    const signature = await signTyped(permitTypedData(deployment, account, extra, await readTokenNonce(account), deadline));
    await sendViaRelay(relayDepsFor(api, account), encodeTopUp(BigInt(target.orderId as number), extra, { method: 0, nonce: 0n, deadline, signature }));
  };

  // Tras sumar la diferencia, el servidor tarda en ver el monto nuevo y rechaza el acuerdo ("price exceeds the deposit"): se reintenta hasta que lo vea, con la misma firma.
  const sendAgreement = async (orderId: number, body: Record<string, unknown>, retryWhileIndexing: boolean) => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await api.send("POST", `/me/orders/${orderId}/agreement`, body);
        return;
      } catch (error) {
        const indexing = error instanceof ApiError && error.status === 400 && error.code === "price exceeds the deposit";
        if (!retryWhileIndexing || !indexing || attempt >= 90) throw error;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
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
    // Subir el monto y elegir son dos pasos separados: si falta sumar la diferencia, se suma y la persona vuelve a tocar Elegir.
    if (higher) {
      markFresh();
      const onChain = await fetchOrder(api, target.orderId).catch(() => null);
      const covered = onChain !== null && onChain.deposited >= price;
      if (!covered) {
        if (!(await confirmTopUp(price, published))) return;
        setBusy(application.id);
        setFailed(false);
        toast({ text: t.received.topUpWorking, icon: "send" });
        try {
          const outcome = await topUp(target, price, published);
          if (outcome === "balance") toast({ text: t.received.topUpBalance.replace("{extra}", formatUsdc((price - published).toString())), tone: "error" });
          else {
            await Promise.all([["changas"], ["changa"], ["applications"]].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
            toast({ text: t.received.topUpDone.replace("{price}", formatUsdc(price.toString())), icon: "send" });
          }
        } catch (error) {
          if (isRejection(error)) toast({ text: t.received.cancelled, tone: "info" });
          else setFailed(true);
        } finally {
          setBusy(null);
        }
        return;
      }
    }
    if (!confirmed && !(await confirmChoice(application.profile?.name ?? t.received.thisPerson, price))) return;
    setBusy(application.id);
    setFailed(false);
    try {
      const expiry = Math.floor(Date.now() / 1000) + AGREEMENT_VALIDITY_SECONDS;
      const terms = { orderId: BigInt(target.orderId), payer: address as `0x${string}`, payee: application.applicant as `0x${string}`, price, specHash: target.specHash as `0x${string}`, termsHash: plan ? milestoneTermsHash(plan) : ZERO_HASH, expiry };
      const signature = await signTyped(agreementTypedData(deployment, terms));
      await sendAgreement(target.orderId, { payee: application.applicant, price: price.toString(), expiry, signature }, higher);
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
