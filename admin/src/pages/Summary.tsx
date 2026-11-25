import { useLoad } from "../hooks";
import { API_URL } from "../lib/config";
import { formatAmount, formatDate, STATUS_LABELS } from "../lib/format";
import { useSession } from "../session";

interface SummaryData {
  changasByStatus: Record<string, number>;
  escrowVolume: number;
  usersBySelfie: Record<string, number>;
  activeApplications: number;
  pendingAgreements: number;
  relaysLastHour: number;
  relaysLastDay: number;
  queuedNotifications: number;
  newUsersLastWeek: number;
  lastEventBlock: number | null;
  lastEventAt: number | null;
}

interface RelayerData {
  address: string;
  balanceWei: string | null;
  level: "ok" | "low" | "empty" | "unknown";
}

// Wei a ETH con 4 decimales, sin pasar por números de coma flotante.
function formatEth(wei: string | null): string {
  if (wei === null) return "-";
  const value = BigInt(wei);
  const whole = value / 10n ** 18n;
  const frac = ((value % 10n ** 18n) / 10n ** 14n).toString().padStart(4, "0");
  return `${whole}.${frac} ETH`;
}

const RELAYER_NOTICE: Record<string, string> = {
  empty: "El relayer se quedó sin ETH: la app no puede enviar ninguna acción ni correr las tareas automáticas (sorteos, liberaciones). Recargalo ya.",
  low: "Al relayer le queda poco ETH. Recargalo antes de que se agote.",
  unknown: "No se pudo leer el saldo del relayer. Revisá la conexión con la red.",
};

export function Summary() {
  const { api } = useSession();
  const summary = useLoad(() => api.get<SummaryData>("/admin/summary"), [api]);
  const health = useLoad(() => fetch(`${API_URL}/health`).then((r) => r.json() as Promise<{ ok: boolean; lastIndexedBlock: number }>), []);
  const relayer = useLoad(() => api.get<RelayerData>("/admin/relayer"), [api]);
  const data = summary.data;
  const notice = relayer.data && relayer.data.level !== "ok" ? RELAYER_NOTICE[relayer.data.level] : null;

  return (
    <>
      <h2>Resumen</h2>
      {summary.error ? <div className="error">{summary.error}</div> : null}
      {notice ? <div className="error" role="alert">{notice}</div> : null}
      {data ? (
        <>
          <div className="cards">
            <Card label="Pago en garantía (USDC)" value={formatAmount(data.escrowVolume)} />
            <Card label="Usuarios nuevos (7 días)" value={String(data.newUsersLastWeek)} />
            <Card label="Postulaciones activas" value={String(data.activeApplications)} />
            <Card label="Acuerdos por confirmar" value={String(data.pendingAgreements)} />
            <Card label="Selfies pendientes" value={String(data.usersBySelfie.pending ?? 0)} />
          </div>
          <h3>Trabajos por estado</h3>
          <div className="cards">
            {Object.entries(data.changasByStatus).map(([status, total]) => (
              <Card key={status} label={STATUS_LABELS[status] ?? status} value={String(total)} />
            ))}
            {Object.keys(data.changasByStatus).length === 0 ? <p className="muted">Todavía no hay trabajos.</p> : null}
          </div>
          <h3>Salud del sistema</h3>
          <div className="cards">
            <Card label="Último bloque indexado" value={health.data ? String(health.data.lastIndexedBlock) : "-"} />
            <Card label="Último evento" value={formatDate(data.lastEventAt)} small />
            <Card label="Saldo del relayer" value={relayer.data ? formatEth(relayer.data.balanceWei) : "-"} />
            <Card label="Envíos del relayer (1 h)" value={String(data.relaysLastHour)} />
            <Card label="Envíos del relayer (24 h)" value={String(data.relaysLastDay)} />
            <Card label="Avisos en cola" value={String(data.queuedNotifications)} />
          </div>
        </>
      ) : null}
    </>
  );
}

function Card({ label, value, small = false }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="value" style={small ? { fontSize: 16 } : undefined}>
        {value}
      </div>
    </div>
  );
}
