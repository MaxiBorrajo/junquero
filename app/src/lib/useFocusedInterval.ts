import { useIsFocused } from "expo-router";

// Intervalo de consulta que solo corre mientras la pantalla se está mirando: una pantalla tapada por otra o una pestaña
// que no se ve no gasta pedidos. Al volver a mostrarse, react-query refresca lo que quedó viejo.
export function useFocusedInterval(ms: number): number | false {
  return useIsFocused() ? ms : false;
}
