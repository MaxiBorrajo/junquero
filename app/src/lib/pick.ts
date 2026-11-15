import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";

export interface PickedFile {
  uri: string;
  name: string;
  mime: string;
}

const fromAssets = (assets: ImagePicker.ImagePickerAsset[]): PickedFile[] =>
  assets.map((asset, index) => ({ uri: asset.uri, name: asset.fileName ?? `archivo-${index + 1}`, mime: asset.mimeType ?? (asset.type === "video" ? "video/mp4" : "image/jpeg") }));

export async function takeMedia(): Promise<PickedFile[]> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return [];
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images", "videos"], quality: 0.7 });
  return result.canceled ? [] : fromAssets(result.assets);
}

export async function pickMedia(limit: number): Promise<PickedFile[]> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], allowsMultipleSelection: true, selectionLimit: Math.max(limit, 1), quality: 0.7 });
  return result.canceled ? [] : fromAssets(result.assets);
}

// Adjuntos del chat: solo fotos y PDF.
export async function takePhoto(): Promise<PickedFile[]> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return [];
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 });
  return result.canceled ? [] : fromAssets(result.assets);
}

export async function pickPhotos(limit: number): Promise<PickedFile[]> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: Math.max(limit, 1), quality: 0.7 });
  return result.canceled ? [] : fromAssets(result.assets);
}

export async function pickPdfs(): Promise<PickedFile[]> {
  const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", multiple: true, copyToCacheDirectory: true });
  return result.canceled ? [] : result.assets.map((asset) => ({ uri: asset.uri, name: asset.name, mime: "application/pdf" }));
}

export async function pickDocuments(): Promise<PickedFile[]> {
  const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
  return result.canceled ? [] : result.assets.map((asset) => ({ uri: asset.uri, name: asset.name, mime: asset.mimeType ?? "application/octet-stream" }));
}

export async function takeProfilePhoto(): Promise<PickedFile | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7, allowsEditing: true, aspect: [1, 1] });
  return result.canceled || !result.assets[0] ? null : (fromAssets(result.assets)[0] ?? null);
}
