import { useState } from "react";
import { useLoad } from "../hooks";
import { formatDate, SELFIE_LABELS, shortAddress } from "../lib/format";
import { useSession } from "../session";

interface Row {
  address: string;
  name: string;
  selfieStatus: string;
  createdAt: number;
  published: number;
  applications: number;
}

export function Users() {
  const { api } = useSession();
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const list = useLoad(async () => (await api.get<{ users: Row[] }>(`/admin/users${applied ? `?q=${encodeURIComponent(applied)}` : ""}`)).users, [api, applied]);

  return (
    <>
      <h2>Usuarios</h2>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          setApplied(query.trim());
        }}
      >
        <input placeholder="Nombre o dirección" value={query} onChange={(event) => setQuery(event.target.value)} />
        <button className="btn secondary" type="submit">
          Buscar
        </button>
      </form>
      {list.error ? <div className="error">{list.error}</div> : null}
      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Dirección</th>
            <th>Selfie</th>
            <th>Publicó</th>
            <th>Postulaciones</th>
            <th>Alta</th>
          </tr>
        </thead>
        <tbody>
          {(list.data ?? []).map((row) => (
            <tr key={row.address}>
              <td>{row.name}</td>
              <td title={row.address}>{shortAddress(row.address)}</td>
              <td>
                <span className="pill">{SELFIE_LABELS[row.selfieStatus] ?? row.selfieStatus}</span>
              </td>
              <td>{row.published}</td>
              <td>{row.applications}</td>
              <td>{formatDate(row.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!list.loading && (list.data ?? []).length === 0 ? <p className="muted">No hay usuarios.</p> : null}
    </>
  );
}
