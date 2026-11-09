import { useState } from "react";
import { Changas } from "./pages/Changas";
import { Log } from "./pages/Log";
import { Selfies } from "./pages/Selfies";
import { Summary } from "./pages/Summary";
import { Users } from "./pages/Users";
import { NoWalletError } from "./lib/login";
import { shortAddress } from "./lib/format";
import { SessionProvider, useSession } from "./session";

type Page = "summary" | "selfies" | "changas" | "users" | "log";

const PAGES: { id: Page; label: string }[] = [
  { id: "summary", label: "Resumen" },
  { id: "selfies", label: "Selfies" },
  { id: "changas", label: "Changas" },
  { id: "users", label: "Usuarios" },
  { id: "log", label: "Registro" },
];

function Login() {
  const { signIn } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enter = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn();
    } catch (failure) {
      const text = String((failure as { message?: string })?.message ?? failure).toLowerCase();
      setError(
        failure instanceof NoWalletError
          ? "No encontramos MetaMask en este navegador."
          : text.includes("reject") || text.includes("denied")
            ? "Cancelaste la firma."
            : "No pudimos ingresar. Probá de nuevo.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
    <div className="login">
      <h1>Junquero</h1>
      <div>Panel de administración. Ingresá con la billetera autorizada y firmá el mensaje para confirmar que sos vos.</div>
      {error ? <div className="error">{error}</div> : null}
      <button className="btn" disabled={busy} onClick={enter}>
        {busy ? "Esperando la billetera…" : "Ingresar con MetaMask"}
      </button>
    </div>
    </div>
  );
}

function Panel() {
  const { address, signOut } = useSession();
  const [page, setPage] = useState<Page>("summary");
  const [pending, setPending] = useState(0);

  return (
    <div className="layout">
      <nav className="sidebar">
        <h1>Junquero</h1>
        {PAGES.map((item) => (
          <button key={item.id} aria-current={page === item.id ? "page" : undefined} onClick={() => setPage(item.id)}>
            {item.label}
            {item.id === "selfies" && pending > 0 ? <span className="badge">{pending}</span> : null}
          </button>
        ))}
        <div className="spacer" />
        <div className="who">{address ? shortAddress(address) : ""}</div>
        <button onClick={signOut}>Cerrar sesión</button>
      </nav>
      <main>
        {page === "summary" ? <Summary /> : null}
        {page === "selfies" ? <Selfies onChange={setPending} /> : null}
        {page === "changas" ? <Changas /> : null}
        {page === "users" ? <Users /> : null}
        {page === "log" ? <Log /> : null}
      </main>
    </div>
  );
}

function Gate() {
  const { address } = useSession();
  return address ? <Panel /> : <Login />;
}

export function App() {
  return (
    <SessionProvider>
      <Gate />
    </SessionProvider>
  );
}
