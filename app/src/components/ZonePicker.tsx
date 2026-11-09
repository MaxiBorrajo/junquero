import { Camera, GeoJSONSource, Layer, Map, type CameraRef, type ViewStateChangeEvent } from "@maplibre/maplibre-react-native";
import { useEffect, useMemo, useRef } from "react";
import type { NativeSyntheticEvent } from "react-native";
import { StyleSheet, View } from "react-native";
import { Icon } from "./Icon";
import { MAP_STYLE_URL } from "../config";
import { circlePolygon, distanceM, type LatLng } from "../lib/geo";
import { colors, radius } from "../theme";

const MOVED_M = 5;
const PIN_SIZE = 40;

export const zoomForRadius = (radiusM: number): number => Math.log2(9_600_000 / Math.max(radiusM, 500));

export function ZonePicker({ center, radiusM, onChange, height = 300 }: { center: LatLng; radiusM: number; onChange: (center: LatLng) => void; height?: number }) {
  const camera = useRef<CameraRef>(null);
  const reported = useRef<LatLng>(center);
  const area = useMemo(() => circlePolygon(center, Math.max(radiusM, 1)), [center, radiusM]);

  useEffect(() => {
    if (distanceM(reported.current, center) < MOVED_M) return;
    reported.current = center;
    camera.current?.easeTo({ center: [center.lng, center.lat], duration: 300 });
  }, [center]);

  useEffect(() => {
    if (radiusM > 0) camera.current?.easeTo({ center: [reported.current.lng, reported.current.lat], zoom: zoomForRadius(radiusM), duration: 300 });
  }, [radiusM]);

  const onRegionChange = (event: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    if (!event.nativeEvent.userInteraction) return;
    const [lng, lat] = event.nativeEvent.center;
    reported.current = { lat, lng };
    onChange({ lat, lng });
  };

  return (
    <View style={[styles.frame, { height }]}>
      <Map style={styles.map} mapStyle={MAP_STYLE_URL} onRegionDidChange={onRegionChange}>
        <Camera ref={camera} initialViewState={{ center: [center.lng, center.lat], zoom: radiusM > 0 ? zoomForRadius(radiusM) : 15 }} />
        {radiusM > 0 ? (
          <GeoJSONSource id="zone" data={area}>
            <Layer id="zone-fill" type="fill" paint={{ "fill-color": colors.brick, "fill-opacity": 0.18 }} />
            <Layer id="zone-line" type="line" paint={{ "line-color": colors.brick, "line-width": 2 }} />
          </GeoJSONSource>
        ) : null}
      </Map>
      <View style={styles.pin} pointerEvents="none">
        <Icon name="pin" size={PIN_SIZE} color={colors.brick} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.map },
  map: { flex: 1 },
  pin: { position: "absolute", top: "50%", left: "50%", marginLeft: -PIN_SIZE / 2, marginTop: -PIN_SIZE, width: PIN_SIZE, height: PIN_SIZE },
});
