import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Param = string | number | null;

class FakeStatement {
  constructor(
    private readonly db: DatabaseSync,
    readonly sql: string,
    private readonly params: Param[] = [],
  ) {}

  bind(...params: Param[]) {
    return new FakeStatement(this.db, this.sql, params);
  }

  async run() {
    this.db.prepare(this.sql).run(...this.params);
    return { success: true };
  }

  async first<T>() {
    return (this.db.prepare(this.sql).get(...this.params) as T | undefined) ?? null;
  }

  async all<T>() {
    return { results: this.db.prepare(this.sql).all(...this.params) as T[] };
  }
}

export function createFakeD1(): { db: D1Database; raw: DatabaseSync } {
  const raw = new DatabaseSync(":memory:");
  raw.exec(readFileSync(resolve(process.cwd(), "migrations/0001_events.sql"), "utf8"));
  const db = {
    prepare: (sql: string) => new FakeStatement(raw, sql),
    async batch(statements: FakeStatement[]) {
      raw.exec("BEGIN");
      try {
        for (const statement of statements) await statement.run();
        raw.exec("COMMIT");
      } catch (error) {
        raw.exec("ROLLBACK");
        throw error;
      }
      return [];
    },
  };
  return { db: db as unknown as D1Database, raw };
}
