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
    actionHint: "Sundhedsarkiv forsøger selv at hente prøvesvar 5 år tilbage, når svaroversigten indlæses."
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
    recordLabel: "journaltekster",
    dataEndpointMatchers: ["/kontaktperioder", "/notater", "/epikriser"],
    countRecords: responses => countJournalDocuments(responses),
    dataFoundDetail: count => `${count} journaltekster fundet`,
    missingDetail: "Journaltekster mangler. Åbn journaloversigten igen med opsamling aktiv, så forsøger Sundhedsarkiv selv at hente detaljerne.",
    actionHint: "Sundhedsarkiv forsøger selv at hente flere journaltekster fra forløbsoversigten."
  },
  henvisninger: {
    recordLabel: "henvisninger",
    dataEndpointMatchers: ["/dennationalehenvisningsformidling/api/v1/henvisninger"],
    countRecords: responses => countHenvisninger(findBody(responses, response => response.url.toLowerCase().includes("dennationalehenvisningsformidling"))),
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
    countRecords: responses => countBilledbeskrivelser(findBody(responses, response => response.url.includes("/billedbeskrivelser/henvisninger/"))),
    dataFoundDetail: count => `${count} billedbeskrivelser fundet`,
    missingDetail: "Åbn røntgen/billedbeskrivelser, og vent til listen er indlæst.",
    actionHint: "Sundhedsarkiv forsøger selv at hente alle sider i listen, når billedbeskrivelser indlæses."
  },
  diagnoser: {
    recordLabel: "diagnoser",
    dataEndpointMatchers: ["/diagnoserborger/api/v1/diagnoser"],
    countRecords: responses => asArray(getRecord(findBody(responses, response => response.url.includes("/diagnoser"))).diagnoser).length,
    dataFoundDetail: count => `${count} diagnoser fundet`,
    missingDetail: "Åbn diagnoser, og vent til diagnoselisten er indlæst."
  },
  hjemmemaalinger: {
    recordLabel: "målinger",
    dataEndpointMatchers: ["/maalinger"],
    countRecords: responses => countDocumentsOrGroupings(findBody(responses, response => response.url.includes("/maalinger"))),
    dataFoundDetail: count => `${count} hjemmemålinger fundet`,
    missingDetail: "Åbn hjemmemålinger, og vent til målinger er indlæst."
  },
  forloebsplaner: {
    recordLabel: "forløbsplaner",
    dataEndpointMatchers: ["/plans/"],
    countRecords: responses => asArray(getRecord(findBody(responses, response => response.url.includes("/plans/"))).plans).length,
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
  if (recordCount > 0 || dataEndpointSeen) {
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

function countJournalDocuments(responses: CapturedResponse[]) {
  const keys = new Set<string>();

  responses.forEach(response => {
    const body = getRecord(response.body);
    if (response.url.includes("/notater")) {
      addJournalDocumentKeys(keys, "notat", response.url, asArray(readCaseInsensitive(body, "Notater")));
      return;
    }
    if (response.url.includes("/epikriser")) {
      const epikriser = asArray(readCaseInsensitive(body, "Epikriser"));
      addJournalDocumentKeys(keys, "epikrise", response.url, epikriser.length > 0 ? epikriser : asArray(readCaseInsensitive(body, "Notater")));
      return;
    }
    if (response.url.includes("/kontaktperioder")) {
      addJournalDocumentKeys(keys, "kontaktperiode", response.url, asArray(readCaseInsensitive(body, "Kontaktperioder")));
    }
  });

  return keys.size;
}

function addJournalDocumentKeys(keys: Set<string>, type: string, url: string, items: unknown[]) {
  items.map(getRecord).forEach((item, index) => {
    keys.add(
      [
        type,
        parseNoegleFromUrl(url),
        readCaseInsensitive(item, "Noegle"),
        readCaseInsensitive(item, "DatoFra"),
        readCaseInsensitive(item, "Overskrift"),
        readCaseInsensitive(item, "Broedtekst") || readCaseInsensitive(item, "Fritekst"),
        index
      ].join("\u001f")
    );
  });
}

function countHenvisninger(body: unknown) {
  const record = getRecord(body);
  return asArray(record.aktiveHenvisninger).length + asArray(record.tidligereHenvisninger).length;
}

function countBilledbeskrivelser(body: unknown) {
  const record = getRecord(body);
  if (typeof record.TotalItems === "number") {
    return record.TotalItems;
  }
  return asArray(record.Svar).length;
}

function readCaseInsensitive(record: Record<string, unknown>, key: string) {
  if (key in record) {
    return record[key];
  }

  const normalizedKey = key.toLowerCase();
  const matchingKey = Object.keys(record).find(candidate => candidate.toLowerCase() === normalizedKey);
  return matchingKey ? record[matchingKey] : undefined;
}

function parseNoegleFromUrl(url: string) {
  try {
    const raw = new URL(url).searchParams.get("noegle");
    if (!raw) {
      return "";
    }
    const parsed = JSON.parse(raw) as unknown;
    const key = readCaseInsensitive(getRecord(parsed), "Noegle");
    return typeof key === "string" ? key : "";
  } catch {
    return "";
  }
}

function countDocumentsOrGroupings(body: unknown) {
  const record = getRecord(body);
  const documents = asArray(record.documents);
  if (documents.length > 0) {
    return documents.length;
  }
  return asArray(record.groupings).length;
}

function hasAnyMatcher(url: string, matchers: string[]) {
  const normalizedUrl = url.toLowerCase();
  return matchers.some(matcher => normalizedUrl.includes(matcher.toLowerCase()));
}
