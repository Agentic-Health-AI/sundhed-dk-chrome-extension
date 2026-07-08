export type CaptureStatus = "idle" | "capturing";

export type SectionId =
  | "medicin"
  | "proevesvar"
  | "journaler"
  | "vaccinationer"
  | "aftaler"
  | "henvisninger"
  | "egen-laege"
  | "roentgen"
  | "diagnoser"
  | "hjemmemaalinger"
  | "forloebsplaner"
  | "ukendt";

export type CaptureSource = "fetch" | "xhr";

export type CapturedResponse = {
  id: string;
  sectionId: SectionId;
  sectionLabel: string;
  url: string;
  method: string;
  status: number;
  source: CaptureSource;
  capturedAt: string;
  body: unknown;
};

export type ActivityItem = {
  id: string;
  sectionId: SectionId;
  label: string;
  detail: string;
  at: string;
};

export type SectionProgress = {
  sectionId: SectionId;
  label: string;
  path: string;
  count: number;
  apiResponseCount: number;
  okResponseCount: number;
  errorResponseCount: number;
  recordCount: number;
  recordLabel: string;
  status: "not-started" | "opened" | "empty" | "data-found" | "needs-action" | "failed" | "raw-only";
  detail: string;
  actionHint?: string;
  coverageDetail?: string;
  latestErrorStatus?: number;
  lastCapturedAt?: string;
};

export type CaptureState = {
  status: CaptureStatus;
  activeTabId?: number;
  activeTabUrl?: string;
  startedAt?: string;
  updatedAt?: string;
  responseCount?: number;
  responses: CapturedResponse[];
  activity: ActivityItem[];
};

export type InjectedApiResponse = {
  url: string;
  method: string;
  status: number;
  source: CaptureSource;
  body: unknown;
  capturedAt: string;
};

export type RuntimeMessage =
  | { type: "GET_STATE" }
  | { type: "START_CAPTURE"; tabId?: number }
  | { type: "STOP_CAPTURE" }
  | { type: "CLEAR_CAPTURE" }
  | { type: "CAPTURED_RESPONSE"; payload: CapturedResponse }
  | { type: "GET_CAPTURED_RESPONSES" }
  | { type: "OPEN_SECTION"; url: string };

export type RuntimeResponse<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: string;
};
