import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ChoiceSheet } from "../components/ChoiceSheet";
import { Button } from "../components/ui";
import { t } from "../i18n";
import { pickDocuments, pickMedia, takeMedia, type PickedFile } from "../lib/pick";
import { spacing, text } from "../theme";
import { StagedFiles } from "./StagedFiles";

// Máximo de archivos que se suben junto al relato: la tanda es de MAX_BATCH_ITEMS con una sola firma y el relato ocupa un lugar.
export const MAX_EXTRA_FILES = 19;

// Elige fotos, videos y documentos para sumar al relato de un reclamo. Los archivos se suben junto con el relato, con una sola firma, y
// siguen las mismas reglas que las pruebas de un trabajo (cifrados, hasta 40 por persona en total).
export function EvidencePicker({ files, onChange, showTitle = true }: { files: PickedFile[]; onChange: (files: PickedFile[]) => void; showTitle?: boolean }) {
  const [sheet, setSheet] = useState(false);
  const room = Math.max(0, MAX_EXTRA_FILES - files.length);
  const add = (picked: PickedFile[]) => onChange([...files, ...picked.slice(0, room)]);

  return (
    <View style={styles.box}>
      {showTitle ? <Text style={text.label}>{t.dispute.evidenceTitle}</Text> : null}
      <Text style={text.secondary}>{t.dispute.evidenceHint}</Text>
      <Button label={t.order.addPhoto} icon="camera" variant="outline" onPress={() => setSheet(true)} disabled={room === 0} />
      <Button label={t.order.addFile} icon="file" variant="ghost" onPress={async () => add(await pickDocuments())} disabled={room === 0} />
      {files.length > 0 ? (
        <>
          <Text style={text.secondary}>{files.length === 1 ? t.order.requirementStagedOne : t.order.requirementStagedMany.replace("{n}", String(files.length))}</Text>
          <StagedFiles files={files} onRemove={(index) => onChange(files.filter((_file, position) => position !== index))} />
        </>
      ) : null}
      <ChoiceSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        choices={[
          { key: "camera", label: t.publish.takeNow, icon: "camera", onPress: () => void takeMedia().then(add) },
          { key: "gallery", label: t.publish.fromGallery, icon: "image", onPress: () => void pickMedia(Math.min(10, room)).then(add) },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm },
});
