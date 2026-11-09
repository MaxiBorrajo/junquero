import { describe, expect, it } from "vitest";
import { isPurgeMinute, purgeOldLogs } from "../src/maintenance";
import { createFakeD1 } from "./fakeD1";

describe("maintenance", () => {
  it("purges only at 03:00 UTC", () => {
    expect(isPurgeMinute(Date.UTC(2026, 10, 9, 3, 0))).toBe(true);
    expect(isPurgeMinute(Date.UTC(2026, 10, 9, 3, 1))).toBe(false);
    expect(isPurgeMinute(Date.UTC(2026, 10, 9, 4, 0))).toBe(false);
  });

  it("removes old log rows and keeps recent ones", async () => {
    const { db, raw } = createFakeD1();
    const now = 10_000_000;
    for (const created of [now - 40 * 86400, now - 1 * 86400]) {
      raw.prepare("INSERT INTO relay_log (from_address, target, selector, tx_hash, created_at) VALUES ('a','b','c','d',?)").run(created);
      raw.prepare("INSERT INTO task_log (kind, item_id, action, tx_hash, created_at) VALUES ('order',1,'x','d',?)").run(created);
    }
    await purgeOldLogs(db, now);
    expect(raw.prepare("SELECT created_at FROM relay_log").all()).toEqual([{ created_at: now - 86400 }]);
    expect(raw.prepare("SELECT created_at FROM task_log").all()).toEqual([{ created_at: now - 86400 }]);
  });
});
