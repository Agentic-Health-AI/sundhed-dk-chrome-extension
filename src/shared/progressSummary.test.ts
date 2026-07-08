import { describe, expect, it } from "vitest";
import { exportReadinessText, qualitySummaryText, summarizeProgress } from "./progressSummary";
import type { SectionProgress } from "./types";

function progress(status: SectionProgress["status"], label: string = status): SectionProgress {
  return {
    sectionId: "ukendt",
    label,
    path: "https://www.sundhed.dk/",
    count: 0,
    apiResponseCount: 0,
    okResponseCount: 0,
    errorResponseCount: 0,
    recordCount: status === "data-found" ? 2 : 0,
    recordLabel: "records",
    status,
    detail: String(status)
  };
}

describe("progress summary", () => {
  it("counts complete, missing and failed statuses consistently", () => {
    const summary = summarizeProgress([
      progress("data-found", "medicin"),
      progress("raw-only", "ukendt"),
      progress("empty", "forloebsplaner"),
      progress("needs-action", "journaler"),
      progress("opened", "vaccinationer"),
      progress("failed", "proevesvar"),
      progress("not-started", "aftaler")
    ]);

    expect(summary).toEqual({
      found: 2,
      empty: 1,
      needsAction: 2,
      failed: 1,
      notStarted: 1,
      total: 7
    });
    expect(qualitySummaryText(summary)).toBe("Nogle sektioner fejlede og bør prøves igen.");
  });

  it("keeps raw-only separate from spreadsheet-ready export text", () => {
    expect(exportReadinessText([progress("data-found"), progress("raw-only"), progress("empty"), progress("failed")], 4)).toBe(
      "1 sektion med regneark, 1 med tekniske originaldata, 1 gennemgået uden fund og 1 der kræver mere handling."
    );
  });
});
