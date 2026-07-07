import { describe, expect, it } from "vitest";
import { parseAftaler, parseJournaler, parseMedicin, parseProevesvar, parseSection } from "./sectionParsers";
import { aftaleResponses, medicinResponses, proevesvarResponses } from "../test/fixtures";

describe("section parsers", () => {
  it("parses medication responses to markdown and CSV rows", () => {
    const result = parseMedicin(medicinResponses);

    expect(result.markdown).toContain("Patient: Test Patient");
    expect(result.markdown).toContain("Ovison (Mometason)");
    expect(result.tables[0]?.rows).toEqual([
      expect.objectContaining({
        drugName: "Ovison (Mometason)",
        activeSubstance: "Mometason",
        startDate: "2025-12-11",
        status: "Active"
      })
    ]);
  });

  it("parses appointment responses to a flat table", () => {
    const result = parseAftaler(aftaleResponses);

    expect(result.markdown).toContain("Blodprøve");
    expect(result.tables[0]?.rows[0]).toEqual(
      expect.objectContaining({
        title: "Blodprøve",
        date: "17.06.2026",
        organisation: "Testhospitalet",
        appointmentType: "Fremmøde"
      })
    );
  });

  it("parses lab results from Svaroversigt responses", () => {
    const result = parseProevesvar(proevesvarResponses);

    expect(result.markdown).toContain("Antal prøvesvar: 2");
    expect(result.markdown).toContain("Hæmoglobin;B");
    expect(result.tables[0]?.filename).toBe("proevesvar.csv");
    expect(result.tables[0]?.rows).toHaveLength(2);
    expect(result.tables[0]?.rows[0]).toEqual(
      expect.objectContaining({
        analysisName: "Hæmoglobin;B",
        sampleDate: "2026-06-01",
        result: "8,7 mmol/L",
        requester: "Testklinik"
      })
    );
  });

  it("parses journal notes and discharge letters to markdown and CSV rows", () => {
    const result = parseJournaler([
      {
        id: "journal-overview",
        sectionId: "journaler",
        sectionLabel: "Journaler",
        url: "https://www.sundhed.dk/app/ejournalportalborger/api/ejournal/forloebsoversigt",
        method: "GET",
        status: 200,
        source: "fetch",
        capturedAt: "2026-06-17T12:00:00.000Z",
        body: {
          Forloeb: [
            {
              AntalNotater: 1,
              AntalEpikriser: 1,
              AntalKontaktperioder: 1,
              SygehusNavn: "Testhospitalet",
              AfdelingNavn: "Testafdeling",
              DiagnoseNavn: "Testdiagnose",
              IdNoegle: { Noegle: "forloeb-1" },
              DatoFra: "2026-01-01T00:00:00+01:00"
            }
          ]
        }
      },
      {
        id: "journal-contact-period",
        sectionId: "journaler",
        sectionLabel: "Journaler",
        url: 'https://www.sundhed.dk/app/ejournalportalborger/api/ejournal/kontaktperioder?noegle={"Database":null,"Noegle":"forloeb-1","VaerdispringNoegle":null}',
        method: "GET",
        status: 200,
        source: "fetch",
        capturedAt: "2026-06-17T12:00:30.000Z",
        body: {
          kontaktperioder: [
            {
              status: "Afsluttet",
              datoFra: "2026-01-01T10:00:00+01:00",
              fritekst: "Kontaktperiode med relevant tekst.",
              laegeligAnsvarlig: "Test Læge",
              enhedsInformation: { institution: "Testhospitalet", afdeling: "Testafdeling" }
            }
          ]
        }
      },
      {
        id: "journal-note",
        sectionId: "journaler",
        sectionLabel: "Journaler",
        url: 'https://www.sundhed.dk/app/ejournalportalborger/api/ejournal/notater?noegle={"Database":null,"Noegle":"forloeb-1","VaerdispringNoegle":null}',
        method: "GET",
        status: 200,
        source: "fetch",
        capturedAt: "2026-06-17T12:01:00.000Z",
        body: {
          notater: [
            {
              notatType: "Journalnotat",
              datoFra: "2026-01-02T10:00:00+01:00",
              overskrift: "Kontrolnotat",
              broedtekst: "<p>Patienten har det godt.</p>",
              behandlerNavn: "Test Behandler",
              enhedsInformation: { institution: "Testhospitalet", afdeling: "Testafdeling" }
            }
          ]
        }
      },
      {
        id: "journal-discharge",
        sectionId: "journaler",
        sectionLabel: "Journaler",
        url: 'https://www.sundhed.dk/app/ejournalportalborger/api/ejournal/epikriser?noegle={"Database":null,"Noegle":"forloeb-1","VaerdispringNoegle":null}',
        method: "GET",
        status: 200,
        source: "fetch",
        capturedAt: "2026-06-17T12:02:00.000Z",
        body: {
          Epikriser: [
            {
              NotatType: "Epikrise",
              DatoFra: "2026-01-03T10:00:00+01:00",
              Overskrift: "Udskrivningsbrev",
              Fritekst: "Planlagt opfølgning.",
              EnhedsInformation: { Institution: "Testhospitalet", Afdeling: "Testafdeling" }
            }
          ]
        }
      }
    ]);

    expect(result.warnings).toHaveLength(0);
    expect(result.markdown).toContain("Antal journaltekster: 3");
    expect(result.markdown).toContain("Kontaktperiode med relevant tekst.");
    expect(result.markdown).toContain("Patienten har det godt.");
    expect(result.markdown).toContain("Planlagt opfølgning.");
    expect(result.tables[0]?.filename).toBe("journaltekster.csv");
    expect(result.tables[0]?.rows).toHaveLength(3);
    expect(result.tables[0]?.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "Kontaktperiode",
          title: "Afsluttet",
          text: "Kontaktperiode med relevant tekst.",
          treatmentCourseKey: "forloeb-1"
        }),
        expect.objectContaining({
          type: "Journalnotat",
          title: "Kontrolnotat",
          text: "Patienten har det godt.",
          treatmentCourseKey: "forloeb-1"
        }),
        expect.objectContaining({
          type: "Epikrise",
          title: "Udskrivningsbrev",
          text: "Planlagt opfølgning.",
          treatmentCourseKey: "forloeb-1"
        })
      ])
    );
  });

  it("parses journal page endpoints that return Notater arrays", () => {
    const result = parseJournaler([
      {
        id: "journal-discharge-page",
        sectionId: "journaler",
        sectionLabel: "Journaler",
        url: 'https://www.sundhed.dk/app/ejournalportalborger/api/ejournal/epikriser-page?noegle={"Database":null,"Noegle":"forloeb-1","VaerdispringNoegle":null}',
        method: "POST",
        status: 200,
        source: "fetch",
        capturedAt: "2026-06-17T12:02:00.000Z",
        body: {
          TotalCount: 1,
          Notater: [
            {
              NotatType: "Epikrise",
              DatoFra: "2026-01-03T10:00:00+01:00",
              Overskrift: "Udskrivningsbrev",
              Broedtekst: "<p>Side-endpoint tekst.</p>",
              EnhedsInformation: { Institution: "Testhospitalet", Afdeling: "Testafdeling" }
            }
          ]
        }
      }
    ]);

    expect(result.markdown).toContain("Antal journaltekster: 1");
    expect(result.markdown).toContain("Side-endpoint tekst.");
    expect(result.tables[0]?.rows[0]).toEqual(
      expect.objectContaining({
        type: "Epikrise",
        title: "Udskrivningsbrev",
        text: "Side-endpoint tekst.",
        treatmentCourseKey: "forloeb-1"
      })
    );
  });

  it("deduplicates journal documents captured from both list and page endpoints", () => {
    const sharedNote = {
      NotatType: "Journalnotat",
      DatoFra: "2026-01-02T10:00:00+01:00",
      Overskrift: "Samme notat",
      Broedtekst: "<p>Samme tekst.</p>",
      EnhedsInformation: { Institution: "Testhospitalet", Afdeling: "Testafdeling" }
    };
    const result = parseJournaler([
      {
        id: "journal-note",
        sectionId: "journaler",
        sectionLabel: "Journaler",
        url: 'https://www.sundhed.dk/app/ejournalportalborger/api/ejournal/notater?noegle={"Database":null,"Noegle":"forloeb-1","VaerdispringNoegle":null}',
        method: "GET",
        status: 200,
        source: "fetch",
        capturedAt: "2026-06-17T12:01:00.000Z",
        body: { Notater: [sharedNote] }
      },
      {
        id: "journal-note-page",
        sectionId: "journaler",
        sectionLabel: "Journaler",
        url: 'https://www.sundhed.dk/app/ejournalportalborger/api/ejournal/notater-page?noegle={"Database":null,"Noegle":"forloeb-1","VaerdispringNoegle":null}',
        method: "POST",
        status: 200,
        source: "fetch",
        capturedAt: "2026-06-17T12:01:01.000Z",
        body: { Notater: [sharedNote] }
      }
    ]);

    expect(result.tables[0]?.rows).toHaveLength(1);
    expect(result.markdown).toContain("Antal journaltekster: 1");
  });

  it("falls back to generic markdown for unsupported sections", () => {
    const result = parseSection("ukendt", []);

    expect(result.warnings).toHaveLength(1);
    expect(result.markdown).toContain("0 API-responses opsamlet");
  });
});
