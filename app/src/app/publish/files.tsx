import { File } from "expo-file-system";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ChoiceSheet } from "../../components/ChoiceSheet";
import type { Attachment } from "../../api/types";
import { AttachmentTile } from "../../components/AttachmentTile";
import { useAttachmentViewer } from "../../components/useAttachmentViewer";
import { Body, Button, ErrorText, Secondary } from "../../components/ui";
import { WizardStep } from "../../components/Wizard";
import { t } from "../../i18n";
import { readBytes, uploadBytes } from "../../lib/files";
import { pickDocuments, pickMedia, takeMedia, type PickedFile } from "../../lib/pick";
import { ATTACHMENTS_MAX } from "../../publish/draft";
import { useDraft } from "../../publish/DraftProvider";
import { previewFor, rememberPreview } from "../../publish/previews";
import { useSession } from "../../session/SessionProvider";
import { spacing } from "../../theme";

const MAX_FILE_BYTES = 100 * 1024 * 1024;

export default function PublishFiles() {
  const { draft, update } = useDraft();
  const { api } = useSession();
  const [busy, setBusy] = useState<"media" | "document" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const attachmentViewer = useAttachmentViewer();
  const room = ATTACHMENTS_MAX - draft.attachments.length;

  const upload = async (files: PickedFile[], kind: "media" | "document") => {
    setBusy(kind);
    setError(null);
    const added: Attachment[] = [];
    let tooBig = 0;
    let failed = 0;
    for (const file of files.slice(0, room)) {
      try {
        if (new File(file.uri).size > MAX_FILE_BYTES) {
          tooBig += 1;
          continue;
        }
        const bytes = await readBytes(file.uri);
        const uploaded = await uploadBytes(api, "/me/files", bytes, file.mime);
        rememberPreview(`0x${uploaded.hash}`, file.uri);
        added.push({ hash: `0x${uploaded.hash}`, name: file.name, mime: file.mime, size: bytes.byteLength });
      } catch {
        failed += 1;
      }
    }
    if (added.length > 0) update((d) => ({ ...d, attachments: [...d.attachments, ...added] }));
    setError(tooBig > 0 ? t.publish.fileTooBig(tooBig) : failed > 0 ? t.publish.uploadFailed : null);
    setBusy(null);
  };

  const fromCamera = async () => upload(await takeMedia(), "media");
  const fromGallery = async () => upload(await pickMedia(room), "media");
  const fromDocuments = async () => upload(await pickDocuments(), "document");

  const remove = (hash: string) => update((d) => ({ ...d, attachments: d.attachments.filter((item) => item.hash !== hash) }));

  return (
    <WizardStep step={3} title={t.publish.filesTitle} onNext={() => router.push("/publish/payment")}>
      <Body>{t.publish.filesWarning}</Body>
      <View style={styles.grid}>
        {draft.attachments.map((file) => (
          <AttachmentTile key={file.hash} name={file.name} mime={file.mime} uri={previewFor(file.hash)} onRemove={() => remove(file.hash)} onOpen={() => { const uri = previewFor(file.hash); if (uri) attachmentViewer.open({ uri, mime: file.mime, name: file.name }); }} />
        ))}
      </View>
      <ChoiceSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        choices={[
          { key: "camera", label: t.publish.takeNow, icon: "camera", onPress: () => void fromCamera() },
          { key: "gallery", label: t.publish.fromGallery, icon: "image", onPress: () => void fromGallery() },
        ]}
      />
      {attachmentViewer.viewer}
      {room <= 0 ? <Secondary>{t.publish.maxFiles}</Secondary> : null}
      <Button label={t.publish.addPhotos} variant="outline" icon="image" onPress={() => setSheet(true)} loading={busy === "media"} disabled={busy !== null || room <= 0} />
      <Button label={t.publish.addDocument} variant="outline" icon="file" onPress={fromDocuments} loading={busy === "document"} disabled={busy !== null || room <= 0} />
      {error ? <ErrorText>{error}</ErrorText> : null}
    </WizardStep>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
