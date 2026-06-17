import type { SectionId } from "./types";

export type HealthSection = {
  id: Exclude<SectionId, "ukendt">;
  label: string;
  shortLabel: string;
  path: string;
  matchers: string[];
  exportPriority: number;
};

export const HEALTH_SECTIONS: HealthSection[] = [
  {
    id: "medicin",
    label: "Medicin",
    shortLabel: "Medicin",
    path: "https://www.sundhed.dk/borger/min-side/min-sundhedsjournal/medicinkortet/",
    matchers: ["medicinkort2borger"],
    exportPriority: 10
  },
  {
    id: "proevesvar",
    label: "Prøvesvar",
    shortLabel: "Prøvesvar",
    path: "https://www.sundhed.dk/borger/min-side/min-sundhedsjournal/laboratoriesvar/",
    matchers: ["labsvar", "proevesvarportal"],
    exportPriority: 20
  },
  {
    id: "journaler",
    label: "Journaler",
    shortLabel: "Journaler",
    path: "https://www.sundhed.dk/borger/min-side/min-sundhedsjournal/journal-fra-sygehus/",
    matchers: ["ejournal", "ejournalportalborger", "ejournalportalsj"],
    exportPriority: 30
  },
  {
    id: "vaccinationer",
    label: "Vaccinationer",
    shortLabel: "Vacciner",
    path: "https://www.sundhed.dk/borger/min-side/min-sundhedsjournal/vaccinationer/",
    matchers: ["vaccination"],
    exportPriority: 40
  },
  {
    id: "aftaler",
    label: "Aftaler",
    shortLabel: "Aftaler",
    path: "https://www.sundhed.dk/borger/min-side/min-sundhedsjournal/aftaler/",
    matchers: ["aftaler", "aftalerborger"],
    exportPriority: 50
  },
  {
    id: "roentgen",
    label: "Røntgen",
    shortLabel: "Røntgen",
    path: "https://www.sundhed.dk/borger/min-side/min-sundhedsjournal/billedbeskrivelser/",
    matchers: ["billedbeskrivelser", "billedbeskrivelserborger"],
    exportPriority: 80
  },
  {
    id: "henvisninger",
    label: "Henvisninger",
    shortLabel: "Henvisn.",
    path: "https://www.sundhed.dk/borger/min-side/min-sundhedsjournal/henvisninger/",
    matchers: ["henvisning", "envisning", "dennationalehenvisningsformidling"],
    exportPriority: 60
  },
  {
    id: "egen-laege",
    label: "Egen læge",
    shortLabel: "Læge",
    path: "https://www.sundhed.dk/borger/min-side/min-sundhedsjournal/min-laege/",
    matchers: ["organisation", "organization", "minlaegeorganization", "eserviceslink"],
    exportPriority: 70
  },
  {
    id: "diagnoser",
    label: "Diagnoser",
    shortLabel: "Diagnoser",
    path: "https://www.sundhed.dk/borger/min-side/min-sundhedsjournal/diagnoser/",
    matchers: ["diagnoser", "diagnoserborger"],
    exportPriority: 90
  },
  {
    id: "hjemmemaalinger",
    label: "Hjemmemålinger",
    shortLabel: "Målinger",
    path: "https://www.sundhed.dk/borger/min-side/min-sundhedsjournal/hjemmemaalinger/",
    matchers: ["maalinger", "hjemmemaalingborger", "hjemmemaalingerborger"],
    exportPriority: 100
  },
  {
    id: "forloebsplaner",
    label: "Forløbsplaner",
    shortLabel: "Planer",
    path: "https://www.sundhed.dk/borger/min-side/min-sundhedsjournal/planer/",
    matchers: ["planer", "planerportalborger"],
    exportPriority: 110
  }
];

export function getSection(sectionId: SectionId) {
  return HEALTH_SECTIONS.find(section => section.id === sectionId);
}
