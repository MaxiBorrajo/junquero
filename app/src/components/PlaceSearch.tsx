import { useEffect, useRef, useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import { SearchField } from "./SearchField";
import { t } from "../i18n";
import type { LatLng } from "../lib/geo";
import { searchPlaces, type Place } from "../lib/geocode";
import { colors, radius, spacing, text } from "../theme";

const MIN_CHARS = 3;
const DEBOUNCE_MS = 350;

// Buscador de direcciones y lugares: al elegir un resultado avisa con sus coordenadas.
export function PlaceSearch({ near, onSelect, limit = 5 }: { near: LatLng; onSelect: (place: Place) => void; limit?: number }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[] | null>(null);
  const [failed, setFailed] = useState(false);
  const chosen = useRef<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (chosen.current === trimmed) return;
    if (trimmed.length < MIN_CHARS) {
      setResults(null);
      setFailed(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchPlaces(trimmed, near, limit, controller.signal)
        .then((places) => {
          setResults(places);
          setFailed(false);
        })
        .catch((error: unknown) => {
          if ((error as { name?: string }).name === "AbortError") return;
          setResults(null);
          setFailed(true);
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `near` se usa solo para sesgar resultados; no debe relanzar la búsqueda al mover el mapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, limit]);

  const pick = (place: Place) => {
    Keyboard.dismiss();
    chosen.current = place.name.trim();
    setQuery(place.name);
    setResults(null);
    onSelect(place);
  };

  return (
    <View style={styles.wrap}>
      <SearchField value={query} onChange={(value) => { chosen.current = null; setQuery(value); }} placeholder={t.common.searchPlace} />
      {results && results.length > 0 ? (
        <View style={styles.list}>
          {results.map((place, index) => (
            <Pressable key={place.id} accessibilityRole="button" onPress={() => pick(place)} style={[styles.row, index > 0 && styles.rowBorder]}>
              <Text style={text.label} numberOfLines={1}>
                {place.name}
              </Text>
              <Text style={text.secondary} numberOfLines={1}>
                {place.detail}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {results && results.length === 0 ? (
        <View style={styles.list}>
          <Text style={[text.secondary, styles.row]}>{t.common.noPlaces}</Text>
        </View>
      ) : null}
      {failed ? (
        <View style={styles.list}>
          <Text style={[text.secondary, styles.row]}>{t.common.placesError}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  list: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  row: { paddingHorizontal: spacing.md, paddingVertical: 10 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.line },
});
