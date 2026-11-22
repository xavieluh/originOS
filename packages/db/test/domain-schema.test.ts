// Contracts in @originos/contracts must describe exactly the columns of the tables.
import { DOMAIN_ENTITIES, OBJECT_KINDS } from "@originos/contracts";
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as tables from "../src/domain-schema.js";

// Columns that exist for the database's own bookkeeping and are not part of the API shape.
const INTERNAL = new Set(["agentSubjectKind"]);

describe("contracts match the tables", () => {
  for (const [name, schema] of Object.entries(DOMAIN_ENTITIES)) {
    it(name, () => {
      const table = (tables as Record<string, unknown>)[name];
      expect(table, `table export ${name}`).toBeDefined();
      const columns = Object.keys(getTableColumns(table as never)).filter((c) => !INTERNAL.has(c));
      expect(Object.keys(schema.shape).sort()).toEqual(columns.sort());
    });
  }

  it("every object kind has a contract", () => {
    expect(Object.keys(DOMAIN_ENTITIES)).toHaveLength(Object.keys(OBJECT_KINDS).length);
  });
});
