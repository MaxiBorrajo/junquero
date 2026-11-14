import { router, useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "../components/Icon";
import { t } from "../i18n";
import { colors, spacing } from "../theme";

// Pantalla propia para el video: dentro de un Modal el reproductor parpadea en Android.
export default function VideoScreen() {
  const { uri } = useLocalSearchParams<{ uri: string }>();
  const insets = useSafeAreaInsets();
  const player = useVideoPlayer(uri ?? null, (instance) => {
    instance.play();
  });
  return (
    <View style={styles.root}>
      <VideoView player={player} style={styles.video} nativeControls contentFit="contain" />
      <Pressable accessibilityRole="button" accessibilityLabel={t.common.close} hitSlop={12} onPress={() => router.back()} style={[styles.close, { top: insets.top + spacing.sm }]}>
        <Icon name="close" size={22} color={colors.white} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  video: { flex: 1 },
  close: { position: "absolute", right: spacing.md, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
});
