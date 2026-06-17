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
