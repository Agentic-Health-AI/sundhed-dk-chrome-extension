import type { CapturedResponse } from "../shared/types";
import type { SectionExport } from "./exportTypes";
import { labResultIdentityKey } from "../shared/labResults";
import { asArray, getRecord, isoDate, normalizeText, valueOrDash } from "./helpers";

export function parseProevesvar(responses: CapturedResponse[]): SectionExport {
  const svaroversigter = findSvaroversigter(responses);
  const analysetyper = new Map(
    svaroversigter.flatMap(svaroversigt =>
      asArray(svaroversigt.Analysetyper).map(rawType => {
        const analysisType = getRecord(rawType);
        return [String(analysisType.Id ?? ""), analysisType] as const;
      })
    )
  );
  const rekvisitioner = new Map(
    svaroversigter.flatMap(svaroversigt =>
      asArray(svaroversigt.Rekvisitioner).map(rawRequisition => {
        const requisition = getRecord(rawRequisition);
        return [String(requisition.Id ?? ""), requisition] as const;
      })
    )
  );
  const labResults = uniqueLabResults(svaroversigter.flatMap(svaroversigt => asArray(svaroversigt.Laboratorieresultater).map(getRecord)));
  const rows = labResults.map(result => {
    const analysisType = analysetyper.get(String(result.AnalysetypeId ?? "")) ?? {};
    const requisition = rekvisitioner.get(String(result.RekvisitionsId ?? "")) ?? {};

    return {
      sampleDate: isoDate(requisition.Proevetagningstidspunkt),
      resultDate: isoDate(result.Resultatdato ?? requisition.Svartidspunkt),
      analysisName: htmlToText(analysisType.LangtNavn_html ?? analysisType.Titel),
      result: htmlToText(result.Resultat),
      value: result.Vaerdi,
      valueType: result.Vaerditype,
      status: result.ResultatStatus ?? result.ResultatStatuskode,
      resultType: result.Resultattype,
      requester: htmlToText(requisition.Rekvirent_html ?? requisition.RekvirentsOrganisation),
      sender: htmlToText(requisition.Afsender_html),
      laboratoryArea: requisition.Laboratorieomraade,
      requisitionId: result.RekvisitionsId,
      requesterSampleNumber: result.ProevenummerRekvirent,
      laboratorySampleNumber: result.ProevenummerLaboratorie
    };
  });
  const lines = ["# Prøvesvar", "", `Antal prøvesvar: ${rows.length}`, ""];

  if (rows.length === 0) {
    lines.push("Ingen prøvesvar fundet.");
  }

  rows.slice(0, 50).forEach((row, index) => {
    lines.push(`## ${index + 1}. ${valueOrDash(row.analysisName)}`);
    lines.push(`- Prøvetagning: ${valueOrDash(row.sampleDate)}`);
    lines.push(`- Resultatdato: ${valueOrDash(row.resultDate)}`);
    lines.push(`- Resultat: ${valueOrDash(row.result || row.value)}`);
    lines.push(`- Status: ${valueOrDash(row.status)}`);
    lines.push(`- Rekvirent: ${valueOrDash(row.requester)}`);
    lines.push(`- Afsender: ${valueOrDash(row.sender)}`, "");
  });

  if (rows.length > 50) {
    lines.push(`... ${rows.length - 50} yderligere prøvesvar findes i CSV og rå JSON.`, "");
  }

  return {
    id: "proevesvar",
    title: "Prøvesvar",
    markdown: lines.join("\n"),
    tables: [
      {
        name: "Prøvesvar",
        filename: "proevesvar.csv",
        rows
      }
    ],
    warnings: rows.length === 0 ? ["Ingen Svaroversigt.Laboratorieresultater fundet i de opsamlede responses."] : []
  };
}

function findSvaroversigter(responses: CapturedResponse[]) {
  return responses
    .map(response => getRecord(getRecord(response.body).Svaroversigt))
    .filter(candidate => Object.keys(candidate).length > 0);
}

function uniqueLabResults(results: Record<string, unknown>[]) {
  const seen = new Set<string>();
  return results.filter(result => {
    const key = labResultIdentityKey(result);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function htmlToText(value: unknown) {
  return normalizeText(
    String(value ?? "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
  );
}
