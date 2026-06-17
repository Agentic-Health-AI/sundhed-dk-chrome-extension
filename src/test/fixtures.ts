import type { CapturedResponse, SectionId } from "../shared/types";

export function capturedResponse(sectionId: SectionId, url: string, body: unknown): CapturedResponse {
  return {
    id: `test-${sectionId}-${Math.random().toString(36).slice(2)}`,
    sectionId,
    sectionLabel: sectionId,
    url,
    method: "GET",
    status: 200,
    source: "fetch",
    capturedAt: "2026-06-17T12:00:00.000Z",
    body
  };
}

export const medicinResponses = [
  capturedResponse("medicin", "https://www.sundhed.dk/app/medicinkort2borger/api/v1/identity/selectedname", {
    Full: "Test Patient"
  }),
  capturedResponse("medicin", "https://www.sundhed.dk/app/medicinkort2borger/api/v1/ordinations/overview/", {
    NumberOfActive: 1,
    NumberOfStopped: 2,
    NumberOfTemporarilyStopped: 0
  }),
  capturedResponse(
    "medicin",
    "https://www.sundhed.dk/app/medicinkort2borger/api/v1/ordinations/?orderBy=StartDate&sortBy=desc&status=active",
    [
      {
        DrugMedication: "Ovison (Mometason)",
        ActiveSubstance: "Mometason",
        Form: "creme",
        Strength: "1 mg/g",
        Dosage: "1 påsmøring daglig.\nBemærk: i 2 uger",
        Cause: "mod eksem",
        StartDate: "2025-12-11T00:00:00",
        Status: { EnumStr: "Active" }
      }
    ]
  )
];

export const aftaleResponses = [
  capturedResponse("aftaler", "https://www.sundhed.dk/app/aftaler/api/v1/aftaler/cpr", {
    appointments: [
      {
        title: "Blodprøve",
        startTimeDetailed: { dateFormatted: "17.06.2026", timeFormatted: "09:15" },
        endTimeDetailed: { timeFormatted: "09:30" },
        location: {
          organisation: "Testhospitalet",
          unitType: "Klinik",
          address: { formatted: "Testvej 1" },
          phone: "12345678"
        },
        appointmentType: "Fremmøde"
      }
    ]
  })
];

export const proevesvarResponses = [
  capturedResponse("proevesvar", "https://www.sundhed.dk/api/labsvar/svaroversigt?fra=2026-01-01&til=2026-06-17", {
    Svaroversigt: {
      Analysetyper: [
        {
          Id: "analysis-1",
          Titel: "Hæmoglobin",
          LangtNavn_html: "Hæmoglobin;B"
        }
      ],
      Rekvisitioner: [
        {
          Id: "req-1",
          Proevetagningstidspunkt: "2026-06-01T09:30:00",
          Svartidspunkt: "2026-06-01T13:15:00",
          Rekvirent_html: "Testklinik",
          Afsender_html: "Testlaboratoriet",
          Laboratorieomraade: "Klinisk biokemi"
        }
      ],
      Laboratorieresultater: [
        {
          AnalysetypeId: "analysis-1",
          RekvisitionsId: "req-1",
          Vaerdi: "8,7",
          Vaerditype: "Numerisk",
          Resultat: "8,7 mmol/L",
          Resultatdato: "2026-06-01T13:00:00",
          ResultatStatus: "Endeligt",
          Resultattype: "Tal",
          ProevenummerRekvirent: "rek-1",
          ProevenummerLaboratorie: "lab-1"
        }
      ]
    }
  }),
  capturedResponse("proevesvar", "https://www.sundhed.dk/app/proevesvarportal/api/v1/svaroversigt?fra=2024-06-17&til=2026-06-17", {
    Svaroversigt: {
      Analysetyper: [
        {
          Id: "analysis-1",
          Titel: "Hæmoglobin",
          LangtNavn_html: "Hæmoglobin;B"
        },
        {
          Id: "analysis-2",
          Titel: "Leukocytter",
          LangtNavn_html: "Leukocytter;B"
        }
      ],
      Rekvisitioner: [
        {
          Id: "req-1",
          Proevetagningstidspunkt: "2026-06-01T09:30:00",
          Svartidspunkt: "2026-06-01T13:15:00",
          Rekvirent_html: "Testklinik",
          Afsender_html: "Testlaboratoriet",
          Laboratorieomraade: "Klinisk biokemi"
        }
      ],
      Laboratorieresultater: [
        {
          AnalysetypeId: "analysis-1",
          RekvisitionsId: "req-1",
          Vaerdi: "8,7",
          Vaerditype: "Numerisk",
          Resultat: "8,7 mmol/L",
          Resultatdato: "2026-06-01T13:00:00",
          ResultatStatus: "Endeligt",
          Resultattype: "Tal",
          ProevenummerRekvirent: "rek-1",
          ProevenummerLaboratorie: "lab-1"
        },
        {
          AnalysetypeId: "analysis-2",
          RekvisitionsId: "req-1",
          Vaerdi: "6,1",
          Vaerditype: "Numerisk",
          Resultat: "6,1 mia./L",
          Resultatdato: "2026-06-01T13:00:00",
          ResultatStatus: "Endeligt",
          Resultattype: "Tal",
          ProevenummerRekvirent: "rek-1",
          ProevenummerLaboratorie: "lab-1"
        }
      ]
    }
  })
];
