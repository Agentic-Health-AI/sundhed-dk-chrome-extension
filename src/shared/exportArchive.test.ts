import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildArchiveBlob } from "./exportArchive";
import { aftaleResponses, capturedResponse, medicinResponses } from "../test/fixtures";

describe("buildArchiveBlob", () => {
  it("creates a ZIP with manifest, raw JSON, markdown and CSV", async () => {
    const blob = await buildArchiveBlob({
      status: "idle",
      responseCount: 4,
      responses: [...medicinResponses, ...aftaleResponses],
      activity: [],
      startedAt: "2026-06-17T11:00:00.000Z"
    });

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const manifest = JSON.parse((await zip.file("manifest.json")?.async("string")) ?? "{}");
    const markdown = await zip.file("sundhed-dk-eksport.md")?.async("string");
    const dataQuality = await zip.file("data-kvalitet.md")?.async("string");
    const medicinCsv = await zip.file("csv/medicin.csv")?.async("string");

    expect(manifest.responseCount).toBe(4);
    expect(manifest.progress).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "medicin",
          apiResponseCount: 3,
          okResponseCount: 3,
          errorResponseCount: 0,
          recordCount: 1,
          recordLabel: "medicinrækker"
        }),
        expect.objectContaining({
          id: "aftaler",
          apiResponseCount: 1,
          recordCount: 1,
          recordLabel: "aftaler"
        })
      ])
    );
    expect(zip.file("raw/medicin.json")).toBeTruthy();
    expect(zip.file("raw/aftaler.json")).toBeTruthy();
    expect(markdown).toContain("Sundhed.dk eksport");
    expect(dataQuality).toContain("Data-kvalitet");
    expect(dataQuality).toContain("Tekniske svar: 3 (3 ok, 0 fejl)");
    expect(medicinCsv).toContain("drugName");
    expect(medicinCsv).toContain("Ovison");
  });

  it("includes raw JSON for unknown sundhed.dk API responses", async () => {
    const unknownResponse = capturedResponse("ukendt", "https://www.sundhed.dk/api/nytmodul/endpoint", { ok: true });
    const blob = await buildArchiveBlob({
      status: "idle",
      responseCount: 1,
      responses: [unknownResponse],
      activity: [],
      startedAt: "2026-06-17T11:00:00.000Z"
    });

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());

    expect(zip.file("raw/ukendt.json")).toBeTruthy();
    expect(await zip.file("markdown/ukendt.md")?.async("string")).toContain("1 API-responses opsamlet");
  });

  it("documents mixed capture quality in manifest and data quality receipt", async () => {
    const failedMedicin = {
      ...capturedResponse("medicin", "https://www.sundhed.dk/app/medicinkort2borger/api/v1/ordinations/current?status=active", {
        message: "Forbidden"
      }),
      status: 403
    };
    const emptyPlaner = capturedResponse("forloebsplaner", "https://www.sundhed.dk/app/planerportalborger/api/v1/plans/", {
      plans: []
    });
    const journalOverview = capturedResponse("journaler", "https://www.sundhed.dk/app/ejournalportalborger/api/ejournal/forloebsoversigt", {
      Forloeb: [{ AntalNotater: 1 }]
    });

    const blob = await buildArchiveBlob({
      status: "idle",
      responseCount: 3,
      responses: [failedMedicin, emptyPlaner, journalOverview],
      activity: [],
      startedAt: "2026-06-17T11:00:00.000Z"
    });

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const manifest = JSON.parse((await zip.file("manifest.json")?.async("string")) ?? "{}");
    const dataQuality = await zip.file("data-kvalitet.md")?.async("string");

    expect(manifest.progress).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "medicin", status: "failed", latestErrorStatus: 403 }),
        expect.objectContaining({ id: "forloebsplaner", status: "empty", recordCount: 0 }),
        expect.objectContaining({ id: "journaler", status: "needs-action" })
      ])
    );
    expect(dataQuality).toContain("- Fejlede data-kald: 1");
    expect(dataQuality).toContain("- Kræver et ekstra kig: 1");
    expect(dataQuality).toContain("- Seneste fejl: HTTP 403");
    expect(dataQuality).toContain("- Næste skridt:");
  });

  it("includes opened sections without responses in export quality progress", async () => {
    const blob = await buildArchiveBlob({
      status: "idle",
      responseCount: 0,
      responses: [],
      activity: [],
      openedSectionIds: ["vaccinationer"],
      startedAt: "2026-06-17T11:00:00.000Z"
    });

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const manifest = JSON.parse((await zip.file("manifest.json")?.async("string")) ?? "{}");
    const dataQuality = await zip.file("data-kvalitet.md")?.async("string");

    expect(manifest.progress).toEqual(expect.arrayContaining([expect.objectContaining({ id: "vaccinationer", status: "opened" })]));
    expect(dataQuality).toContain("### Vaccinationer");
    expect(dataQuality).toContain("- Status: opened");
  });
});
