import { Camera, GeoJSONSource, Layer, Map, type CameraRef, type GeoJSONSourceRef, type PressEventWithFeatures, type ViewStateChangeEvent } from "@maplibre/maplibre-react-native";
import { router } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import type { NativeSyntheticEvent } from "react-native";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Changa } from "../../api/types";
import { ChangaCard } from "../../components/ChangaCard";
import { Button, ErrorText, Secondary } from "../../components/ui";
import { DEFAULT_CENTER, MAP_STYLE_URL } from "../../config";
import { useChangasInBounds, useRemoteChangas } from "../../data/useChangas";
import { t } from "../../i18n";
import { roundBounds, toFeatures, type Bounds } from "../../lib/changaMap";
import { distanceM } from "../../lib/geo";
import { useSession } from "../../session/SessionProvider";
import { colors, radius, spacing, text } from "../../theme";

type Mode = "map" | "list";

export default function MapScreen() {
  const { profile } = useSession();
  const start = profile ? { lat: profile.work.lat, lng: profile.work.lng } : DEFAULT_CENTER;
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [center, setCenter] = useState(start);
  const [mode, setMode] = useState<Mode>("map");
  const [selected, setSelected] = useState<number | null>(null);
  const camera = useRef<CameraRef>(null);
  const source = useRef<GeoJSONSourceRef>(null);

  const nearby = useChangasInBounds(bounds);
  const remote = useRemoteChangas();
  const changas = nearby.data ?? [];
  const features = useMemo(() => toFeatures(changas), [changas]);
  const selectedChanga = selected === null ? null : (changas.find((item) => item.id === selected) ?? null);

  const onRegionChange = useCallback((event: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    const { bounds: b, center: c } = event.nativeEvent;
    setBounds(roundBounds({ west: b[0], south: b[1], east: b[2], north: b[3] }));
    setCenter({ lat: c[1], lng: c[0] });
  }, []);

  const onPressSource = useCallback(async (event: NativeSyntheticEvent<PressEventWithFeatures>) => {
    const feature = event.nativeEvent.features[0];
    if (!feature) return;
    const properties = feature.properties ?? {};
    if (properties.cluster) {
      const zoom = await source.current?.getClusterExpansionZoom(Number(properties.cluster_id));
      const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
      camera.current?.easeTo({ center: [lng, lat], zoom: zoom ?? 14, duration: 300 });
      return;
    }
    setSelected(Number(properties.id));
  }, []);

  const open = (changa: Changa) => router.push({ pathname: "/changa/[specHash]", params: { specHash: changa.specHash } });
  const sorted = useMemo(() => [...changas].sort((a, b) => dist(a, center) - dist(b, center)), [changas, center]);

  return (
    <View style={styles.root}>
      {mode === "map" ? (
        <Map style={styles.map} mapStyle={MAP_STYLE_URL} onRegionDidChange={onRegionChange} onPress={() => setSelected(null)}>
          <Camera ref={camera} initialViewState={{ center: [start.lng, start.lat], zoom: 13 }} />
          <GeoJSONSource ref={source} id="changas" data={features} cluster clusterRadius={50} onPress={onPressSource}>
            <Layer id="zones" type="circle" filter={["!", ["has", "point_count"]]} paint={{ "circle-color": colors.brick, "circle-opacity": 0.18, "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 10, 2.4, 18, 612] }} />
            <Layer id="clusters" type="circle" filter={["has", "point_count"]} paint={{ "circle-color": colors.brick, "circle-radius": ["step", ["get", "point_count"], 18, 10, 24, 30, 30] }} />
            <Layer id="cluster-count" type="symbol" filter={["has", "point_count"]} layout={{ "text-field": ["get", "point_count_abbreviated"], "text-size": 14, "text-font": ["Noto Sans Bold"] }} paint={{ "text-color": colors.white }} />
            <Layer id="pin" type="circle" filter={["!", ["has", "point_count"]]} paint={{ "circle-color": colors.sand, "circle-radius": 16, "circle-stroke-color": colors.brick, "circle-stroke-width": 2 }} />
            <Layer id="pin-label" type="symbol" filter={["!", ["has", "point_count"]]} layout={{ "text-field": ["get", "label"], "text-size": 12, "text-font": ["Noto Sans Bold"], "text-allow-overlap": true }} paint={{ "text-color": colors.ink }} />
          </GeoJSONSource>
        </Map>
      ) : (
        <SafeAreaView style={styles.list}>
          <FlatList
            contentContainerStyle={styles.listContent}
            data={sorted}
            keyExtractor={(item) => String(item.id)}
            ListEmptyComponent={<Secondary>{t.map.empty}</Secondary>}
            renderItem={({ item }) => <ChangaCard changa={item} onPress={() => open(item)} distanceM={item.spec.area ? distanceM(center, item.spec.area) : undefined} />}
          />
        </SafeAreaView>
      )}

      <SafeAreaView style={styles.top} pointerEvents="box-none">
        <View style={styles.topRow} pointerEvents="box-none">
          <Pill label={mode === "map" ? t.map.list : t.map.mapView} onPress={() => setMode(mode === "map" ? "list" : "map")} />
          {remote.data && remote.data.length > 0 ? <Pill label={`${t.map.remoteChip} · ${remote.data.length}`} onPress={() => router.push("/remote")} /> : null}
        </View>
        {nearby.isError ? <ErrorText>{t.map.loadError}</ErrorText> : null}
        {mode === "map" && nearby.isSuccess && changas.length === 0 ? (
          <View style={styles.empty}>
            <Text style={text.body}>{t.map.empty}</Text>
          </View>
        ) : null}
      </SafeAreaView>

      {mode === "map" && selectedChanga ? (
        <View style={styles.preview}>
          <ChangaCard changa={selectedChanga} distanceM={selectedChanga.spec.area ? distanceM(center, selectedChanga.spec.area) : undefined} onPress={() => open(selectedChanga)} />
        </View>
      ) : null}

      <View style={styles.publish}>
        <Button label={t.tabs.publish} onPress={() => router.push("/publish")} />
      </View>
    </View>
  );
}

const dist = (changa: Changa, from: { lat: number; lng: number }): number => (changa.spec.area ? distanceM(from, changa.spec.area) : Number.MAX_SAFE_INTEGER);

function Pill({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.pill}>
      <Text style={text.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.map },
  map: { flex: 1 },
  list: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.md, paddingTop: 72, paddingBottom: 96, gap: spacing.sm },
  top: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: spacing.md, gap: spacing.sm },
  topRow: { flexDirection: "row", gap: spacing.sm },
  pill: { backgroundColor: colors.white, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.line },
  empty: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md },
  preview: { position: "absolute", left: spacing.md, right: spacing.md, bottom: 88 },
  publish: { position: "absolute", left: spacing.md, right: spacing.md, bottom: spacing.md },
});
