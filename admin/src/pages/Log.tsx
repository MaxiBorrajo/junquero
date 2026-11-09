import { useLoad } from "../hooks";
import { formatDate, shortAddress } from "../lib/format";
import { useSession } from "../session";

interface Entry {
  id: number;
  admin: string;
  action: string;
  target: string;
  reason: string;
  createdAt: number;
}

const ACTIONS: Record<string, string> = {
  selfie_approved: "Selfie aprobada",
  selfie_rejected: "Selfie rechazada",
  changa_hidden: "Changa bajada",
  changa_restored: "Changa restaurada",
  report_hide: "Reporte: oferta bajada",
  report_dismissed: "Reporte descartado",
  emergency_resolved: "Reclamo resuelto como árbitro",
};

export function Log() {
  const { api } = useSession();
  const list = useLoad(async () => (await api.get<{ log: Entry[] }>("/admin/log?limit=100")).log, [api]);
  return (
    <>
      <h2>Registro de acciones</h2>
      {list.error ? <div className="error">{list.error}</div> : null}
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Administrador</th>
            <th>Acción</th>
            <th>Objetivo</th>
            <th>Motivo</th>
          </tr>
        </thead>
        <tbody>
          {(list.data ?? []).map((entry) => (
            <tr key={entry.id}>
              <td>{formatDate(entry.createdAt)}</td>
              <td title={entry.admin}>{shortAddress(entry.admin)}</td>
              <td>{ACTIONS[entry.action] ?? entry.action}</td>
              <td title={entry.target}>{entry.target.startsWith("0x") ? shortAddress(entry.target) : `#${entry.target}`}</td>
              <td>{entry.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!list.loading && (list.data ?? []).length === 0 ? <p className="muted">Todavía no hay acciones registradas.</p> : null}
    </>
  );
}
