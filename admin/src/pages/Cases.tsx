import { useState } from "react";
import { useLoad } from "../hooks";
import { sendEmergency } from "../lib/emergency";
import { formatDate } from "../lib/format";
import type { Eip1193 } from "../lib/login";
import { useSession } from "../session";

const ARBITRATION = "0x1204d91dcD99e9Fb8928Ccf5c3A7c0EcE837a642";

interface Row {
  caseId: number;
  orderId: number;
  since: number;
  reason: string | null;
}

export function Cases({ onChange }: { onChange: (count: number) => void }) {
  const { api, address } = useSession();
  const list = useLoad(async () => {
    const cases = (await api.get<{ cases: Row[] }>("/admin/cases")).cases;
    onChange(cases.length);
    return cases;
  }, [api]);
  const [current, setCurrent] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const decide = async (payeeWins: boolean) => {
    if (!current || !address) return;
    if (reason.trim().length < 3) {
      setFailure("Escribí el motivo. Se publica.");
      return;
    }
    setBusy(true);
    setFailure(null);
    setMessage(null);
    try {
      const provider = (window as unknown as { ethereum?: Eip1193 }).ethereum;
      if (!provider) throw new Error("no_wallet");
      const txHash = await sendEmergency(provider, address, ARBITRATION, current.caseId, payeeWins, reason);
      await api.post(`/admin/cases/${current.caseId}/emergency`, { payeeWins, reason: reason.trim(), txHash });
      setMessage(`Enviado: ${txHash}`);
      setCurrent(null);
      setReason("");
      await list.reload();
    } catch (error) {
      const text = String((error as { message?: string })?.message ?? error).toLowerCase();
      setFailure(text.includes("reject") || text.includes("denied") ? "Cancelaste la transacción." : "No pudimos enviar la resolución. Revisá que tu billetera tenga ETH de prueba.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h2>Reclamos sin jurado</h2>
      <p className="muted">Casos que esperan tu resolución como árbitro de emergencia: no hubo jurados suficientes o el jurado empató. El motivo queda publicado en el registro.</p>
      {list.error ? <div className="error">{list.error}</div> : null}
      {message ? <p className="ok">{message}</p> : null}
      {failure ? <div className="error">{failure}</div> : null}
      {current ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <strong>Reclamo #{current.caseId} (changa #{current.orderId})</strong>
          <textarea placeholder="Motivo de la resolución (se publica)" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} />
          <div className="toolbar" style={{ marginTop: 10 }}>
            <button className="btn" disabled={busy} onClick={() => decide(false)}>
              A favor de quien publicó
            </button>
            <button className="btn secondary" disabled={busy} onClick={() => decide(true)}>
              A favor de quien hizo la changa
            </button>
            <button className="btn ghost" onClick={() => setCurrent(null)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
      <table>
        <thead>
          <tr>
            <th>Reclamo</th>
            <th>Changa</th>
            <th>Desde</th>
            <th>Motivo</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(list.data ?? []).map((row) => (
            <tr key={row.caseId}>
              <td>#{row.caseId}</td>
              <td>#{row.orderId}</td>
              <td>{formatDate(row.since)}</td>
              <td>{row.reason === "1" ? "Faltan jurados" : row.reason === "2" ? "Empate" : "-"}</td>
              <td>
                <button className="btn" onClick={() => (setCurrent(row), setReason(""), setFailure(null), setMessage(null))}>
                  Resolver
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!list.loading && (list.data ?? []).length === 0 ? <p className="muted">No hay reclamos esperando.</p> : null}
    </>
  );
}
