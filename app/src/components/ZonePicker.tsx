import { Camera, GeoJSONSource, Layer, Map, type PressEvent } from "@maplibre/maplibre-react-native";
import { useMemo } from "react";
import type { NativeSyntheticEvent } from "react-native";
import { StyleSheet, View } from "react-native";
import { MAP_STYLE_URL } from "../config";
import { circlePolygon, type LatLng } from "../lib/geo";
import { colors, radius } from "../theme";

export function ZonePicker({ center, radiusM, onChange }: { center: LatLng; radiusM: number; onChange: (center: LatLng) => void }) {
  const area = useMemo(() => circlePolygon(center, Math.max(radiusM, 1)), [center, radiusM]);
  const zoom = Math.max(8, 15 - Math.log2(Math.max(radiusM, 500) / 500));
  return (
    <View style={styles.frame}>
      <Map
        style={styles.map}
        mapStyle={MAP_STYLE_URL}
        onPress={(event: NativeSyntheticEvent<PressEvent>) => {
          const [lng, lat] = event.nativeEvent.lngLat;
          onChange({ lat, lng });
        }}
      >
        <Camera center={[center.lng, center.lat]} zoom={zoom} />
        {radiusM > 0 ? (
          <GeoJSONSource id="zone" data={area}>
            <Layer id="zone-fill" type="fill" paint={{ "fill-color": colors.brick, "fill-opacity": 0.2 }} />
            <Layer id="zone-line" type="line" paint={{ "line-color": colors.brick, "line-width": 2 }} />
          </GeoJSONSource>
        ) : null}
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { height: 260, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.map },
  map: { flex: 1 },
});
