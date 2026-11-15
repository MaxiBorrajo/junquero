import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";
import type { PublicProfile } from "../api/types";
import { API_URL } from "../config";
import { colors, text } from "../theme";

// Foto de perfil o, si no tiene, la inicial del nombre.
export function Avatar({ profile, name, size = 44 }: { profile?: Pick<PublicProfile, "photo" | "name"> | null; name?: string; size?: number }) {
  const label = (profile?.name ?? name ?? "?").trim().charAt(0).toUpperCase() || "?";
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (profile?.photo) return <Image source={{ uri: `${API_URL}${profile.photo.url}` }} style={box} contentFit="cover" cachePolicy="memory-disk" />;
  return (
    <View style={[styles.initial, box]}>
      <Text style={[text.subtitle, { color: colors.brick }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  initial: { backgroundColor: colors.sand, alignItems: "center", justifyContent: "center" },
});
