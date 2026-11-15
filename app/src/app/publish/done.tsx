import { router, useLocalSearchParams } from "expo-router";
import { Body, Button, Screen, Title } from "../../components/ui";
import { t } from "../../i18n";

export default function PublishDone() {
  const { confirmed, group, spec } = useLocalSearchParams<{ confirmed?: string; group?: string; spec?: string }>();
  const goToGroup = group === "1" && spec && confirmed === "1";
  const body = group === "1" ? (confirmed === "1" ? t.publish.groupDone : t.publish.groupPending) : confirmed === "1" ? t.publish.doneBody : t.publish.donePending;
  return (
    <Screen
      back={false}
      footer={
        <Button
          label={goToGroup ? t.publish.goToGroup : t.publish.goToMine}
          icon={goToGroup ? "users" : "briefcase"}
          onPress={() => (goToGroup ? router.replace({ pathname: "/changa/[specHash]", params: { specHash: spec as string } }) : router.replace("/my-changas"))}
        />
      }
    >
      <Title>{t.publish.doneTitle}</Title>
      <Body>{body}</Body>
    </Screen>
  );
}
