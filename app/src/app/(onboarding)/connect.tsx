import { useAppKit, useAccount } from "@reown/appkit-react-native";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Body, Button, ErrorText, Screen, Title } from "../../components/ui";
import { t } from "../../i18n";

export default function Connect() {
  const { open } = useAppKit();
  const { isConnected, address } = useAccount();
  const [failed, setFailed] = useState(false);
  const [guide, setGuide] = useState(false);

  useEffect(() => {
    if (isConnected && address) router.replace("/confirm");
  }, [isConnected, address]);

  const connect = async () => {
    setFailed(false);
    try {
      await open();
    } catch {
      setFailed(true);
    }
  };

  if (guide) {
    return (
      <Screen footer={<Button label={t.wallet.guideBack} onPress={() => setGuide(false)} />}>
        <Title>{t.wallet.guideTitle}</Title>
        {t.wallet.guideSteps.map((step, index) => (
          <Body key={step}>{`${index + 1}. ${step}`}</Body>
        ))}
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <>
          <Button label={t.wallet.connect} onPress={connect} />
          <Button label={t.wallet.noWallet} variant="ghost" onPress={() => setGuide(true)} />
        </>
      }
    >
      <Title>{t.wallet.title}</Title>
      <Body>{t.wallet.explanation}</Body>
      {failed ? <ErrorText>{t.wallet.failed}</ErrorText> : null}
    </Screen>
  );
}
