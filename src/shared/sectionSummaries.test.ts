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
      capturedResponse("proevesvar", "https://www.sundhed.dk/app/proevesvarportal/api/v1/svaroversigt?fra=2023-01-01&til=2023-06-30", {
        Svaroversigt: {
          Laboratorieresultater: [
            {
              AnalysetypeId: "analysis-3",
              RekvisitionsId: "req-2",
              Vaerdi: "4",
              Resultat: "4 mg/L",
              Resultatdato: "2023-02-03T11:00:00",
              ProevenummerRekvirent: "rek-2",
              ProevenummerLaboratorie: "lab-2"
            }
          ]
        }
      }),
      capturedResponse("proevesvar", "https://www.sundhed.dk/app/proevesvarportal/api/v1/filter", { Filters: [] }),
      capturedResponse("proevesvar", "https://www.sundhed.dk/app/proevesvarportal/api/v1/adminbeskeder", { Beskeder: [] })
    ]);

    expect(progress.apiResponseCount).toBe(5);
    expect(progress.recordCount).toBe(3);
    expect(progress.recordLabel).toBe("laboratorieresultater");
    expect(progress.status).toBe("data-found");
    expect(progress.detail).toBe("3 laboratorieresultater fundet");
    expect(progress.coverageDetail).toBe("3 prøvesvar-perioder hentet, ældste fra 2023-01-01");
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

  it("marks manually opened sections without captured API responses as opened", () => {
    const progress = buildSectionProgress(section("vaccinationer"), [], ["vaccinationer"]);

    expect(progress.status).toBe("opened");
    expect(progress.detail).toBe("Siden er åbnet, men der mangler stadig data.");
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
    expect(progress.coverageDetail).toBe("5 journaltekster/detailrækker fanget; forløbsoversigten forventede mindst 2");
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

    expect(progress.status).toBe("empty");
    expect(progress.recordCount).toBe(0);
    expect(progress.okResponseCount).toBe(1);
    expect(progress.errorResponseCount).toBe(0);
    expect(progress.detail).toBe("Gennemgået: 0 forløbsplaner fundet");
  });

  it("marks failed data endpoints separately from missing user navigation", () => {
    const progress = buildSectionProgress(section("medicin"), [
      {
        ...capturedResponse("medicin", "https://www.sundhed.dk/app/medicinkortet/api/v1/ordinations/current?status=active", {
          message: "Forbidden"
        }),
        status: 403
      }
    ]);

    expect(progress.status).toBe("failed");
    expect(progress.recordCount).toBe(0);
    expect(progress.okResponseCount).toBe(0);
    expect(progress.errorResponseCount).toBe(1);
    expect(progress.latestErrorStatus).toBe(403);
    expect(progress.detail).toBe("Data-kald fejlede med HTTP 403. Prøv sektionen igen.");
  });

  it("keeps partial journal captures visible with error and expected coverage", () => {
    const progress = buildSectionProgress(section("journaler"), [
      capturedResponse("journaler", "https://www.sundhed.dk/app/ejournalportalborger/api/ejournal/forloebsoversigt", {
        Forloeb: [{ AntalNotater: 1, AntalEpikriser: 1 }]
      }),
      capturedResponse("journaler", "https://www.sundhed.dk/app/ejournalportalborger/api/ejournal/notater", {
        Notater: [{ Overskrift: "A" }]
      }),
      {
        ...capturedResponse("journaler", "https://www.sundhed.dk/app/ejournalportalborger/api/ejournal/epikriser", {
          message: "Server error"
        }),
        status: 500
      }
    ]);

    expect(progress.status).toBe("data-found");
    expect(progress.recordCount).toBe(1);
    expect(progress.errorResponseCount).toBe(1);
    expect(progress.latestErrorStatus).toBe(500);
    expect(progress.coverageDetail).toBe("1 af 2 forventede journaltekster/detailrækker fanget");
  });
});
