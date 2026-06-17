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
    const medicinCsv = await zip.file("csv/medicin.csv")?.async("string");

    expect(manifest.responseCount).toBe(4);
    expect(zip.file("raw/medicin.json")).toBeTruthy();
    expect(zip.file("raw/aftaler.json")).toBeTruthy();
    expect(markdown).toContain("Sundhed.dk eksport");
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
});
