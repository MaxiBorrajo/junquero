import { useAccount } from "@reown/appkit-react-native";
import { router } from "expo-router";
import { useState } from "react";
import { Body, Button, ErrorText, Screen, Title } from "../../components/ui";
import { t } from "../../i18n";
import { useSession } from "../../session/SessionProvider";
import { useSwitchAccount } from "../../session/useSwitchAccount";
import { signText } from "../../wallet/sign";

function isUserRejection(error: unknown): boolean {
  const text = String((error as { message?: string })?.message ?? error).toLowerCase();
  return text.includes("reject") || text.includes("denied") || text.includes("cancel");
}

export default function Confirm() {
  const { address } = useAccount();
  const { signIn } = useSession();
  const switchAccount = useSwitchAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (!address) {
      router.replace("/connect");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(address, signText);
      router.replace("/");
    } catch (failure) {
      setError(isUserRejection(failure) ? t.confirm.cancelled : t.confirm.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      onBack={() => void switchAccount("/welcome")}
      footer={
        <>
          <Button label={t.confirm.action} icon="check" onPress={confirm} loading={busy} />
          <Button label={t.confirm.switchAccount} icon="users" variant="ghost" onPress={() => void switchAccount("/connect")} disabled={busy} />
        </>
      }
    >
      <Title>{t.confirm.title}</Title>
      <Body>{t.confirm.explanation}</Body>
      {error ? <ErrorText>{error}</ErrorText> : null}
    </Screen>
  );
}
