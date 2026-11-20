export interface GroupableItem {
  hash: string;
  uploader: string;
  createdAt: number;
}

export interface EvidenceGroups<T extends GroupableItem> {
  // Pruebas del trabajo en sí: lo que se subió antes de que existiera el reclamo.
  job: T[];
  // Lo que cuenta cada parte en el reclamo: su relato y las pruebas que lo acompañan (y las que sumó después).
  payer: T[];
  payee: T[];
}

const STATEMENT = "relato.txt";
// Los archivos de un reclamo se suben junto con el relato; se deja un margen por si alguno quedó un instante antes.
const MARGIN_SECONDS = 30;

// Separa las pruebas de un caso: las del trabajo (antes del reclamo) y las de cada parte (desde el reclamo). El inicio del reclamo se toma del
// primer relato que haya: quien reclama sube su relato justo antes de abrirlo.
export function groupEvidence<T extends GroupableItem>(items: T[], names: Record<string, string | undefined>, payer: string, payee: string): EvidenceGroups<T> {
  const statements = items.filter((item) => names[item.hash] === STATEMENT).map((item) => item.createdAt);
  const since = statements.length > 0 ? Math.min(...statements) - MARGIN_SECONDS : Number.POSITIVE_INFINITY;
  const groups: EvidenceGroups<T> = { job: [], payer: [], payee: [] };
  for (const item of items) {
    if (item.createdAt < since) groups.job.push(item);
    else if (item.uploader.toLowerCase() === payer.toLowerCase()) groups.payer.push(item);
    else if (item.uploader.toLowerCase() === payee.toLowerCase()) groups.payee.push(item);
    else groups.job.push(item);
  }
  return groups;
}
