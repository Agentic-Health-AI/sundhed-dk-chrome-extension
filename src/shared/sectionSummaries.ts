import { asArray, getRecord } from "../parsers/helpers";
import type { CapturedResponse, SectionId, SectionProgress } from "./types";
import type { HealthSection } from "./sections";

type SummaryRule = {
  recordLabel: string;
  dataEndpointMatchers: string[];
  countRecords: (responses: CapturedResponse[]) => number;
  dataFoundDetail: (recordCount: number, apiResponseCount: number) => string;
  missingDetail: string;
  actionHint?: string;
  rawOnly?: boolean;
};

const SUMMARY_RULES: Partial<Record<Exclude<SectionId, "ukendt">, SummaryRule>> = {
  medicin: {
    recordLabel: "medicinrækker",
    dataEndpointMatchers: ["/ordinations/"],
    countRecords: responses => asArray(findBody(responses, response => response.url.includes("/ordinations/") && response.url.includes("status="))).length,
    dataFoundDetail: count => `${count} medicinrækker fundet`,
    missingDetail: "Åbn medicinkortet, og vent til aktuel medicin er indlæst."
  },
  proevesvar: {
    recordLabel: "laboratorieresultater",
    dataEndpointMatchers: ["/svaroversigt"],
    countRecords: responses => countBestSvaroversigt(responses),
    dataFoundDetail: count => `${count} laboratorieresultater fundet`,
    missingDetail: "Åbn prøvesvar, og vent til svaroversigten er indlæst.",
    actionHint: "Udvid perioden på sundhed.dk, fx til 2 år, hvis du vil have mere historik med."
  },
  vaccinationer: {
    recordLabel: "vaccinationer",
    dataEndpointMatchers: ["/effectuatedvaccinations/", "/overview"],
    countRecords: responses =>
      asArray(findBody(responses, response => response.url.includes("/effectuatedvaccinations/") && !response.url.includes("onlyDeletedVaccines=true"))).length,
    dataFoundDetail: count => `${count} vaccinationer fundet`,
    missingDetail: "Siden er besøgt, men vaccinationsdata-endpointet er ikke set endnu."
  },
  aftaler: {
    recordLabel: "aftaler",
    dataEndpointMatchers: ["/aftaler/cpr"],
    countRecords: responses => asArray(getRecord(findBody(responses, response => response.url.includes("/aftaler/cpr"))).appointments).length,
    dataFoundDetail: count => `${count} aftaler fundet`,
    missingDetail: "Åbn aftaler, og vent til aftalelisten er indlæst."
  },
  journaler: {
    recordLabel: "journal-responses",
    dataEndpointMatchers: ["/forloebsoversigt", "/datofiltrering", "/filtervalg"],
    countRecords: responses => responses.filter(response => response.url.includes("/api/ejournal/")).length,
    dataFoundDetail: (_count, apiCount) => `${apiCount} journal-kald fundet som rå JSON`,
    missingDetail: "Åbn journal fra sygehus, og vent til forløbsoversigten er indlæst.",
    actionHint: "Klik ind på relevante forløb/notater på sundhed.dk, hvis detaljerne skal med.",
    rawOnly: true
  },
  henvisninger: {
    recordLabel: "henvisninger",
    dataEndpointMatchers: ["/henvisninger"],
    countRecords: responses => asArray(findBody(responses, response => response.url.toLowerCase().includes("/henvisninger"))).length,
    dataFoundDetail: count => `${count} henvisninger fundet`,
    missingDetail: "Åbn henvisninger, og vent til listen er indlæst."
  },
  "egen-laege": {
    recordLabel: "lægeoplysninger",
    dataEndpointMatchers: ["/minlaegeorganization/", "/eserviceslink/", "/core/organisation/"],
    countRecords: responses => (responses.some(response => response.url.includes("/minlaegeorganization/")) ? 1 : 0),
    dataFoundDetail: count => `${count} sæt lægeoplysninger fundet`,
    missingDetail: "Åbn egen læge, og vent til praksisoplysninger er indlæst."
  },
  roentgen: {
    recordLabel: "billedbeskrivelser",
    dataEndpointMatchers: ["/billedbeskrivelser/henvisninger/"],
    countRecords: responses => countArrayLikeBody(findBody(responses, response => response.url.includes("/billedbeskrivelser/henvisninger/"))),
    dataFoundDetail: count => `${count} billedbeskrivelser fundet`,
    missingDetail: "Åbn røntgen/billedbeskrivelser, og vent til listen er indlæst.",
    actionHint: "Klik ind på relevante beskrivelser på sundhed.dk, hvis detaljer skal med."
  },
  diagnoser: {
    recordLabel: "diagnoser",
    dataEndpointMatchers: ["/diagnoser"],
    countRecords: responses => asArray(getRecord(findBody(responses, response => response.url.includes("/diagnoser"))).diagnoser).length,
    dataFoundDetail: count => `${count} diagnoser fundet`,
    missingDetail: "Åbn diagnoser, og vent til diagnoselisten er indlæst."
  },
  hjemmemaalinger: {
    recordLabel: "målinger",
    dataEndpointMatchers: ["/maalinger"],
    countRecords: responses => countArrayLikeBody(findBody(responses, response => response.url.includes("/maalinger"))),
    dataFoundDetail: count => `${count} hjemmemålinger fundet`,
    missingDetail: "Åbn hjemmemålinger, og vent til målinger er indlæst."
  },
  forloebsplaner: {
    recordLabel: "forløbsplaner",
    dataEndpointMatchers: ["/plans/"],
    countRecords: responses => countArrayLikeBody(findBody(responses, response => response.url.includes("/plans/"))),
    dataFoundDetail: count => `${count} forløbsplaner fundet`,
    missingDetail: "Åbn forløbsplaner, og vent til planerne er indlæst."
  }
};

export function buildSectionProgress(section: HealthSection, allResponses: CapturedResponse[]): SectionProgress {
  const responses = allResponses.filter(response => response.sectionId === section.id);
  const rule = SUMMARY_RULES[section.id];
  const apiResponseCount = responses.length;
  const recordCount = rule?.countRecords(responses) ?? apiResponseCount;
  const dataEndpointSeen = rule ? responses.some(response => hasAnyMatcher(response.url, rule.dataEndpointMatchers)) : apiResponseCount > 0;
  const status = getStatus(apiResponseCount, recordCount, dataEndpointSeen, Boolean(rule?.rawOnly));

  return {
    sectionId: section.id,
    label: section.label,
    path: section.path,
    count: apiResponseCount,
    apiResponseCount,
    recordCount,
    recordLabel: rule?.recordLabel ?? "API-responses",
    status,
    detail: getDetail(rule, status, recordCount, apiResponseCount),
    actionHint: status === "data-found" || status === "raw-only" ? rule?.actionHint : rule?.missingDetail,
    lastCapturedAt: responses.at(-1)?.capturedAt
  };
}

function getStatus(
  apiResponseCount: number,
  recordCount: number,
  dataEndpointSeen: boolean,
  rawOnly: boolean
): SectionProgress["status"] {
  if (apiResponseCount === 0) {
    return "not-started";
  }
  if (!dataEndpointSeen) {
    return "needs-action";
  }
  if (rawOnly) {
    return "raw-only";
  }
  if (recordCount > 0) {
    return "data-found";
  }
  return "opened";
}

function getDetail(
  rule: SummaryRule | undefined,
  status: SectionProgress["status"],
  recordCount: number,
  apiResponseCount: number
) {
  if (!rule) {
    return apiResponseCount > 0 ? `${apiResponseCount} API-kald fundet` : "Ikke gennemgået endnu";
  }
  if (status === "not-started") {
    return "Ikke gennemgået endnu";
  }
  if (status === "needs-action") {
    return rule.missingDetail;
  }
  return rule.dataFoundDetail(recordCount, apiResponseCount);
}

function findBody(responses: CapturedResponse[], predicate: (response: CapturedResponse) => boolean) {
  return responses.find(predicate)?.body;
}

function countBestSvaroversigt(responses: CapturedResponse[]) {
  return Math.max(
    0,
    ...responses.map(response => asArray(getRecord(getRecord(response.body).Svaroversigt).Laboratorieresultater).length)
  );
}

function countArrayLikeBody(body: unknown) {
  if (Array.isArray(body)) {
    return body.length;
  }

  const record = getRecord(body);
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      return value.length;
    }
  }
  return Object.keys(record).length > 0 ? 1 : 0;
}

function hasAnyMatcher(url: string, matchers: string[]) {
  const normalizedUrl = url.toLowerCase();
  return matchers.some(matcher => normalizedUrl.includes(matcher.toLowerCase()));
}
