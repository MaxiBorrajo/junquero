import { useVideoPlayer, VideoView } from "expo-video";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon } from "./Icon";
import { t } from "../i18n";
import { colors, spacing } from "../theme";

function Player({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.play();
  });
  return <VideoView player={player} style={styles.video} nativeControls contentFit="contain" />;
}

export function VideoViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  return (
    <Modal visible={uri !== null} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        {uri ? <Player key={uri} uri={uri} /> : null}
        <SafeAreaView style={styles.top} pointerEvents="box-none">
          <Pressable accessibilityRole="button" accessibilityLabel={t.common.close} hitSlop={12} onPress={onClose} style={styles.close}>
            <Icon name="close" size={22} color={colors.white} />
          </Pressable>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.94)", justifyContent: "center" },
  video: { width: "100%", height: "100%" },
  top: { position: "absolute", top: 0, left: 0, right: 0, alignItems: "flex-end", padding: spacing.md },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
});
