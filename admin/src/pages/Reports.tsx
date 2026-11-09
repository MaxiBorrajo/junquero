import { useState } from "react";
import { useLoad } from "../hooks";
import { formatDate, shortAddress } from "../lib/format";
import { useSession } from "../session";

interface Row {
  id: number;
  reporter: string;
  kind: string;
  target: string;
  reason: string;
  createdAt: number;
  title: string | null;
  total: number;
}

export function Reports({ onChange }: { onChange: (count: number) => void }) {
  const { api } = useSession();
  const list = useLoad(async () => {
    const reports = (await api.get<{ reports: Row[] }>("/admin/reports")).reports;
    onChange(reports.length);
    return reports;
  }, [api]);
  const [target, setTarget] = useState<{ row: Row; action: "hide" | "dismiss" } | null>(null);
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
      await api.post(`/admin/reports/${target.row.id}`, { action: target.action, reason: reason.trim() });
      setTarget(null);
      setReason("");
      await list.reload();
    } catch {
      setFailure("No pudimos guardar la decisión. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h2>Reportes de contenido</h2>
      {list.error ? <div className="error">{list.error}</div> : null}
      {target ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <strong>{target.action === "hide" ? "Bajar la oferta" : "Descartar el reporte"}: {target.row.title ?? target.row.target}</strong>
          <textarea placeholder="Motivo (obligatorio)" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} />
          {failure ? <div className="error">{failure}</div> : null}
          <div className="toolbar" style={{ marginTop: 10 }}>
            <button className={`btn ${target.action === "hide" ? "danger" : ""}`} disabled={busy} onClick={apply}>
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
            <th>Qué</th>
            <th>Motivo</th>
            <th>Reportó</th>
            <th>Reportes</th>
            <th>Fecha</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(list.data ?? []).map((row) => (
            <tr key={row.id}>
              <td>
                <span className="pill">{row.kind === "changa" ? "Changa" : "Usuario"}</span> {row.title ?? row.target}
              </td>
              <td>{row.reason}</td>
              <td title={row.reporter}>{shortAddress(row.reporter)}</td>
              <td>{row.total}</td>
              <td>{formatDate(row.createdAt)}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                {row.kind === "changa" ? (
                  <button className="btn ghost" onClick={() => (setTarget({ row, action: "hide" }), setReason(""), setFailure(null))}>
                    Bajar
                  </button>
                ) : null}{" "}
                <button className="btn ghost" onClick={() => (setTarget({ row, action: "dismiss" }), setReason(""), setFailure(null))}>
                  Descartar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!list.loading && (list.data ?? []).length === 0 ? <p className="muted">No hay reportes abiertos.</p> : null}
    </>
  );
}
