import { StyleSheet, View } from "react-native";
import { AttachmentTile } from "../components/AttachmentTile";
import { useAttachmentViewer } from "../components/useAttachmentViewer";
import type { PickedFile } from "../lib/pick";
import { spacing } from "../theme";

// Los archivos elegidos y todavía sin subir, como en cualquier adjunto de la app: miniaturas, y al tocar una se abre (foto grande, video
// con reproductor o documento con la app del teléfono). Con `onRemove` cada una lleva su X; sin eso, se usa para revisar antes de enviar.
export function StagedFiles({ files, onRemove }: { files: PickedFile[]; onRemove?: (index: number) => void }) {
  const viewer = useAttachmentViewer();
  if (files.length === 0) return null;
  return (
    <View style={styles.grid}>
      {files.map((file, index) => (
        <AttachmentTile key={`${file.uri}-${index}`} name={file.name} mime={file.mime} uri={file.uri} onOpen={() => viewer.open({ uri: file.uri, mime: file.mime, name: file.name })} onRemove={onRemove ? () => onRemove(index) : undefined} />
      ))}
      {viewer.viewer}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
