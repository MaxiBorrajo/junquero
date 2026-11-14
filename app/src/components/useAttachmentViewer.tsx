import { useCallback, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Modal, StyleSheet, View } from "react-native";
import { ImageViewer } from "./ImageViewer";
import { VideoViewer } from "./VideoViewer";
import { t } from "../i18n";
import { openDocument } from "../lib/openDocument";
import { colors } from "../theme";

export interface Viewable {
  uri: string;
  mime: string;
  name: string;
}

// Abre un adjunto según su tipo: imagen y video en pantalla completa, el resto con la app del sistema.
export function useAttachmentViewer(): { open: (item: Viewable) => void; viewer: ReactNode } {
  const [image, setImage] = useState<string | null>(null);
  const [video, setVideo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const open = useCallback((item: Viewable) => {
    if (item.mime.startsWith("image/")) return setImage(item.uri);
    if (item.mime.startsWith("video/")) return setVideo(item.uri);
    setLoading(true);
    openDocument(item.uri, item.mime, item.name)
      .catch(() => Alert.alert(t.common.openFailedTitle, t.common.openFailed))
      .finally(() => setLoading(false));
  }, []);

  const viewer = (
    <>
      <ImageViewer uri={image} onClose={() => setImage(null)} />
      <VideoViewer uri={video} onClose={() => setVideo(null)} />
      <Modal visible={loading} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.white} />
        </View>
      </Modal>
    </>
  );
  return { open, viewer };
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
});
