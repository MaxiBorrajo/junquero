import { router, useLocalSearchParams } from "expo-router";
import { Body, Button, Screen, Title } from "../../components/ui";
import { t } from "../../i18n";

export default function PublishDone() {
  const { confirmed } = useLocalSearchParams<{ confirmed?: string }>();
  return (
    <Screen footer={<Button label={t.publish.goToMine} onPress={() => router.replace("/my-changas")} />}>
      <Title>{t.publish.doneTitle}</Title>
      <Body>{confirmed === "1" ? t.publish.doneBody : t.publish.donePending}</Body>
    </Screen>
  );
}
