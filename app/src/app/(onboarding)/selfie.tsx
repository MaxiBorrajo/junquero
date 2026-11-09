import { CameraView, useCameraPermissions } from "expo-camera";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { Body, Button, ErrorText, Screen, Title } from "../../components/ui";
import { t } from "../../i18n";
import { readBytes, uploadBytes } from "../../lib/files";
import { useSession } from "../../session/SessionProvider";
import { colors, radius, spacing } from "../../theme";

export default function Selfie() {
  const { api, refresh } = useSession();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!permission) return <Screen>{null}</Screen>;

  if (!permission.granted) {
    return (
      <Screen
        footer={
          permission.canAskAgain ? (
            <Button label={t.selfie.take} onPress={() => void requestPermission()} />
          ) : (
            <Button label={t.selfie.openSettings} onPress={() => void Linking.openSettings()} />
          )
        }
      >
        <Title>{t.selfie.title}</Title>
        <Body>{t.selfie.explanation}</Body>
        <ErrorText>{t.selfie.cameraDenied}</ErrorText>
      </Screen>
    );
  }

  const capture = async () => {
    if (capturing) return;
    setCapturing(true);
    setError(null);
    try {
      const picture = await camera.current?.takePictureAsync({ quality: 0.6, skipProcessing: false });
      if (picture) setShot(picture.uri);
    } catch {
      setError(t.common.genericError);
    } finally {
      setCapturing(false);
    }
  };

  const send = async () => {
    if (!shot) return;
    setBusy(true);
    setError(null);
    try {
      await uploadBytes(api, "/me/selfie", await readBytes(shot), "image/jpeg");
      await refresh();
      router.replace("/done");
    } catch {
      setError(t.selfie.uploadFailed);
    } finally {
      setBusy(false);
    }
  };

  if (shot) {
    return (
      <Screen
        footer={
          <>
            <Button label={t.selfie.send} onPress={send} loading={busy} />
            <Button label={t.selfie.repeat} variant="ghost" onPress={() => setShot(null)} disabled={busy} />
          </>
        }
      >
        <Title>{t.selfie.reviewTitle}</Title>
        <Image source={{ uri: shot }} style={styles.preview} contentFit="cover" />
        {error ? <ErrorText>{error}</ErrorText> : null}
      </Screen>
    );
  }

  return (
    <Screen footer={<Button label={t.selfie.take} onPress={capture} loading={capturing} />}>
      <Title>{t.selfie.title}</Title>
      <Body>{t.selfie.explanation}</Body>
      <View style={styles.frame}>
        <CameraView ref={camera} style={styles.camera} facing="front" />
        <View pointerEvents="none" style={styles.guide} />
      </View>
      {error ? <ErrorText>{error}</ErrorText> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  frame: { aspectRatio: 3 / 4, borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.ink },
  camera: { flex: 1 },
  guide: { position: "absolute", top: "12%", bottom: "12%", left: "18%", right: "18%", borderWidth: 3, borderColor: colors.sand, borderRadius: 999 },
  preview: { aspectRatio: 3 / 4, borderRadius: radius.lg, marginBottom: spacing.sm },
});
