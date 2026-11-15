import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ApiError } from "../../api/client";
import { ZERO_HASH, agreementTypedData } from "../../chain/agreement";
import { deployment } from "../../chain/deployment";
import { Body, Button, ErrorText, Screen, Secondary, Title } from "../../components/ui";
import { useChangaBySpec } from "../../data/useChangas";
import { useMyAgreements } from "../../data/useMine";
import { useToast } from "../../components/Toast";
import { t } from "../../i18n";
import { formatDate } from "../../lib/format";
import { formatUsdc } from "../../lib/money";
import { useSession } from "../../session/SessionProvider";
import { isRejection, signTyped } from "../../wallet/sign";

export default function AgreementScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { api, address } = useSession();
  const queryClient = useQueryClient();
  const agreements = useMyAgreements();
  const agreement = (agreements.data ?? []).find((item) => item.orderId === Number(orderId)) ?? null;
  const changa = useChangaBySpec(agreement?.specHash ?? "0x");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const toast = useToast();

  if (!agreement || !address || agreement.status !== "pending" || agreement.payee !== address) {
    return (
      <Screen>
        <ErrorText>{t.agreement.notFound}</ErrorText>
      </Screen>
    );
  }

  const confirm = async () => {
    setBusy(true);
    setMessage(null);
    setFailed(false);
    try {
      const terms = {
        orderId: BigInt(agreement.orderId),
        payer: agreement.payer as `0x${string}`,
        payee: agreement.payee as `0x${string}`,
        price: BigInt(agreement.price),
        specHash: agreement.specHash as `0x${string}`,
        termsHash: (agreement.termsHash || ZERO_HASH) as `0x${string}`,
        expiry: agreement.expiry,
      };
      const signature = await signTyped(agreementTypedData(deployment, terms));
      await api.send("POST", `/me/orders/${agreement.orderId}/agreement/accept`, { signature });
      await queryClient.invalidateQueries({ queryKey: ["agreements"] });
      toast({ text: t.agreement.accepted, tone: "info", icon: "clock" });
      router.replace("/my-changas");
    } catch (error) {
      if (isRejection(error)) setMessage(t.agreement.cancelled);
      else if (error instanceof ApiError && error.status === 409) setMessage(t.agreement.expired);
      else setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    try {
      await api.send("DELETE", `/me/orders/${agreement.orderId}/agreement`);
      await queryClient.invalidateQueries({ queryKey: ["agreements"] });
      router.back();
    } catch {
      setFailed(true);
    }
  };

  return (
    <Screen
      footer={
        <>
          <Button label={t.agreement.confirm} icon="check" onPress={confirm} loading={busy} />
          <Button label={t.agreement.reject} icon="close" variant="ghost" onPress={reject} disabled={busy} />
        </>
      }
    >
      <Title>{t.agreement.title}</Title>
      {changa.data ? <Body>{changa.data.spec.title}</Body> : null}
      <Body>{`${t.agreement.price}: ${formatUsdc(agreement.price)}`}</Body>
      <Secondary>{`${t.agreement.expires}: ${formatDate(agreement.expiry)}`}</Secondary>
      <Secondary>{t.agreement.summary}</Secondary>
      {message ? <ErrorText>{message}</ErrorText> : null}
      {failed ? <ErrorText>{t.agreement.failed}</ErrorText> : null}
    </Screen>
  );
}
