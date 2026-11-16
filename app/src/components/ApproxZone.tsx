import * as Location from "expo-location";
import { useQuery } from "@tanstack/react-query";
import { Linking, Platform, Text } from "react-native";
import type { WorkZone } from "../api/types";
import { t } from "../i18n";
import { Card } from "./Card";
import { Button, Secondary } from "./ui";
import { text } from "../theme";

// Zona aproximada del trabajo: el nombre del barrio o la localidad y un acceso al mapa. Nunca la dirección exacta,
// que las dos partes se pasan por el chat.
async function placeName(zone: WorkZone): Promise<string | null> {
  try {
    const [found] = await Location.reverseGeocodeAsync({ latitude: zone.lat, longitude: zone.lng });
    return found?.district ?? found?.subregion ?? found?.city ?? null;
  } catch {
    return null;
  }
}

const mapUrl = (zone: WorkZone): string =>
  Platform.OS === "ios" ? `http://maps.apple.com/?ll=${zone.lat},${zone.lng}&q=${encodeURIComponent(t.detail.zoneTitle)}` : `geo:${zone.lat},${zone.lng}?q=${zone.lat},${zone.lng}(${encodeURIComponent(t.detail.zoneTitle)})`;

export function ApproxZone({ zone }: { zone: WorkZone }) {
  const name = useQuery({ queryKey: ["zone-name", zone.lat, zone.lng], queryFn: () => placeName(zone), staleTime: Infinity, retry: false });
  return (
    <Card gap="xs">
      <Text style={text.label}>{t.detail.zoneTitle}</Text>
      <Text style={text.subtitle}>{name.data ?? t.detail.zoneUnknown}</Text>
      <Secondary>{t.detail.zoneRadius.replace("{meters}", String(Math.round(zone.radiusM / 50) * 50))}</Secondary>
      <Button label={t.detail.zoneOpenMap} variant="ghost" icon="pin" onPress={() => void Linking.openURL(mapUrl(zone))} />
    </Card>
  );
}
