export const OPEN_DELAY_MS = 500;
export const RETURN_DELAY_MS = 300;

// Pide una firma y, si tarda más de un instante, abre la billetera para que la vea. WalletConnect solo entrega la solicitud
// por la red: la billetera no se abre sola, y tampoco devuelve a la app al terminar. Por eso, si la billetera se abrió, apenas
// se resuelve la firma (bien o mal) se trae la app de vuelta con `back`. Si la firma se resuelve antes, no se abre nada.
// Si no se puede abrir la billetera o volver, se ignora: la firma sigue igual.
export async function withWallet<T>(
  request: () => Promise<T>,
  open: () => Promise<unknown>,
  back: () => Promise<unknown> = async () => undefined,
  delayMs = OPEN_DELAY_MS,
  returnDelayMs = RETURN_DELAY_MS,
): Promise<T> {
  let opened = false;
  const timer = setTimeout(() => {
    opened = true;
    void open().catch(() => {});
  }, delayMs);
  try {
    return await request();
  } finally {
    clearTimeout(timer);
    if (opened) setTimeout(() => void back().catch(() => {}), returnDelayMs);
  }
}
