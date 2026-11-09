import { router } from "expo-router";
import { Body, Button, Screen, Title } from "../../components/ui";
import { t } from "../../i18n";
import { getFirstScreen } from "../../session/intent";
import { useSession } from "../../session/SessionProvider";

export default function Done() {
  const { profile } = useSession();
  const status = profile?.selfieStatus ?? "pending";
  const message = status === "approved" ? t.done.approved : status === "rejected" ? t.done.rejected : t.done.pending;
  const publishFirst = getFirstScreen() === "publish" && status === "approved";

  return (
    <Screen
      footer={
        <>
          {status === "rejected" ? <Button label={t.done.retake} onPress={() => router.replace("/selfie")} /> : null}
          <Button label={publishFirst ? t.done.publish : t.done.goToMap} onPress={() => router.replace(publishFirst ? "/publish" : "/map")} variant={status === "rejected" ? "ghost" : "primary"} />
        </>
      }
    >
      <Title>{t.done.title}</Title>
      <Body>{message}</Body>
    </Screen>
  );
}
