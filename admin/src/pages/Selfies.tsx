import { useEffect, useState } from "react";
import { useLoad } from "../hooks";
import { formatDate, shortAddress } from "../lib/format";
import { useSession } from "../session";

interface Pending {
  address: string;
  name: string;
  submittedAt: number;
}

export function Selfies({ onChange }: { onChange: (count: number) => void }) {
  const { api } = useSession();
  const list = useLoad(async () => (await api.get<{ selfies: Pending[] }>("/admin/selfies")).selfies, [api]);
  const [index, setIndex] = useState(0);
  const [image, setImage] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const items = list.data ?? [];
  const current = items[Math.min(index, Math.max(items.length - 1, 0))];

  useEffect(() => onChange(items.length), [items.length, onChange]);

  useEffect(() => {
    let url: string | null = null;
    let alive = true;
    setImage(null);
    if (!current) return;
    api
      .blob(`/admin/selfies/${current.address}`)
      .then((blob) => {
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setImage(url);
      })
      .catch(() => alive && setFailure("No pudimos cargar la imagen."));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [api, current?.address]);

  const decide = async (approved: boolean) => {
    if (!current) return;
    if (!approved && reason.trim().length < 3) {
      setFailure("Para rechazar tenés que escribir el motivo.");
      return;
    }
    setBusy(true);
    setFailure(null);
    setMessage(null);
    try {
      await api.post(`/admin/selfies/${current.address}`, approved ? { approved } : { approved, reason: reason.trim() });
      setMessage(approved ? "Aprobada." : "Rechazada.");
      setReason("");
      setIndex(0);
      await list.reload();
    } catch {
      setFailure("No pudimos guardar la decisión. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h2>Verificación de selfies</h2>
      {list.error ? <div className="error">{list.error}</div> : null}
      {failure ? <div className="error">{failure}</div> : null}
      {message ? <p className="ok">{message}</p> : null}
      {!list.loading && items.length === 0 ? <p className="muted">No hay selfies pendientes.</p> : null}
      {items.length > 1 ? (
        <div className="queue">
          {items.map((item, position) => (
            <button key={item.address} className={`btn ${position === index ? "secondary" : "ghost"}`} onClick={() => setIndex(position)}>
              {item.name} · {shortAddress(item.address)} · {formatDate(item.submittedAt)}
            </button>
          ))}
        </div>
      ) : null}
      {current ? (
        <div className="review">
          {image ? <img src={image} alt={`Selfie de ${current.name}`} /> : <div className="review img" style={{ aspectRatio: "3 / 4", background: "var(--map)", borderRadius: 12 }} />}
          <div className="panel">
            <div>
              <strong>{current.name}</strong>
              <div className="muted">{current.address}</div>
              <div className="muted">Enviada: {formatDate(current.submittedAt)}</div>
            </div>
            <label>
              Motivo (obligatorio para rechazar)
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} />
            </label>
            <div className="toolbar">
              <button className="btn" disabled={busy} onClick={() => decide(true)}>
                Aprobar
              </button>
              <button className="btn danger" disabled={busy} onClick={() => decide(false)}>
                Rechazar
              </button>
            </div>
            <p className="muted">Al decidir, la imagen se borra y queda solo el resultado. La decisión queda en el registro de acciones.</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
