import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, ErrorText, Field, Screen, Secondary, Title } from "../../components/ui";
import { RadiusStepper } from "../../components/RadiusStepper";
import { ZonePicker } from "../../components/ZonePicker";
import { API_URL, DEFAULT_CENTER } from "../../config";
import { t } from "../../i18n";
import { takeProfilePhoto } from "../../lib/pick";
import { readBytes, uploadBytes, type Uploaded } from "../../lib/files";
import type { LatLng } from "../../lib/geo";
import { isValidName, normalizeName } from "../../lib/validation";
import { useSession } from "../../session/SessionProvider";
import { colors, radius, spacing, text } from "../../theme";

export default function ProfileSetup() {
  const { api, profile, refresh } = useSession();
  const [name, setName] = useState(profile?.name ?? "");
  const [center, setCenter] = useState<LatLng>(profile ? { lat: profile.work.lat, lng: profile.work.lng } : DEFAULT_CENTER);
  const [radiusM, setRadiusM] = useState(profile?.work.radiusM ?? 5000);
  const [photo, setPhoto] = useState<{ uri: string; mime: string } | null>(null);
  const [keepPhoto, setKeepPhoto] = useState(profile?.photo ?? null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const nameError = touched && !isValidName(name) ? t.profile.nameInvalid : null;

  const useLocation = async () => {
    setMessage(null);
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      setMessage(t.profile.locationDenied);
      return;
    }
    try {
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCenter({ lat: position.coords.latitude, lng: position.coords.longitude });
    } catch {
      setMessage(t.profile.locationDenied);
    }
  };

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setPhoto({ uri: asset.uri, mime: asset.mimeType ?? "image/jpeg" });
    setKeepPhoto(null);
  };

  const snapPhoto = async () => {
    const taken = await takeProfilePhoto();
    if (!taken) return;
    setPhoto({ uri: taken.uri, mime: taken.mime });
    setKeepPhoto(null);
  };

  const save = async () => {
    setTouched(true);
    if (!isValidName(name)) return;
    setBusy(true);
    setMessage(null);
    try {
      let photoHash: string | undefined = keepPhoto?.hash;
      if (photo) {
        const uploaded = await uploadBytes(api, "/me/files", await readBytes(photo.uri), photo.mime);
        photoHash = (uploaded as Uploaded).hash;
      }
      await api.send("PUT", "/me/profile", {
        name: normalizeName(name),
        categories: profile?.categories ?? [],
        work: { lat: center.lat, lng: center.lng, radiusM },
        ...(photoHash ? { photo: photoHash } : {}),
      });
      await refresh();
      router.replace("/");
    } catch {
      setMessage(t.common.genericError);
    } finally {
      setBusy(false);
    }
  };

  const shownPhoto = photo?.uri ?? (keepPhoto ? `${API_URL}${keepPhoto.url}` : null);

  return (
    <Screen footer={<Button label={t.common.next} onPress={save} loading={busy} />}>
      <Title>{t.profile.title}</Title>
      <Field label={t.profile.name} value={name} onChangeText={setName} onBlur={() => setTouched(true)} maxLength={60} hint={t.profile.nameHint} error={nameError} autoCapitalize="words" />
      <View style={styles.photoRow}>
        {shownPhoto ? <Image source={{ uri: shownPhoto }} style={styles.photo} /> : <View style={[styles.photo, styles.photoEmpty]} />}
        <View style={styles.photoActions}>
          <Text style={text.label}>{t.profile.photo}</Text>
          <Button label={t.profile.takePhoto} variant="secondary" onPress={snapPhoto} />
          <Button label={t.profile.pickPhoto} variant="ghost" onPress={pickPhoto} />
          {shownPhoto ? (
            <Button
              label={t.profile.removePhoto}
              variant="ghost"
              onPress={() => {
                setPhoto(null);
                setKeepPhoto(null);
              }}
            />
          ) : null}
        </View>
      </View>
      <Text style={text.subtitle}>{t.profile.zone}</Text>
      <Secondary>{t.profile.zoneHint}</Secondary>
      <ZonePicker center={center} radiusM={radiusM} onChange={setCenter} />
      <RadiusStepper value={radiusM} onChange={setRadiusM} />
      <Button label={t.profile.useMyLocation} variant="ghost" onPress={useLocation} />
      {message ? <ErrorText>{message}</ErrorText> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  photoRow: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  photoActions: { flex: 1, gap: spacing.xs },
  photo: { width: 88, height: 88, borderRadius: radius.pill },
  photoEmpty: { backgroundColor: colors.map },
});
