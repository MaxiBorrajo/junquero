import { router, useLocalSearchParams } from "expo-router";
import { Body, Button, ErrorText, Screen, Secondary, Title } from "../../components/ui";
import { useChangaBySpec } from "../../data/useChangas";
import { useMyAgreements } from "../../data/useMine";
import { t } from "../../i18n";
import { formatDate } from "../../lib/format";
import { formatUsdc } from "../../lib/money";
import { useAgreementActions } from "../../lib/useAgreementActions";
import { useSession } from "../../session/SessionProvider";

export default function AgreementScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { address } = useSession();
  const agreements = useMyAgreements();
  const agreement = (agreements.data ?? []).find((item) => item.orderId === Number(orderId)) ?? null;
  const changa = useChangaBySpec(agreement?.specHash ?? "0x");
  const actions = useAgreementActions();

  if (!agreement || !address || agreement.status !== "pending" || agreement.payee !== address) {
    return (
      <Screen>
        <ErrorText>{t.agreement.notFound}</ErrorText>
      </Screen>
    );
  }

  const confirm = async () => {
    if (await actions.accept(agreement)) router.replace("/my-changas");
  };

  const reject = async () => {
    if (await actions.reject(agreement)) router.back();
  };

  return (
    <Screen
      footer={
        <>
          <Button label={t.agreement.confirm} icon="check" onPress={confirm} loading={actions.busy} />
          <Button label={t.agreement.reject} icon="close" variant="ghost" onPress={reject} disabled={actions.busy} />
        </>
      }
    >
      <Title>{t.agreement.title}</Title>
      {changa.data ? <Body>{changa.data.spec.title}</Body> : null}
      <Body>{`${t.agreement.price}: ${formatUsdc(agreement.price)}`}</Body>
      <Secondary>{`${t.agreement.expires}: ${formatDate(agreement.expiry)}`}</Secondary>
      <Secondary>{t.agreement.summary}</Secondary>
    </Screen>
  );
}
