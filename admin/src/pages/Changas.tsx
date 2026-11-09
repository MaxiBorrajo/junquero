import { useState } from "react";
import { useLoad } from "../hooks";
import { formatAmount, formatDate, shortAddress, STATUS_LABELS } from "../lib/format";
import { useSession } from "../session";

interface Row {
  id: number;
  owner: string;
  orderId: number;
  amount: string | null;
  status: string;
  hidden: boolean;
  createdAt: number;
  title: string;
  modality: string;
}

export function Changas() {
  const { api } = useSession();
  const [status, setStatus] = useState("");
  const list = useLoad(async () => (await api.get<{ changas: Row[] }>(`/admin/changas${status ? `?status=${status}` : ""}`)).changas, [api, status]);
  const [target, setTarget] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const apply = async () => {
    if (!target) return;
    if (reason.trim().length < 3) {
      setFailure("Escribí el motivo.");
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      await api.post(`/admin/changas/${target.id}/hidden`, { hidden: !target.hidden, reason: reason.trim() });
      setTarget(null);
      setReason("");
      await list.reload();
    } catch {
      setFailure("No pudimos aplicar el cambio. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h2>Changas</h2>
      <div className="toolbar">
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Estado">
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {list.error ? <div className="error">{list.error}</div> : null}
      {target ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <strong>{target.hidden ? "Restaurar" : "Bajar"}: {target.title}</strong>
          <p className="muted">La oferta se {target.hidden ? "vuelve a mostrar" : "oculta"}. No se borra ningún archivo ni dato.</p>
          <textarea placeholder="Motivo (obligatorio)" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} />
          {failure ? <div className="error">{failure}</div> : null}
          <div className="toolbar" style={{ marginTop: 10 }}>
            <button className={`btn ${target.hidden ? "" : "danger"}`} disabled={busy} onClick={apply}>
              Confirmar
            </button>
            <button className="btn ghost" onClick={() => setTarget(null)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
      <table>
        <thead>
          <tr>
            <th>Título</th>
            <th>Publicó</th>
            <th>Monto (USDC)</th>
            <th>Estado</th>
            <th>Fecha</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(list.data ?? []).map((row) => (
            <tr key={row.id}>
              <td>
                {row.title} {row.hidden ? <span className="pill hidden">Oculta</span> : null}
              </td>
              <td title={row.owner}>{shortAddress(row.owner)}</td>
              <td>{formatAmount(row.amount)}</td>
              <td>
                <span className="pill">{STATUS_LABELS[row.status] ?? row.status}</span>
              </td>
              <td>{formatDate(row.createdAt)}</td>
              <td>
                <button
                  className="btn ghost"
                  onClick={() => {
                    setTarget(row);
                    setReason("");
                    setFailure(null);
                  }}
                >
                  {row.hidden ? "Restaurar" : "Bajar"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!list.loading && (list.data ?? []).length === 0 ? <p className="muted">No hay changas.</p> : null}
    </>
  );
}
