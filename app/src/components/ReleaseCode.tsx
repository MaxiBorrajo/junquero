import * as Clipboard from "expo-clipboard";
import { StyleSheet, Text, View } from "react-native";
import { formatCode } from "../chain/releaseCode";
import { t } from "../i18n";
import { fonts, spacing, text } from "../theme";
import { useToast } from "./Toast";
import { Button } from "./ui";

// El código corto del QR, para cuando la cámara de quien cobra no anda: se lo dicta a quien hizo el trabajo, o se lo copia y se lo manda por el chat.
export function ReleaseCode({ code }: { code: string }) {
  const toast = useToast();
  const shown = formatCode(code);
  const copy = async () => {
    await Clipboard.setStringAsync(shown);
    toast({ text: t.order.codeCopied, icon: "copy" });
  };
  return (
    <View style={styles.box}>
      <Text style={text.secondary}>{t.order.codeHint}</Text>
      <Text style={styles.code} accessibilityLabel={shown.split("").join(" ")} selectable>{shown}</Text>
      <Button label={t.order.copyCode} icon="copy" variant="outline" onPress={() => void copy()} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: "center", gap: spacing.sm },
  code: { fontFamily: fonts.bold, fontSize: 32, letterSpacing: 4, textAlign: "center" },
});
