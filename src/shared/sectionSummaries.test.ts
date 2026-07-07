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

  it("keeps journal overview-only responses as needing detail clicks", () => {
    const progress = buildSectionProgress(section("journaler"), [
      capturedResponse("journaler", "https://www.sundhed.dk/app/ejournalportalborger/api/ejournal/forloebsoversigt", {
        Forloeb: [{ AntalNotater: 2, AntalEpikriser: 1 }]
      })
    ]);

    expect(progress.status).toBe("needs-action");
    expect(progress.recordCount).toBe(0);
    expect(progress.recordLabel).toBe("journaltekster");
    expect(progress.detail).toContain("Journaltekster mangler");
  });

  it("counts journal notes and discharge letters instead of API calls", () => {
    const progress = buildSectionProgress(section("journaler"), [
      capturedResponse("journaler", "https://www.sundhed.dk/app/ejournalportalborger/api/ejournal/forloebsoversigt", {
        Forloeb: [{ AntalNotater: 1, AntalEpikriser: 1 }]
      }),
      capturedResponse("journaler", "https://www.sundhed.dk/app/ejournalportalborger/api/ejournal/notater", {
        notater: [{ overskrift: "A" }, { overskrift: "B" }]
      }),
      capturedResponse("journaler", "https://www.sundhed.dk/app/ejournalportalborger/api/ejournal/epikriser", {
        Epikriser: [{ Overskrift: "C" }]
      }),
      capturedResponse("journaler", "https://www.sundhed.dk/app/ejournalportalborger/api/ejournal/epikriser-page", {
        Notater: [{ Overskrift: "D" }]
      }),
      capturedResponse("journaler", "https://www.sundhed.dk/app/ejournalportalborger/api/ejournal/kontaktperioder", {
        kontaktperioder: [{ status: "E" }]
      })
    ]);

    expect(progress.status).toBe("data-found");
    expect(progress.apiResponseCount).toBe(5);
    expect(progress.recordCount).toBe(5);
    expect(progress.detail).toBe("5 journaltekster fundet");
  });

  it("counts active and previous referrals from the referral endpoint", () => {
    const progress = buildSectionProgress(section("henvisninger"), [
      capturedResponse("henvisninger", "https://www.sundhed.dk/app/DenNationaleHenvisningsformidling/api/v1/henvisninger", {
        aktiveHenvisninger: [],
        tidligereHenvisninger: [{}]
      })
    ]);

    expect(progress.status).toBe("data-found");
    expect(progress.recordCount).toBe(1);
    expect(progress.detail).toBe("1 henvisninger fundet");
  });

  it("counts x-ray description list responses by TotalItems", () => {
    const progress = buildSectionProgress(section("roentgen"), [
      capturedResponse("roentgen", "https://www.sundhed.dk/app/billedbeskrivelserborger/api/v1/billedbeskrivelser/henvisninger/", {
        TotalItems: 1,
        Svar: [{}]
      })
    ]);

    expect(progress.status).toBe("data-found");
    expect(progress.recordCount).toBe(1);
    expect(progress.detail).toBe("1 billedbeskrivelser fundet");
  });

  it("treats empty but valid data endpoint responses as completed with zero records", () => {
    const progress = buildSectionProgress(section("forloebsplaner"), [
      capturedResponse("forloebsplaner", "https://www.sundhed.dk/app/planerportalborger/api/v1/plans/", {
        plans: []
      })
    ]);

    expect(progress.status).toBe("data-found");
    expect(progress.recordCount).toBe(0);
    expect(progress.detail).toBe("0 forløbsplaner fundet");
  });
});
