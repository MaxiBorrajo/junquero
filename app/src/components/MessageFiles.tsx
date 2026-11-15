import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ChatFile } from "../chat/envelope";
import { formatSize } from "../chat/envelope";
import { writeTempFile } from "../lib/openDocument";
import { Icon } from "./Icon";
import { colors, radius, spacing, text } from "../theme";

const kindLabel = (mime: string): string => (mime.startsWith("image/") ? "Imagen" : mime === "application/pdf" ? "PDF" : mime.startsWith("video/") ? "Video" : "Archivo");

// Descifra la imagen una sola vez y la deja en un archivo temporal para mostrar la miniatura.
function useThumb(file: ChatFile, fetchBytes: (file: ChatFile) => Promise<Uint8Array | null>) {
  const image = file.mime.startsWith("image/") && Boolean(file.hash);
  return useQuery({
    queryKey: ["chat-thumb", file.hash],
    enabled: image,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    queryFn: async () => {
      const bytes = await fetchBytes(file);
      return bytes ? writeTempFile(bytes, file.name) : null;
    },
  }).data;
}

function Photo({ file, fetchBytes, onOpen, style }: { file: ChatFile; fetchBytes: (file: ChatFile) => Promise<Uint8Array | null>; onOpen: (file: ChatFile) => void; style: object }) {
  const uri = useThumb(file, fetchBytes);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={file.name} onPress={() => onOpen(file)} style={[styles.photo, style]}>
      {uri ? <Image source={{ uri }} style={styles.fill} contentFit="cover" /> : <Icon name="image" size={24} color={colors.muted} />}
    </Pressable>
  );
}

function FileRow({ file, mine, onOpen, thumb }: { file: ChatFile; mine: boolean; onOpen: (file: ChatFile) => void; thumb?: string | null }) {
  return (
    <Pressable accessibilityRole="button" disabled={!file.hash} onPress={() => onOpen(file)} style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
      {thumb ? <Image source={{ uri: thumb }} style={styles.rowThumb} contentFit="cover" /> : <Icon name={file.mime.startsWith("image/") ? "image" : "file"} size={20} color={mine ? colors.white : colors.brick} />}
      <View style={{ flex: 1 }}>
        <Text style={[text.secondary, { color: mine ? colors.white : colors.ink }]} numberOfLines={1}>{file.name}</Text>
        <Text style={[text.label, mine && { color: colors.white }]}>{file.size > 0 ? `${kindLabel(file.mime)} · ${formatSize(file.size)}` : kindLabel(file.mime)}</Text>
      </View>
      <Icon name="chevron" size={18} color={mine ? colors.white : colors.muted} />
    </Pressable>
  );
}

export function MessageFiles({ files, mine, fetchBytes, onOpen }: { files: ChatFile[]; mine: boolean; fetchBytes: (file: ChatFile) => Promise<Uint8Array | null>; onOpen: (file: ChatFile) => void }) {
  if (files.length === 0) return null;
  const photos = files.filter((file) => file.mime.startsWith("image/"));
  const others = files.filter((file) => !file.mime.startsWith("image/"));
  return (
    <View style={styles.stack}>
      {photos.length > 0 ? (
        <View style={styles.strip}>
          {photos.map((file, index) => <Photo key={`${file.hash}-${index}`} file={file} fetchBytes={fetchBytes} onOpen={onOpen} style={photos.length === 1 ? styles.big : styles.grid} />)}
        </View>
      ) : null}
      {others.map((file, index) => <FileRow key={`${file.hash}-${index}`} file={file} mine={mine} onOpen={onOpen} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.xs },
  strip: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  photo: { borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.sand, alignItems: "center", justifyContent: "center" },
  fill: { width: "100%", height: "100%" },
  big: { width: 220, height: 160 },
  grid: { width: 104, height: 104 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.sm, padding: spacing.sm },
  rowMine: { backgroundColor: colors.glassSoft },
  rowTheirs: { backgroundColor: colors.background },
  rowThumb: { width: 40, height: 40, borderRadius: radius.sm },
});
