import { router, useLocalSearchParams } from "expo-router";
import { Body, Button, Screen, Title } from "../../components/ui";
import { t } from "../../i18n";

export default function PublishDone() {
  const { confirmed, group, spec } = useLocalSearchParams<{ confirmed?: string; group?: string; spec?: string }>();
  return (
    <Screen back={false} footer={<Button label={group === "1" && confirmed === "1" && spec ? t.publish.goToGroup : t.publish.goToMine} onPress={() => (group === "1" && confirmed === "1" && spec ? router.replace({ pathname: "/changa/[specHash]", params: { specHash: spec } }) : router.replace("/my-changas"))} />}>
      <Title>{t.publish.doneTitle}</Title>
      <Body>{group === "1" ? (confirmed === "1" ? t.publish.groupDone : t.publish.groupPending) : confirmed === "1" ? t.publish.doneBody : t.publish.donePending}</Body>
    </Screen>
  );
}
