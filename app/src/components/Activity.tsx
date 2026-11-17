import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts, radius, spacing } from "../theme";

export interface ActivityHandle {
  update: (label: string) => void;
}

export type Track = <T>(label: string, work: (handle: ActivityHandle) => Promise<T>) => Promise<T>;

// Sin proveedor (en pruebas) la tarea corre igual, sin indicador.
const NO_PROVIDER: Track = (_label, work) => work({ update: () => undefined });
const ActivityContext = createContext<Track>(NO_PROVIDER);

// Quien sigue trabajando en segundo plano o esperando a la billetera o a la red registra su tarea acá.
export const useActivity = (): Track => useContext(ActivityContext);

// Tareas rápidas no hacen parpadear el indicador: aparece recién si pasa este tiempo.
export const SHOW_AFTER_MS = 400;

interface Task {
  id: number;
  label: string;
}

// Indicador de "se está haciendo algo": una pastilla arriba con la etapa en curso. No es un aviso de resultado (eso es el toast).
export function ActivityProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [visible, setVisible] = useState(false);
  const counter = useRef(0);
  const insets = useSafeAreaInsets();

  const track = useCallback<Track>(async (label, work) => {
    counter.current += 1;
    const id = counter.current;
    setTasks((current) => [...current, { id, label }]);
    try {
      return await work({ update: (next) => setTasks((current) => current.map((task) => (task.id === id ? { ...task, label: next } : task))) });
    } finally {
      setTasks((current) => current.filter((task) => task.id !== id));
    }
  }, []);

  const busy = tasks.length > 0;
  useEffect(() => {
    if (!busy) return setVisible(false);
    const timer = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [busy]);

  const last = tasks[tasks.length - 1];
  const label = last ? (tasks.length > 1 ? `${last.label} · +${tasks.length - 1}` : last.label) : "";
  const value = useMemo(() => track, [track]);

  return (
    <ActivityContext.Provider value={value}>
      {children}
      {visible && last ? (
        <View pointerEvents="none" style={[styles.wrap, { top: insets.top + spacing.sm }]}>
          <View style={styles.pill} accessibilityLiveRegion="polite" accessibilityRole="progressbar">
            <ActivityIndicator size="small" color={colors.brick} />
            <Text style={styles.text} numberOfLines={2}>{label}</Text>
          </View>
        </View>
      ) : null}
    </ActivityContext.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: spacing.md, right: spacing.md, alignItems: "center" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    maxWidth: 520,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    elevation: 6,
    shadowColor: colors.ink,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  text: { flexShrink: 1, fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
});
