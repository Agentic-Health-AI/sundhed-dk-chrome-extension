import { describe, expect, it } from "vitest";
import { parseAftaler, parseMedicin, parseProevesvar, parseSection } from "./sectionParsers";
import { aftaleResponses, medicinResponses, proevesvarResponses } from "../test/fixtures";

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

  it("parses lab results from Svaroversigt responses", () => {
    const result = parseProevesvar(proevesvarResponses);

    expect(result.markdown).toContain("Antal prøvesvar: 2");
    expect(result.markdown).toContain("Hæmoglobin;B");
    expect(result.tables[0]?.filename).toBe("proevesvar.csv");
    expect(result.tables[0]?.rows).toHaveLength(2);
    expect(result.tables[0]?.rows[0]).toEqual(
      expect.objectContaining({
        analysisName: "Hæmoglobin;B",
        sampleDate: "2026-06-01",
        result: "8,7 mmol/L",
        requester: "Testklinik"
      })
    );
  });

  it("falls back to generic markdown for unsupported sections", () => {
    const result = parseSection("journaler", []);

    expect(result.warnings).toHaveLength(1);
    expect(result.markdown).toContain("0 API-responses opsamlet");
  });
});
