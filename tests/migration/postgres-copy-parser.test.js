import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  parseCopyLine, parseCopySections,
} from "../../scripts/migration/parse-postgres-copy.js";

describe("PostgreSQL COPY parser", () => {
  it("decodes NULL and PostgreSQL text escapes without eval", () => {
    const line = String.raw`plain	\N	line\nbreak	tab\tvalue	octal\101	hex\x42	slash\\`;
    expect(parseCopyLine(line)).toEqual([
      "plain", null, "line\nbreak", "tab\tvalue", "octalA", "hexB", "slash\\",
    ]);
  });

  it("yields only allowlisted COPY sections", async () => {
    const input = Readable.from([
      "COPY public.allowed (id, body) FROM stdin;\n",
      String.raw`1	x\tvalue`, "\n\\.\n",
      "COPY public.skipped (id) FROM stdin;\n2\n\\.\n",
    ]);
    const rows = [];
    for await (const row of parseCopySections(input, new Set(["public.allowed"]))) rows.push(row);
    expect(rows).toEqual([{
      table: "public.allowed",
      columns: ["id", "body"],
      values: ["1", "x\tvalue"],
      rowNumber: 1,
    }]);
  });

  it("fails closed on malformed row width", async () => {
    const input = Readable.from(["COPY public.a (id, body) FROM stdin;\n1\n\\.\n"]);
    await expect(async () => {
      for await (const _row of parseCopySections(input, new Set(["public.a"]))) {
        // Consume the generator.
      }
    }).rejects.toThrow("copy-column-count:public.a:1");
  });
});
