import { keccak256, toBytes, type Hex } from "viem";
import type { Api } from "../api/client";
import { ZERO_HASH } from "./agreement";

export const MAX_COMMENT_LENGTH = 280;

// La huella del comentario público con el que se acompaña una calificación (cero si no hay). Es lo que queda en el comprobante de la cadena.
export const commentHashOf = (comment: string): Hex => {
  const text = comment.trim();
  return text.length === 0 ? ZERO_HASH : keccak256(toBytes(text));
};

// Guarda el texto en el servidor antes de firmar la liberación y devuelve su huella. Si el servidor calcula otra, no se firma.
export async function saveRatingComment(api: Api, orderId: number, comment: string): Promise<Hex> {
  const text = comment.trim();
  if (text.length === 0) return ZERO_HASH;
  const expected = commentHashOf(text);
  const { hash } = await api.send<{ hash: Hex }>("POST", `/me/orders/${orderId}/rating-comment`, { text });
  if (hash.toLowerCase() !== expected.toLowerCase()) throw new Error("comment_hash_mismatch");
  return expected;
}
