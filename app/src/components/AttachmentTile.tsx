import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "./Icon";
import { t } from "../i18n";
import { colors, radius, spacing, text } from "../theme";

const SIZE = 104;

export function AttachmentTile({ name, mime, uri, onRemove }: { name: string; mime: string; uri?: string; onRemove: () => void }) {
  const image = mime.startsWith("image/") && uri;
  return (
    <View style={styles.tile}>
      {image ? (
        <Image source={{ uri }} style={styles.fill} contentFit="cover" />
      ) : (
        <View style={[styles.fill, styles.generic]}>
          <Icon name={mime.startsWith("video/") ? "camera" : "file"} size={28} color={colors.brick} />
          <Text style={[text.secondary, styles.name]} numberOfLines={2}>
            {name}
          </Text>
        </View>
      )}
      <Pressable accessibilityRole="button" accessibilityLabel={t.publish.remove} hitSlop={8} onPress={onRemove} style={styles.remove}>
        <Icon name="close" size={16} color={colors.white} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { width: SIZE, height: SIZE, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.white, borderColor: colors.line, borderWidth: 1 },
  fill: { width: "100%", height: "100%" },
  generic: { alignItems: "center", justifyContent: "center", padding: spacing.sm, gap: spacing.xs },
  name: { textAlign: "center", fontSize: 12 },
  remove: { position: "absolute", top: 6, right: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(35,24,21,0.75)", alignItems: "center", justifyContent: "center" },
});
