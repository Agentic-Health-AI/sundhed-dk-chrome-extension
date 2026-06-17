import { describe, expect, it } from "vitest";
import { buildSectionProgress } from "./sectionSummaries";
import { HEALTH_SECTIONS } from "./sections";
import { capturedResponse, proevesvarResponses } from "../test/fixtures";

function section(id: string) {
  const result = HEALTH_SECTIONS.find(candidate => candidate.id === id);
  if (!result) {
    throw new Error(`Missing section ${id}`);
  }
  return result;
}

describe("section summaries", () => {
  it("separates API response count from lab result count", () => {
    const progress = buildSectionProgress(section("proevesvar"), [
      ...proevesvarResponses,
      capturedResponse("proevesvar", "https://www.sundhed.dk/app/proevesvarportal/api/v1/filter", { Filters: [] }),
      capturedResponse("proevesvar", "https://www.sundhed.dk/app/proevesvarportal/api/v1/adminbeskeder", { Beskeder: [] })
    ]);

    expect(progress.apiResponseCount).toBe(4);
    expect(progress.recordCount).toBe(2);
    expect(progress.recordLabel).toBe("laboratorieresultater");
    expect(progress.status).toBe("data-found");
    expect(progress.detail).toBe("2 laboratorieresultater fundet");
  });

  it("does not treat vaccination spot/config responses as vaccination data", () => {
    const progress = buildSectionProgress(section("vaccinationer"), [
      capturedResponse("vaccinationer", "https://www.sundhed.dk/app/vaccination/api/v1/spot/", { text: "spot" })
    ]);

    expect(progress.apiResponseCount).toBe(1);
    expect(progress.recordCount).toBe(0);
    expect(progress.status).toBe("needs-action");
    expect(progress.detail).toContain("vaccinationsdata-endpointet er ikke set");
  });

  it("marks journal responses as raw-only until a parser exists", () => {
    const progress = buildSectionProgress(section("journaler"), [
      capturedResponse("journaler", "https://www.sundhed.dk/app/ejournalportalborger/api/ejournal/forloebsoversigt", {
        Items: []
      })
    ]);

    expect(progress.status).toBe("raw-only");
    expect(progress.detail).toBe("1 journal-kald fundet som rå JSON");
  });
});
