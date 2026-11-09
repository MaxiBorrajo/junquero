import { useAccount } from "@reown/appkit-react-native";
import { router } from "expo-router";
import { useState } from "react";
import { signMessage } from "wagmi/actions";
import { Body, Button, ErrorText, Screen, Title } from "../../components/ui";
import { t } from "../../i18n";
import { useSession } from "../../session/SessionProvider";
import { wagmiAdapter } from "../../wallet/appkit";

function isUserRejection(error: unknown): boolean {
  const text = String((error as { message?: string })?.message ?? error).toLowerCase();
  return text.includes("reject") || text.includes("denied") || text.includes("cancel");
}

export default function Confirm() {
  const { address } = useAccount();
  const { signIn } = useSession();
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
      await signIn(address, (message) => signMessage(wagmiAdapter.wagmiConfig, { message }));
      router.replace("/");
    } catch (failure) {
      if (isUserRejection(failure)) {
        router.replace("/connect");
        return;
      }
      setError(t.confirm.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen footer={<Button label={t.confirm.action} onPress={confirm} loading={busy} />}>
      <Title>{t.confirm.title}</Title>
      <Body>{t.confirm.explanation}</Body>
      {error ? <ErrorText>{error}</ErrorText> : null}
    </Screen>
  );
}
