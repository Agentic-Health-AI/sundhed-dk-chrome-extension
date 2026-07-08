import type { SectionProgress } from "./types";

export type ProgressQualitySummary = {
  found: number;
  empty: number;
  needsAction: number;
  failed: number;
  notStarted: number;
  total: number;
};

export function summarizeProgress(progress: SectionProgress[]): ProgressQualitySummary {
  return {
    found: progress.filter(section => isSectionUseful(section)).length,
    empty: progress.filter(section => section.status === "empty").length,
    needsAction: progress.filter(section => section.status === "needs-action" || section.status === "opened").length,
    failed: progress.filter(section => section.status === "failed").length,
    notStarted: progress.filter(section => section.status === "not-started").length,
    total: progress.length
  };
}

export function isSectionUseful(section: SectionProgress) {
  return section.status === "data-found" || section.status === "raw-only";
}

export function isSectionComplete(section: SectionProgress) {
  return isSectionUseful(section) || section.status === "empty";
}

export function qualitySummaryText(summary: ProgressQualitySummary) {
  const completed = summary.found + summary.empty;
  if (summary.failed > 0) {
    return "Nogle sektioner fejlede og bør prøves igen.";
  }
  if (summary.needsAction > 0) {
    return "Nogle sektioner kræver stadig et ekstra besøg.";
  }
  if (completed === summary.total && summary.total > 0) {
    return "Alle sektioner er gennemgået.";
  }
  if (completed > 0) {
    return `${completed} af ${summary.total} sektioner er gennemgået.`;
  }
  return "Kør alle for at gennemgå sektionerne.";
}

export function exportReadinessText(progress: SectionProgress[], responseCount: number) {
  const summary = summarizeProgress(progress);
  const structured = progress.filter(section => section.status === "data-found").length;
  const rawOnly = progress.filter(section => section.status === "raw-only").length;

  if (structured + rawOnly + summary.empty + summary.needsAction + summary.failed === 0) {
    if (responseCount > 0) {
      return "ZIP med tekniske originaldata er klar. Gennemgå flere sektioner for læsbare dokumenter og regneark.";
    }
    return "ZIP med læsbare dokumenter, regneark og tekniske originaldata bliver klar, når du har gennemgået mindst én sektion.";
  }

  return `${formatCount(structured, "sektion", "sektioner")} med regneark, ${rawOnly} med tekniske originaldata, ${
    summary.empty
  } gennemgået uden fund og ${
    summary.needsAction + summary.failed
  } der kræver mere handling.`;
}

function formatCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}
