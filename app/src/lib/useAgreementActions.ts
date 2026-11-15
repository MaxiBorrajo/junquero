import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError } from "../api/client";
import type { AgreementRecord } from "../api/types";
import { ZERO_HASH, agreementTypedData } from "../chain/agreement";
import { deployment } from "../chain/deployment";
import { useToast } from "../components/Toast";
import { t } from "../i18n";
import { useSession } from "../session/SessionProvider";
import { isRejection, signTyped } from "../wallet/sign";

// Aceptar, rechazar o cancelar una propuesta de acuerdo. Lo usan la pantalla del acuerdo y el chat, así hacen exactamente lo mismo.
export function useAgreementActions() {
  const { api } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ["agreements"] }), queryClient.invalidateQueries({ queryKey: ["applications"] }), queryClient.invalidateQueries({ queryKey: ["changas"] })]);

  const accept = async (agreement: AgreementRecord): Promise<boolean> => {
    setBusy(true);
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
      await refresh();
      toast({ text: t.agreement.accepted, tone: "info", icon: "clock" });
      return true;
    } catch (error) {
      if (isRejection(error)) toast({ text: t.agreement.cancelled, tone: "info" });
      else if (error instanceof ApiError && error.status === 409) toast({ text: t.agreement.expired, tone: "error" });
      else toast({ text: t.agreement.failed, tone: "error" });
      return false;
    } finally {
      setBusy(false);
    }
  };

  // Quien recibió la propuesta la rechaza, o quien la mandó la cancela: en los dos casos se borra.
  const withdraw = async (agreement: AgreementRecord, message: string): Promise<boolean> => {
    setBusy(true);
    try {
      await api.send("DELETE", `/me/orders/${agreement.orderId}/agreement`);
      await refresh();
      toast({ text: message, icon: "close" });
      return true;
    } catch {
      toast({ text: t.agreement.failed, tone: "error" });
      return false;
    } finally {
      setBusy(false);
    }
  };

  return { accept, reject: (agreement: AgreementRecord) => withdraw(agreement, t.agreement.rejectedDone), cancel: (agreement: AgreementRecord) => withdraw(agreement, t.agreement.cancelledDone), busy };
}
