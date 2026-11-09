import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import type { Api } from "../api/client";
import { toHex } from "./hex";

export async function readBytes(uri: string): Promise<Uint8Array> {
  return new Uint8Array(await new File(uri).arrayBuffer());
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return toHex(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes as unknown as BufferSource)));
}

export interface Uploaded {
  hash: string;
  url: string;
}

export async function uploadBytes(api: Api, path: string, bytes: Uint8Array, mime: string): Promise<Uploaded> {
  const hash = await sha256Hex(bytes);
  return api.upload<Uploaded>(path, bytes, {
    "Content-Type": mime,
    "Content-Length": String(bytes.byteLength),
    "X-Content-SHA256": hash,
  });
}
