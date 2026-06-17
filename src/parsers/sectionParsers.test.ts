import { describe, expect, it } from "vitest";
import { parseAftaler, parseMedicin, parseSection } from "./sectionParsers";
import { aftaleResponses, medicinResponses } from "../test/fixtures";

describe("section parsers", () => {
  it("parses medication responses to markdown and CSV rows", () => {
    const result = parseMedicin(medicinResponses);

    expect(result.markdown).toContain("Patient: Test Patient");
    expect(result.markdown).toContain("Ovison (Mometason)");
    expect(result.tables[0]?.rows).toEqual([
      expect.objectContaining({
        drugName: "Ovison (Mometason)",
        activeSubstance: "Mometason",
        startDate: "2025-12-11",
        status: "Active"
      })
    ]);
  });

  it("parses appointment responses to a flat table", () => {
    const result = parseAftaler(aftaleResponses);

    expect(result.markdown).toContain("Blodprøve");
    expect(result.tables[0]?.rows[0]).toEqual(
      expect.objectContaining({
        title: "Blodprøve",
        date: "17.06.2026",
        organisation: "Testhospitalet",
        appointmentType: "Fremmøde"
      })
    );
  });

  it("falls back to generic markdown for unsupported sections", () => {
    const result = parseSection("journaler", []);

    expect(result.warnings).toHaveLength(1);
    expect(result.markdown).toContain("0 API-responses opsamlet");
  });
});
