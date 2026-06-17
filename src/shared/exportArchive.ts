import JSZip from "jszip";
import { buildSectionProgress } from "./sectionSummaries";
import { HEALTH_SECTIONS } from "./sections";
import type { CapturedResponse, CaptureState, SectionId } from "./types";
import { parseSection } from "../parsers/sectionParsers";
import { toCsv } from "../parsers/helpers";

export async function buildArchiveBlob(state: CaptureState) {
  const zip = new JSZip();
  const capturedAt = new Date().toISOString();
  const responsesBySection = groupBySection(state.responses);
  const exports = Array.from(responsesBySection.entries()).map(([sectionId, responses]) =>
    parseSection(sectionId, responses)
  );
  const progress = HEALTH_SECTIONS.map(section => buildSectionProgress(section, state.responses));

  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        source: "sundhed.dk",
        createdAt: capturedAt,
        startedAt: state.startedAt,
        responseCount: state.responses.length,
        progress: progress.map(section => ({
          id: section.sectionId,
          label: section.label,
          status: section.status,
          apiResponseCount: section.apiResponseCount,
          recordCount: section.recordCount,
          recordLabel: section.recordLabel,
          detail: section.detail,
          actionHint: section.actionHint
        })),
        sections: exports.map(sectionExport => ({
          id: sectionExport.id,
          title: sectionExport.title,
          warnings: sectionExport.warnings
        }))
      },
      null,
      2
    )
  );

  for (const sectionId of responsesBySection.keys()) {
    const responses = responsesBySection.get(sectionId);
    if (!responses || responses.length === 0) {
      continue;
    }

    zip.file(`raw/${sectionId}.json`, JSON.stringify(responses, null, 2));
  }

  const markdownParts = [
    "# Sundhed.dk eksport",
    "",
    `Eksporteret: ${capturedAt}`,
    `Antal API-responses: ${state.responses.length}`,
    "",
    "Data er læst fra brugerens egen browser-session på sundhed.dk.",
    ""
  ];

  for (const sectionExport of exports) {
    zip.file(`markdown/${sectionExport.id}.md`, sectionExport.markdown);
    markdownParts.push(sectionExport.markdown, "");

    for (const table of sectionExport.tables) {
      if (table.rows.length > 0) {
        zip.file(`csv/${table.filename}`, toCsv(table.rows));
      }
    }
  }

  zip.file("sundhed-dk-eksport.md", markdownParts.join("\n"));

  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

export function archiveFilename() {
  const date = new Date().toISOString().slice(0, 10);
  return `sundhed-dk-eksport-${date}.zip`;
}

function groupBySection(responses: CapturedResponse[]) {
  const grouped = new Map<SectionId, CapturedResponse[]>();
  for (const response of responses) {
    const existing = grouped.get(response.sectionId) ?? [];
    existing.push(response);
    grouped.set(response.sectionId, existing);
  }

  return grouped;
}
