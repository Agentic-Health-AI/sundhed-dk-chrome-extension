import type { SectionId } from "../shared/types";

export type CsvTable = {
  name: string;
  filename: string;
  rows: Record<string, unknown>[];
};

export type SectionExport = {
  id: SectionId;
  title: string;
  markdown: string;
  tables: CsvTable[];
  warnings: string[];
};
