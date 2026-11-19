import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { deployment } from "../chain/deployment";
import { ACTION_GAS, sendViaRelay } from "../chain/orderActions";
import { readForwarderNonce } from "../chain/reader";
import { encodeClaimReceipt } from "../chain/receipt";
import { useClosing } from "../data/useClosing";
import type { EvidenceItem } from "../data/useOrder";
import { EvidenceThumbnails } from "../evidence/EvidenceSection";
import { t } from "../i18n";
import { ratingSummary, ratingWord } from "../lib/closing";
import { useRunAction } from "../lib/useRunAction";
import { useSession } from "../session/SessionProvider";
import { spacing, text } from "../theme";
import { signTyped } from "../wallet/sign";
import { Card } from "./Card";
import { Button, ErrorText, Secondary } from "./ui";

// Lo que queda a la vista de las dos partes cuando el trabajo ya se cerró y se pagó: la calificación, las pruebas y el comprobante.
export function ClosingSection({ orderId, role, items }: { orderId: number; role: "payer" | "payee"; items: EvidenceItem[] }) {
  const { api, address } = useSession();
  const closing = useClosing(orderId, true);
  const { run, busy, error } = useRunAction();
  const [justClaimed, setJustClaimed] = useState(false);

  const claim = () =>
    run(
      async () => {
        const account = address as `0x${string}`;
        const deps = { api, deployment, account, now: () => Math.floor(Date.now() / 1000), readForwarderNonce: () => readForwarderNonce(account), signTypedData: signTyped };
        return sendViaRelay(deps, encodeClaimReceipt(BigInt(orderId)), ACTION_GAS, deployment.receipt);
      },
      { success: t.order.receiptDone, successIcon: "check", failure: t.order.receiptFailed, invalidate: [["closing", orderId]], onSuccess: () => setJustClaimed(true) },
    );

  const summary = ratingSummary(closing.data?.ratings ?? []);
  const claimed = Boolean(closing.data?.receipt) || justClaimed;

  return (
    <>
      {closing.data ? (
        <Card gap="xs">
          <Text style={text.subtitle}>{t.order.closedRatingTitle}</Text>
          {summary.average === null ? (
            <Secondary>{t.order.closedNoRating}</Secondary>
          ) : (
            <>
              <Text style={text.body}>
                {(role === "payee" ? t.order.closedRatingPayee : t.order.closedRatingPayer).replace("{n}", String(summary.average)).replace("{label}", ratingWord(summary.average, t.order.ratingLabels))}
              </Text>
              {summary.lines.length > 1
                ? summary.lines.map((line) => (
                    <View key={line.index ?? "all"} style={styles.line}>
                      <Secondary>{t.order.closedRatingMilestone.replace("{n}", String((line.index ?? 0) + 1)).replace("{rating}", String(line.rating))}</Secondary>
                    </View>
                  ))
                : null}
            </>
          )}
        </Card>
      ) : null}

      {items.length > 0 ? (
        <>
          <Text style={text.subtitle}>{t.order.closedEvidenceTitle}</Text>
          <EvidenceThumbnails orderId={orderId} items={items} />
        </>
      ) : null}

      {closing.data?.smallDispute ? (
        <Secondary>{t.order.receiptNoneSmallDispute}</Secondary>
      ) : closing.data ? (
        role === "payee" ? (
          claimed ? (
            <Card gap="xs">
              <Text style={text.subtitle}>{t.order.receiptTitle}</Text>
              <Secondary>{t.order.receiptClaimedMine}</Secondary>
            </Card>
          ) : (
            <Card gap="sm">
              <Text style={text.subtitle}>{t.order.receiptTitle}</Text>
              <Secondary>{t.order.receiptHint}</Secondary>
              <Button label={t.order.receiptClaim} icon="check" onPress={claim} loading={busy} />
              {error ? <ErrorText>{error}</ErrorText> : null}
            </Card>
          )
        ) : (
          <Secondary>{claimed ? t.order.receiptClaimedOther : t.order.receiptPending}</Secondary>
        )
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  line: { paddingLeft: spacing.sm },
});
