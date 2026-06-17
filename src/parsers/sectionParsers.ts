import type { CapturedResponse, SectionId } from "../shared/types";
import type { SectionExport } from "./exportTypes";
import { asArray, findResponse, getRecord, isoDate, readPath, valueOrDash } from "./helpers";

export function parseSection(sectionId: SectionId, responses: CapturedResponse[]): SectionExport {
  switch (sectionId) {
    case "medicin":
      return parseMedicin(responses);
    case "aftaler":
      return parseAftaler(responses);
    case "vaccinationer":
      return parseVaccinationer(responses);
    case "diagnoser":
      return parseDiagnoser(responses);
    default:
      return parseGeneric(sectionId, responses);
  }
}

function parseMedicin(responses: CapturedResponse[]): SectionExport {
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

function parseAftaler(responses: CapturedResponse[]): SectionExport {
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

function parseVaccinationer(responses: CapturedResponse[]): SectionExport {
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

function parseDiagnoser(responses: CapturedResponse[]): SectionExport {
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
