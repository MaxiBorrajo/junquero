import type { PickedFile } from "../lib/pick";
import { MAX_BATCH_ITEMS } from "./upload";

// Archivos elegidos para cada prueba pedida, todavía sin subir. Se suben todos juntos con una sola firma.
export type Staged = Record<number, PickedFile[]>;

export interface StagedEntry {
  file: PickedFile;
  requirement: number;
}

export const stagedCount = (staged: Staged): number => Object.values(staged).reduce((total, files) => total + files.length, 0);

// Cuántos archivos más entran en la tanda (la firma cubre hasta MAX_BATCH_ITEMS).
export const roomLeft = (staged: Staged): number => Math.max(0, MAX_BATCH_ITEMS - stagedCount(staged));

// Suma archivos a una prueba pedida sin pasarse del tope de la tanda.
export function addStaged(staged: Staged, requirement: number, files: PickedFile[]): Staged {
  const accepted = files.slice(0, roomLeft(staged));
  if (accepted.length === 0) return staged;
  return { ...staged, [requirement]: [...(staged[requirement] ?? []), ...accepted] };
}

export function clearStaged(staged: Staged, requirement: number): Staged {
  const { [requirement]: _removed, ...rest } = staged;
  return rest;
}

// Una lista plana, en el orden de las pruebas pedidas, lista para subir.
export function flattenStaged(staged: Staged): StagedEntry[] {
  return Object.keys(staged)
    .map(Number)
    .sort((a, b) => a - b)
    .flatMap((requirement) => (staged[requirement] ?? []).map((file) => ({ file, requirement })));
}
