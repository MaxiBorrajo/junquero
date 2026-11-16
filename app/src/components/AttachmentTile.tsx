import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "./Icon";
import { t } from "../i18n";
import { colors, radius, spacing, text } from "../theme";

const SIZE = 104;
const COMPACT = 64;

export function AttachmentTile({ name, mime, uri, onRemove, onOpen, compact = false }: { name: string; mime: string; uri?: string; onRemove?: () => void; onOpen?: () => void; compact?: boolean }) {
  const image = mime.startsWith("image/") && uri;
  return (
    <Pressable accessibilityRole="button" onPress={onOpen} disabled={!onOpen} style={[styles.tile, compact && styles.compact]}>
      {image ? (
        <Image source={{ uri }} style={styles.fill} contentFit="cover" />
      ) : (
        <View style={[styles.fill, styles.generic]}>
          <Icon name={mime.startsWith("video/") ? "play" : "file"} size={compact ? 20 : 28} color={colors.brick} />
          <Text style={[text.label, styles.name]} numberOfLines={compact ? 1 : 2}>
            {name}
          </Text>
        </View>
      )}
      {onRemove ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t.publish.remove} hitSlop={8} onPress={onRemove} style={[styles.remove, compact && styles.removeCompact]}>
          <Icon name="close" size={compact ? 12 : 16} color={colors.white} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { width: SIZE, height: SIZE, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.white, borderColor: colors.line, borderWidth: 1 },
  compact: { width: COMPACT, height: COMPACT },
  fill: { width: "100%", height: "100%" },
  generic: { alignItems: "center", justifyContent: "center", padding: spacing.sm, gap: spacing.xs },
  name: { textAlign: "center" },
  remove: { position: "absolute", top: 6, right: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.overlayStrong, alignItems: "center", justifyContent: "center" },
  removeCompact: { top: 2, right: 2, width: 20, height: 20, borderRadius: 10 },
});
