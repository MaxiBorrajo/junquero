import { useEffect, useState } from "react";

// La hora de ahora en segundos, que se actualiza sola: para mostrar "quedan 27 minutos" sin esperar a que la pantalla se vuelva a pedir datos.
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
