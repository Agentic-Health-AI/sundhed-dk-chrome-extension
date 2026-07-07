import type { CapturedResponse, SectionId } from "../shared/types";
import type { SectionExport } from "./exportTypes";
import { asArray, findResponse, getRecord, isoDate, normalizeText, readPath, valueOrDash } from "./helpers";

export function parseSection(sectionId: SectionId, responses: CapturedResponse[]): SectionExport {
  switch (sectionId) {
    case "medicin":
      return parseMedicin(responses);
    case "proevesvar":
      return parseProevesvar(responses);
    case "aftaler":
      return parseAftaler(responses);
    case "vaccinationer":
      return parseVaccinationer(responses);
    case "diagnoser":
      return parseDiagnoser(responses);
    case "journaler":
      return parseJournaler(responses);
    default:
      return parseGeneric(sectionId, responses);
  }
}

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

export function parseMedicin(responses: CapturedResponse[]): SectionExport {
  const lines = ["# Medicin", ""];
  const warnings: string[] = [];
  const identity = getRecord(findResponse(responses, "/identity/selectedname")?.body);
  const overview = getRecord(findResponse(responses, "/ordinations/overview")?.body);
  const prescriptions = getRecord(findResponse(responses, "/prescriptions/overview")?.body);
  const ordinations = asArray(findResponse(responses, /\/ordinations\/.*status=/)?.body).map(getRecord);

  if (identity.Full) {
    lines.push(`Patient: ${identity.Full}`, "");
  }

  if (Object.keys(overview).length > 0) {
    lines.push(
      `Oversigt: ${valueOrDash(overview.NumberOfActive)} aktive, ${valueOrDash(
        overview.NumberOfStopped
      )} stoppede, ${valueOrDash(overview.NumberOfTemporarilyStopped)} midlertidigt stoppede`,
      ""
    );
  }

  if (Object.keys(prescriptions).length > 0) {
    lines.push(
      `Recepter: ${valueOrDash(prescriptions.NumOpen)} åbne af ${valueOrDash(
        prescriptions.NumTotal
      )} totalt`,
      ""
    );
  }

  if (ordinations.length === 0) {
    warnings.push("Ingen ordinationer fundet i de opsamlede responses.");
    lines.push("Ingen medicinordinationer fundet.");
  } else {
    ordinations.forEach((medication, index) => {
      lines.push(`## ${index + 1}. ${valueOrDash(medication.DrugMedication)}`);
      lines.push(`- Aktivt stof: ${valueOrDash(medication.ActiveSubstance)}`);
      lines.push(`- Form: ${valueOrDash(medication.Form)}`);
      lines.push(`- Styrke: ${valueOrDash(medication.Strength)}`);
      lines.push(`- Dosering: ${valueOrDash(String(medication.Dosage ?? "").replace(/\n/g, " | "))}`);
      lines.push(`- Indikation: ${valueOrDash(medication.Cause)}`);
      lines.push(`- Start: ${valueOrDash(isoDate(medication.StartDate))}`);
      if (medication.EndDate) {
        lines.push(`- Slut: ${isoDate(medication.EndDate)}`);
      }
      lines.push(`- Status: ${valueOrDash(readPath(medication, ["Status", "EnumStr"]))}`, "");
    });
  }

  return {
    id: "medicin",
    title: "Medicin",
    markdown: lines.join("\n"),
    tables: [
      {
        name: "Medicin",
        filename: "medicin.csv",
        rows: ordinations.map(medication => ({
          drugName: medication.DrugMedication,
          activeSubstance: medication.ActiveSubstance,
          form: medication.Form,
          strength: medication.Strength,
          dosage: medication.Dosage,
          indication: medication.Cause,
          startDate: isoDate(medication.StartDate),
          endDate: isoDate(medication.EndDate),
          status: readPath(medication, ["Status", "EnumStr"])
        }))
      }
    ],
    warnings
  };
}

export function parseAftaler(responses: CapturedResponse[]): SectionExport {
  const body = getRecord(findResponse(responses, "/aftaler/cpr")?.body);
  const appointments = asArray(body.appointments).map(getRecord);
  const lines = ["# Aftaler", "", `Antal aftaler: ${appointments.length}`, ""];

  if (appointments.length === 0) {
    lines.push("Ingen kommende aftaler fundet.");
  }

  appointments.forEach((appointment, index) => {
    lines.push(`## ${index + 1}. ${valueOrDash(appointment.title)}`);
    lines.push(`- Dato: ${valueOrDash(readPath(appointment, ["startTimeDetailed", "dateFormatted"]))}`);
    lines.push(
      `- Tid: ${valueOrDash(readPath(appointment, ["startTimeDetailed", "timeFormatted"]))} - ${valueOrDash(
        readPath(appointment, ["endTimeDetailed", "timeFormatted"])
      )}`
    );
    lines.push(`- Organisation: ${valueOrDash(readPath(appointment, ["location", "organisation"]))}`);
    lines.push(`- Adresse: ${valueOrDash(readPath(appointment, ["location", "address", "formatted"]))}`);
    lines.push(`- Type: ${valueOrDash(appointment.appointmentType)}`, "");
  });

  return {
    id: "aftaler",
    title: "Aftaler",
    markdown: lines.join("\n"),
    tables: [
      {
        name: "Aftaler",
        filename: "aftaler.csv",
        rows: appointments.map(appointment => ({
          title: appointment.title,
          date: readPath(appointment, ["startTimeDetailed", "dateFormatted"]),
          startTime: readPath(appointment, ["startTimeDetailed", "timeFormatted"]),
          endTime: readPath(appointment, ["endTimeDetailed", "timeFormatted"]),
          organisation: readPath(appointment, ["location", "organisation"]),
          unit: readPath(appointment, ["location", "unitType"]),
          address: readPath(appointment, ["location", "address", "formatted"]),
          phone: readPath(appointment, ["location", "phone"]),
          appointmentType: appointment.appointmentType
        }))
      }
    ],
    warnings: []
  };
}

export function parseVaccinationer(responses: CapturedResponse[]): SectionExport {
  const overview = getRecord(findResponse(responses, "/vaccination/api/v1/overview")?.body);
  const vaccinations = asArray(
    responses.find(response => response.url.includes("/effectuatedvaccinations/") && !response.url.includes("onlyDeletedVaccines=true"))?.body
  ).map(getRecord);
  const lines = ["# Vaccinationer", ""];

  if (Object.keys(overview).length > 0) {
    lines.push(
      `Oversigt: ${valueOrDash(overview.NumberOfEffectuatedVaccinations)} gennemførte, ${valueOrDash(
        overview.NumberOfSelfcreatedVaccinations
      )} egenregistrerede, ${valueOrDash(overview.NumberOfPlannedVaccinations)} planlagte`,
      ""
    );
  }

  if (vaccinations.length === 0) {
    lines.push("Ingen vaccinationer fundet.");
  }

  vaccinations.forEach((vaccination, index) => {
    lines.push(`## ${index + 1}. ${valueOrDash(vaccination.Vaccine)}`);
    lines.push(`- Dato: ${valueOrDash(isoDate(vaccination.EffectuatedDateTime))}`);
    lines.push(`- Givet hos: ${valueOrDash(vaccination.EffectuatedBy)}`);
    lines.push(`- Varighed: ${valueOrDash(vaccination.CoverageDuration)}`);
    lines.push(`- Aktiv: ${vaccination.ActiveStatus ? "Ja" : "Nej"}`, "");
  });

  return {
    id: "vaccinationer",
    title: "Vaccinationer",
    markdown: lines.join("\n"),
    tables: [
      {
        name: "Vaccinationer",
        filename: "vaccinationer.csv",
        rows: vaccinations.map(vaccination => ({
          date: isoDate(vaccination.EffectuatedDateTime),
          vaccine: vaccination.Vaccine,
          effectuatedBy: vaccination.EffectuatedBy,
          coverageDuration: vaccination.CoverageDuration,
          active: Boolean(vaccination.ActiveStatus)
        }))
      }
    ],
    warnings: []
  };
}

export function parseDiagnoser(responses: CapturedResponse[]): SectionExport {
  const body = getRecord(findResponse(responses, "/diagnoser")?.body);
  const diagnoses = asArray(body.diagnoser).map(getRecord);
  const lines = ["# Diagnoser", ""];

  if (body.organization) {
    lines.push(`Lægepraksis: ${body.organization}`);
  }
  if ("isLiveData" in body) {
    lines.push(`Live data: ${body.isLiveData ? "Ja" : "Nej"}`);
  }
  lines.push("");

  if (diagnoses.length === 0) {
    lines.push("Ingen diagnoser fundet.");
  }

  diagnoses.forEach((diagnosis, index) => {
    lines.push(`${index + 1}. ${valueOrDash(diagnosis.diagnoseTekst || diagnosis.diagnoseKode)}`);
    if (diagnosis.diagnoseKode) {
      lines.push(`   Kode: ${diagnosis.diagnoseKode}`);
    }
    if (diagnosis.dato) {
      lines.push(`   Dato: ${diagnosis.dato}`);
    }
  });

  return {
    id: "diagnoser",
    title: "Diagnoser",
    markdown: lines.join("\n"),
    tables: [
      {
        name: "Diagnoser",
        filename: "diagnoser.csv",
        rows: diagnoses.map(diagnosis => ({
          organisation: body.organization,
          isLiveData: body.isLiveData,
          code: diagnosis.diagnoseKode,
          name: diagnosis.diagnoseTekst,
          date: diagnosis.dato
        }))
      }
    ],
    warnings: []
  };
}

export function parseJournaler(responses: CapturedResponse[]): SectionExport {
  const overview = getRecord(findResponse(responses, "/forloebsoversigt")?.body);
  const treatmentCourses = asArray(readCaseInsensitive(overview, "Forloeb")).map(getRecord);
  const documents = uniqueJournalDocuments([
    ...responses
      .filter(response => response.url.includes("/kontaktperioder"))
      .flatMap(journalContactPeriodsFromResponse),
    ...responses
      .filter(response => response.url.includes("/epikriser"))
      .flatMap(response => journalDocumentsFromResponse(response, "Epikrise")),
    ...responses
      .filter(response => response.url.includes("/notater"))
      .flatMap(response => journalDocumentsFromResponse(response, "Notat"))
  ]);
  const lines = [
    "# Journaler",
    "",
    `Antal forløb i oversigt: ${treatmentCourses.length}`,
    `Antal journaltekster: ${documents.length}`,
    ""
  ];
  const warnings: string[] = [];

  if (documents.length === 0) {
    lines.push("Ingen journaltekster fundet i de opsamlede responses.", "");
    if (
      treatmentCourses.some(
        course =>
          numberValue(readCaseInsensitive(course, "AntalNotater")) > 0 ||
          numberValue(readCaseInsensitive(course, "AntalEpikriser")) > 0 ||
          numberValue(readCaseInsensitive(course, "AntalKontaktperioder")) > 0
      )
    ) {
      warnings.push(
        "Forløbsoversigten viser journalindhold, men detail-endpoints /kontaktperioder, /notater og /epikriser blev ikke fanget. Åbn journaloversigten igen med opsamling aktiv, så forsøger Sundhedsarkiv selv at hente detaljerne."
      );
    } else {
      warnings.push("Ingen journalnotater eller epikriser fundet i de opsamlede responses.");
    }
  } else {
    documents.forEach((document, index) => {
      lines.push(`## ${index + 1}. ${valueOrDash(document.title || document.type)}`);
      lines.push(`- Type: ${valueOrDash(document.type)}`);
      lines.push(`- Dato: ${valueOrDash(document.date)}`);
      lines.push(`- Sygehus: ${valueOrDash(document.hospital)}`);
      lines.push(`- Afdeling: ${valueOrDash(document.department)}`);
      lines.push(`- Behandler: ${valueOrDash(document.clinician)}`);
      lines.push(`- Forløbsnøgle: ${valueOrDash(document.treatmentCourseKey)}`);
      lines.push("");
      if (document.text) {
        lines.push(document.text, "");
      }
    });
  }

  if (treatmentCourses.length > 0) {
    lines.push("## Forløbsoversigt", "");
    treatmentCourses.slice(0, 50).forEach((course, index) => {
      lines.push(`### ${index + 1}. ${valueOrDash(readCaseInsensitive(course, "DiagnoseNavn") || readCaseInsensitive(course, "AfdelingNavn"))}`);
      lines.push(`- Fra: ${valueOrDash(isoDate(readCaseInsensitive(course, "DatoFra")))}`);
      lines.push(`- Til: ${valueOrDash(isoDate(readCaseInsensitive(course, "DatoTil")))}`);
      lines.push(`- Sygehus: ${valueOrDash(readCaseInsensitive(course, "SygehusNavn"))}`);
      lines.push(`- Afdeling: ${valueOrDash(readCaseInsensitive(course, "AfdelingNavn"))}`);
      lines.push(`- Notater: ${valueOrDash(readCaseInsensitive(course, "AntalNotater"))}`);
      lines.push(`- Epikriser: ${valueOrDash(readCaseInsensitive(course, "AntalEpikriser"))}`, "");
    });
  }

  return {
    id: "journaler",
    title: "Journaler",
    markdown: lines.join("\n"),
    tables: [
      {
        name: "Journaltekster",
        filename: "journaltekster.csv",
        rows: documents
      },
      {
        name: "Journalforløb",
        filename: "journalforloeb.csv",
        rows: treatmentCourses.map(course => ({
          treatmentCourseKey: String(
            readPath(readCaseInsensitive(course, "IdNoegle"), ["Noegle"]) ??
              readPath(readCaseInsensitive(course, "IdNoegle"), ["noegle"]) ??
              ""
          ),
          startDate: isoDate(readCaseInsensitive(course, "DatoFra")),
          endDate: isoDate(readCaseInsensitive(course, "DatoTil")),
          updatedDate: isoDate(readCaseInsensitive(course, "DatoOpdateret")),
          hospital: readCaseInsensitive(course, "SygehusNavn"),
          department: readCaseInsensitive(course, "AfdelingNavn"),
          diagnosisName: readCaseInsensitive(course, "DiagnoseNavn"),
          diagnosisCode: readCaseInsensitive(course, "DiagnoseKode"),
          notesCount: readCaseInsensitive(course, "AntalNotater"),
          dischargeLettersCount: readCaseInsensitive(course, "AntalEpikriser"),
          contactPeriodsCount: readCaseInsensitive(course, "AntalKontaktperioder")
        }))
      }
    ],
    warnings
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
    const key = [
      result.RekvisitionsId,
      result.AnalysetypeId,
      result.Resultatdato,
      result.Resultat,
      result.Vaerdi,
      result.ProevenummerRekvirent,
      result.ProevenummerLaboratorie
    ].join("\u001f");
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

function journalDocumentsFromResponse(response: CapturedResponse, fallbackType: "Epikrise" | "Notat") {
  const body = getRecord(response.body);
  const primaryItems = asArray(readCaseInsensitive(body, fallbackType === "Epikrise" ? "Epikriser" : "Notater"));
  const items = (primaryItems.length > 0 ? primaryItems : asArray(readCaseInsensitive(body, "Notater"))).map(getRecord);
  const treatmentCourseKey = parseNoegleFromUrl(response.url);

  return items.map(item => {
    const unit = getRecord(readCaseInsensitive(item, "EnhedsInformation"));
    const title = htmlToText(readCaseInsensitive(item, "Overskrift"));
    const bodyText = htmlToText(readCaseInsensitive(item, "Broedtekst") || readCaseInsensitive(item, "Fritekst"));

    return {
      type: readCaseInsensitive(item, "NotatType") || fallbackType,
      date: isoDate(readCaseInsensitive(item, "DatoFra")),
      title,
      text: bodyText,
      hospital: readCaseInsensitive(unit, "Institution"),
      department: readCaseInsensitive(unit, "Afdeling"),
      clinician: readCaseInsensitive(item, "BehandlerNavn"),
      treatmentCourseKey
    };
  });
}

function uniqueJournalDocuments<T extends Record<string, unknown>>(documents: T[]) {
  const seen = new Set<string>();
  return documents.filter(document => {
    const key = [
      document.type,
      document.date,
      document.title,
      document.text,
      document.treatmentCourseKey
    ].join("\u001f");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function journalContactPeriodsFromResponse(response: CapturedResponse) {
  const body = getRecord(response.body);
  const items = asArray(readCaseInsensitive(body, "Kontaktperioder")).map(getRecord);
  const treatmentCourseKey = parseNoegleFromUrl(response.url);

  return items.map(item => {
    const unit = getRecord(readCaseInsensitive(item, "EnhedsInformation"));
    const title = htmlToText(
      readCaseInsensitive(item, "Status") || readCaseInsensitive(item, "Prioritet") || "Kontaktperiode"
    );
    const bodyText = htmlToText(readCaseInsensitive(item, "Fritekst"));

    return {
      type: "Kontaktperiode",
      date: isoDate(readCaseInsensitive(item, "DatoFra")),
      title,
      text: bodyText,
      hospital: readCaseInsensitive(unit, "Institution"),
      department: readCaseInsensitive(unit, "Afdeling"),
      clinician: readCaseInsensitive(item, "LaegeligAnsvarlig"),
      treatmentCourseKey
    };
  });
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

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseGeneric(sectionId: SectionId, responses: CapturedResponse[]): SectionExport {
  const lines = [`# ${sectionId}`, "", `${responses.length} API-responses opsamlet.`, ""];
  responses.forEach((response, index) => {
    lines.push(`## ${index + 1}. ${response.method} ${response.status}`);
    lines.push(`- URL: ${response.url}`);
    lines.push(`- Tidspunkt: ${response.capturedAt}`);
    lines.push("");
  });

  return {
    id: sectionId,
    title: sectionId,
    markdown: lines.join("\n"),
    tables: [],
    warnings: ["Sektionen eksporteres foreløbigt som rå JSON og summarisk Markdown."]
  };
}
