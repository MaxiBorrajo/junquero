import { Camera, GeoJSONSource, Images, Layer, Map, NativeUserLocation, type CameraRef, type GeoJSONSourceRef, type MapRef, type PressEvent, type ViewStateChangeEvent } from "@maplibre/maplibre-react-native";
import * as Location from "expo-location";
import { router } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import type { NativeSyntheticEvent } from "react-native";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Changa } from "../../api/types";
import { ChangaCard } from "../../components/ChangaCard";
import { Icon, type IconName } from "../../components/Icon";
import { PullSpinner } from "../../components/PullSpinner";
import { SearchField } from "../../components/SearchField";
import { Button, ErrorText, Secondary } from "../../components/ui";
import { DEFAULT_CENTER, MAP_STYLE_URL } from "../../config";
import { useFilters } from "../../data/filterStore";
import { countUnread, useLastSeen, useNotifications } from "../../data/useNotifications";
import { useChangasInBounds, useRemoteChangas } from "../../data/useChangas";
import { activeFilterCount } from "../../lib/filters";
import { t } from "../../i18n";
import { PIN_IMAGES } from "../../lib/pinImages";
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH, roundBounds, toFeatures, type Bounds } from "../../lib/changaMap";
import { distanceM } from "../../lib/geo";
import { matchesQuery } from "../../lib/search";
import { usePullGesture } from "../../lib/usePullGesture";
import { useManualRefresh } from "../../lib/useManualRefresh";
import { useSession } from "../../session/SessionProvider";
import { colors, fonts, radius, spacing, text } from "../../theme";

type Mode = "map" | "list";

const TEXT_OFFSET = [
  "match",
  ["get", "size"],
  ...Array.from({ length: PIN_MAX_LENGTH - PIN_MIN_LENGTH + 1 }, (_, index) => {
    const length = PIN_MIN_LENGTH + index;
    return [String(length), ["literal", [((10.5 - 4 * length) * 0.85) / 12, 0]]];
  }).flat(),
  ["literal", [0, 0]],
] as never;


export default function MapScreen() {
  const { profile } = useSession();
  const start = profile ? { lat: profile.work.lat, lng: profile.work.lng } : DEFAULT_CENTER;
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [center, setCenter] = useState(start);
  const [mode, setMode] = useState<Mode>("map");
  const [selected, setSelected] = useState<number | null>(null);
  const [located, setLocated] = useState(false);
  const [query, setQuery] = useState("");
  const notifications = useNotifications();
  const lastSeen = useLastSeen();
  const unread = countUnread(notifications.data ?? [], lastSeen.data ?? 0);
  const camera = useRef<CameraRef>(null);
  const source = useRef<GeoJSONSourceRef>(null);
  const map = useRef<MapRef>(null);

  const filters = useFilters();
  const nearby = useChangasInBounds(bounds, filters);
  const remote = useRemoteChangas(filters);
  const refresh = useManualRefresh([() => nearby.refetch(), () => remote.refetch()]);
  const pull = usePullGesture(refresh);
  const changas = nearby.data ?? [];
  const features = useMemo(() => toFeatures(changas), [changas]);
  const selectedChanga = selected === null ? null : (changas.find((item) => item.id === selected) ?? null);

  const onRegionChange = useCallback((event: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    const { bounds: b, center: c } = event.nativeEvent;
    setBounds(roundBounds({ west: b[0], south: b[1], east: b[2], north: b[3] }));
    setCenter({ lat: c[1], lng: c[0] });
  }, []);

  const onMapPress = useCallback(async (event: NativeSyntheticEvent<PressEvent>) => {
    const found = await map.current?.queryRenderedFeatures(event.nativeEvent.point, { layers: ["pin", "clusters"] });
    const feature = found?.[0];
    if (!feature) {
      setSelected(null);
      return;
    }
    const properties = feature.properties ?? {};
    if (properties.cluster) {
      const zoom = await source.current?.getClusterExpansionZoom(Number(properties.cluster_id));
      const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
      camera.current?.easeTo({ center: [lng, lat], zoom: zoom ?? 14, duration: 300 });
      return;
    }
    setSelected(Number(properties.id));
  }, []);

  const goToMyLocation = useCallback(async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return;
    try {
      const position = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      setLocated(true);
      camera.current?.easeTo({ center: [position.coords.longitude, position.coords.latitude], zoom: 14, duration: 500 });
    } catch {}
  }, []);

  const open = (changa: Changa) => router.push({ pathname: "/changa/[specHash]", params: { specHash: changa.specHash } });
  const sorted = useMemo(
    () =>
      changas
        .filter((item) => matchesQuery(query, [item.spec.title, item.spec.description, t.publish.categories[item.spec.category]]))
        .sort((a, b) => dist(a, center) - dist(b, center)),
    [changas, center, query],
  );

  return (
    <View style={styles.root}>
      {mode === "map" ? (
        <Map ref={map} style={styles.map} mapStyle={MAP_STYLE_URL} logo={false} compass={false} attributionPosition={{ bottom: 78, left: 8 }} onRegionDidChange={onRegionChange} onPress={onMapPress}>
          <Camera ref={camera} initialViewState={{ center: [start.lng, start.lat], zoom: 13 }} />
          <Images images={PIN_IMAGES} />
          {located ? <NativeUserLocation /> : null}
          <GeoJSONSource ref={source} id="changas" data={features} cluster clusterRadius={50}>
            <Layer id="clusters" type="circle" filter={["has", "point_count"]} paint={{ "circle-color": colors.brick, "circle-radius": ["step", ["get", "point_count"], 18, 10, 24, 30, 30], "circle-stroke-color": colors.white, "circle-stroke-width": 2 }} />
            <Layer id="cluster-count" type="symbol" filter={["has", "point_count"]} layout={{ "text-field": ["get", "point_count_abbreviated"], "text-size": 14, "text-font": ["Noto Sans Bold"] }} paint={{ "text-color": colors.white }} />
            <Layer
              id="pin"
              type="symbol"
              filter={["!", ["has", "point_count"]]}
              layout={{
                "icon-image": ["concat", ["case", ["==", ["get", "id"], selected ?? -1], "pin-on-", "pin-"], ["get", "size"]],
                "icon-size": 0.85,
                "icon-allow-overlap": true,
                "text-field": ["get", "label"],
                "text-size": 12,
                "text-font": ["Noto Sans Bold"],
                "text-anchor": "left",
                "text-offset": TEXT_OFFSET,
                "text-allow-overlap": true,
                "symbol-sort-key": ["case", ["==", ["get", "id"], selected ?? -1], 1, 0],
              }}
              paint={{ "text-color": colors.white }}
            />
          </GeoJSONSource>
        </Map>
      ) : (
        <SafeAreaView style={styles.list}>
          <FlatList
            contentContainerStyle={styles.listContent}
            {...pull}
          ListHeaderComponent={<PullSpinner active={refresh.refreshing} />}
            data={sorted}
            keyExtractor={(item) => String(item.id)}
            ListEmptyComponent={<Secondary>{t.map.empty}</Secondary>}
            renderItem={({ item }) => <ChangaCard changa={item} onPress={() => open(item)} distanceM={item.spec.area ? distanceM(center, item.spec.area) : undefined} />}
          />
        </SafeAreaView>
      )}

      <SafeAreaView style={styles.top} pointerEvents="box-none">
        <View style={styles.topRow} pointerEvents="box-none">
          <Pill icon={mode === "map" ? "list" : "map"} label={mode === "map" ? t.map.list : t.map.mapView} onPress={() => setMode(mode === "map" ? "list" : "map")} />
          <Pill icon="filter" label={activeFilterCount(filters) > 0 ? `${t.filters.open} · ${activeFilterCount(filters)}` : t.filters.open} onPress={() => router.push("/filters")} />
          {profile ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t.notifications.open} onPress={() => router.push("/notifications")} style={styles.bell}>
              <Icon name="bell" size={20} color={colors.ink} />
              {unread > 0 ? (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>{unread > 9 ? "9+" : unread}</Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}
          {remote.data && remote.data.length > 0 ? <Pill icon="globe" label={`${t.map.remoteChip} · ${remote.data.length}`} onPress={() => router.push("/remote")} /> : null}
        </View>
        {mode === "list" ? <SearchField value={query} onChange={setQuery} placeholder={t.map.searchList} /> : null}
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

      {mode === "map" ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t.map.refresh} onPress={refresh.onRefresh} style={[styles.locate, selectedChanga ? styles.refreshRaised : styles.refreshButton]}>
          {refresh.refreshing ? <ActivityIndicator color={colors.brick} /> : <Icon name="refresh" size={22} color={colors.brick} />}
        </Pressable>
      ) : null}

      {mode === "map" ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t.map.myLocation} onPress={goToMyLocation} style={[styles.locate, selectedChanga ? styles.locateRaised : null]}>
          <Icon name="locate" size={24} color={colors.brick} />
        </Pressable>
      ) : null}

      <View style={styles.publish}>
        <Button label={t.tabs.publish} icon="plus" onPress={() => router.push("/publish")} />
      </View>
    </View>
  );
}

const dist = (changa: Changa, from: { lat: number; lng: number }): number => (changa.spec.area ? distanceM(from, changa.spec.area) : Number.MAX_SAFE_INTEGER);

function Pill({ label, icon, onPress }: { label: string; icon: IconName; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.pill}>
      <Icon name={icon} size={15} color={colors.ink} />
      <Text style={styles.pillLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.map },
  map: { flex: 1 },
  list: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.md, paddingTop: 140, paddingBottom: 96, gap: spacing.sm },
  top: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: spacing.md, gap: spacing.sm },
  topRow: { flexDirection: "row", gap: spacing.sm },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, height: 34, backgroundColor: colors.white, borderRadius: radius.pill, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.line },
  pillLabel: { ...text.label, fontSize: 13, includeFontPadding: false, textAlignVertical: "center" },
  empty: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md },
  preview: { position: "absolute", left: spacing.md, right: spacing.md, bottom: 88 },
  bell: { marginLeft: "auto", width: 34, height: 34, borderRadius: 17, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  bellBadge: { position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.brick, borderWidth: 1.5, borderColor: colors.white, alignItems: "center", justifyContent: "center" },
  bellBadgeText: { color: colors.white, fontSize: 10, lineHeight: 12, fontFamily: fonts.bold, includeFontPadding: false },
  locate: { position: "absolute", right: spacing.md, bottom: 88, width: 48, height: 48, borderRadius: 24, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  locateRaised: { bottom: 200 },
  refreshButton: { bottom: 144 },
  refreshRaised: { bottom: 256 },
  publish: { position: "absolute", left: spacing.md, right: spacing.md, bottom: spacing.md },
});
