import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Button, Screen, Secondary } from "../../components/ui";
import { t } from "../../i18n";
import { setFirstScreen } from "../../session/intent";
import { colors, spacing, text } from "../../theme";

export default function Welcome() {
  const start = (first: "publish" | "map") => {
    setFirstScreen(first);
    router.push("/connect");
  };
  return (
    <Screen
      scroll={false}
      footer={
        <>
          <Button label={t.welcome.needHand} icon="pin" onPress={() => start("publish")} />
          <Button label={t.welcome.giveHand} variant="secondary" icon="briefcase" onPress={() => start("map")} />
          <Button label={t.welcome.browse} variant="outline" icon="map" onPress={() => router.replace("/map")} />
        </>
      }
    >
      <View style={styles.hero}>
        <Text style={styles.name}>{t.welcome.title}</Text>
        <Secondary style={styles.slogan}>{t.welcome.slogan}</Secondary>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  name: { ...text.title, fontSize: 44, color: colors.brick },
  slogan: { textAlign: "center", paddingHorizontal: spacing.lg },
});
