import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
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
    const result = this.db.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes: Number(result.changes) } };
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
  const directory = resolve(process.cwd(), "migrations");
  for (const file of readdirSync(directory).sort()) raw.exec(readFileSync(resolve(directory, file), "utf8"));
  const db = {
    prepare: (sql: string) => new FakeStatement(raw, sql),
    async batch(statements: FakeStatement[]) {
      raw.exec("BEGIN");
      const results: unknown[] = [];
      try {
        for (const statement of statements) results.push(/^\s*SELECT/i.test(statement.sql) ? await statement.all() : await statement.run());
        raw.exec("COMMIT");
      } catch (error) {
        raw.exec("ROLLBACK");
        throw error;
      }
      return results;
    },
  };
  return { db: db as unknown as D1Database, raw };
}
