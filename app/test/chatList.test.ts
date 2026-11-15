import { describe, expect, it } from "vitest";
import { attachmentLabel, previewFromSealed, PREVIEW_LABELS } from "../src/chat/preview";
import { encodeEnvelope, type ChatFile } from "../src/chat/envelope";
import { countUnreadChats } from "../src/lib/unread";
import { keyPairFromSeed, seal } from "../src/crypto/chat";
import { formatChatTime } from "../src/lib/format";
import type { ChatSummary } from "../src/api/types";

const me = keyPairFromSeed(new Uint8Array(32).fill(1));
const other = keyPairFromSeed(new Uint8Array(32).fill(2));
const file = (mime: string): ChatFile => ({ hash: "ab".repeat(32), name: "x", mime, size: 100, key: "A".repeat(43) + "=", nonce: "B".repeat(32) });
const sealedBy = (plain: string, from = other, to = me) => seal(plain, to.publicKey, from);

describe("last message preview", () => {
  it("decrypts a message from the other person and a message I sent", () => {
    const received = sealedBy("hola, ¿cuándo venís?");
    expect(previewFromSealed({ lastNonce: received.nonce, lastBody: received.body }, me, other.publicKey, PREVIEW_LABELS)).toBe("hola, ¿cuándo venís?");
    const sent = seal("mañana a las 10", other.publicKey, me);
    expect(previewFromSealed({ lastNonce: sent.nonce, lastBody: sent.body }, me, other.publicKey, PREVIEW_LABELS)).toBe("mañana a las 10");
  });

  it("describes a message that only has attachments", () => {
    const photo = sealedBy(encodeEnvelope("", [file("image/jpeg")]));
    expect(previewFromSealed({ lastNonce: photo.nonce, lastBody: photo.body }, me, other.publicKey, PREVIEW_LABELS)).toBe("Foto");
    const pdf = sealedBy(encodeEnvelope("", [file("application/pdf")]));
    expect(previewFromSealed({ lastNonce: pdf.nonce, lastBody: pdf.body }, me, other.publicKey, PREVIEW_LABELS)).toBe("PDF");
    expect(attachmentLabel([file("image/png"), file("image/png"), file("image/png")], PREVIEW_LABELS)).toBe("3 fotos");
    expect(attachmentLabel([file("image/png"), file("application/pdf")], PREVIEW_LABELS)).toBe("2 archivos");
  });

  it("prefers the text when the message has both", () => {
    const both = sealedBy(encodeEnvelope("mirá esta foto", [file("image/jpeg")]));
    expect(previewFromSealed({ lastNonce: both.nonce, lastBody: both.body }, me, other.publicKey, PREVIEW_LABELS)).toBe("mirá esta foto");
  });

  it("gives nothing when there is no stored message or it cannot be read", () => {
    expect(previewFromSealed({ lastNonce: null, lastBody: null }, me, other.publicKey, PREVIEW_LABELS)).toBeNull();
    const stranger = keyPairFromSeed(new Uint8Array(32).fill(9));
    const foreign = seal("secreto", me.publicKey, stranger);
    expect(previewFromSealed({ lastNonce: foreign.nonce, lastBody: foreign.body }, me, other.publicKey, PREVIEW_LABELS)).toBeNull();
  });
});

describe("unread chats counter", () => {
  it("counts chats, not messages", () => {
    const chat = (unreadCount: number) => ({ unreadCount }) as ChatSummary;
    expect(countUnreadChats([chat(3), chat(0), chat(1)])).toBe(2);
    expect(countUnreadChats(undefined)).toBe(0);
  });
});

describe("chat time", () => {
  const at = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
  const now = at("2026-11-15T15:00:00");
  it("shows the hour for today, yesterday, the weekday for the last week and the date after that", () => {
    expect(formatChatTime(at("2026-11-15T09:05:00"), now)).toMatch(/09:05|9:05/);
    expect(formatChatTime(at("2026-11-14T23:00:00"), now)).toBe("Ayer");
    expect(formatChatTime(at("2026-11-12T10:00:00"), now)).toMatch(/jue/i);
    expect(formatChatTime(at("2026-10-01T10:00:00"), now)).toMatch(/1/);
  });
});
