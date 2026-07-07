const SOURCE = "sundhedsarkiv:page-hook";
const CONTENT_SOURCE = "sundhedsarkiv:content-script";
const EJOURNAL_API_BASE = "/app/ejournalportalborger/api/ejournal";
const PROEVESVAR_API_BASE = "/app/proevesvarportal/api/v1";
const ROENTGEN_HENVISNINGER_PATH = "/app/billedbeskrivelserborger/api/v1/billedbeskrivelser/henvisninger/";
const PROEVESVAR_LOOKBACK_YEARS = 2;

type SerializableResponse = {
  url: string;
  method: string;
  status: number;
  source: "fetch" | "xhr";
  body: unknown;
  capturedAt: string;
};

type JournalFilterBase = {
  DatoFra: string;
  DatoTil: string;
  Sektorer: unknown[];
};

type PendingExpansion = {
  url: string;
  method: string;
  body: unknown;
  requestBody?: unknown;
};

let captureEnabled = false;
let latestJournalFilterBase: JournalFilterBase | undefined;
let pendingExpandableResponses: PendingExpansion[] = [];
const scheduledApiRequests = new Set<string>();

patchFetch();
patchXhr();
listenForCaptureStatus();

function patchFetch() {
  const originalFetch = window.fetch;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = getFetchUrl(input);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    rememberJournalRequestBody(url, init?.body);
    const response = await originalFetch(input, init);
    void captureFetchResponse(response, url, method, init?.body);
    return response;
  };
}

async function captureFetchResponse(response: Response, url: string, method: string, requestBody?: unknown) {
  if (!shouldCapture(url, response.headers.get("content-type"))) {
    return;
  }

  try {
    const body = await response.clone().json();
    emit({
      url,
      method,
      status: response.status,
      source: "fetch",
      body,
      capturedAt: new Date().toISOString()
    });
    maybeExpandCapturedResponse(url, method, body, requestBody);
  } catch {
    // Ignore non-JSON bodies even when the content-type is misleading.
  }
}

function patchXhr() {
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function patchedOpen(method: string, url: string | URL) {
    this.__sundhedsarkivMeta = { method: method.toUpperCase(), url: String(url) };
    return originalOpen.apply(this, arguments as unknown as Parameters<typeof originalOpen>);
  };

  XMLHttpRequest.prototype.send = function patchedSend(body?: Document | XMLHttpRequestBodyInit | null) {
    const meta = this.__sundhedsarkivMeta;
    const requestBody = body;
    if (meta) {
      rememberJournalRequestBody(meta.url, body);
    }

    this.addEventListener("loadend", () => {
      const meta = this.__sundhedsarkivMeta;
      const contentType = this.getResponseHeader("content-type");
      if (!meta || !shouldCapture(meta.url, contentType)) {
        return;
      }

      try {
        const body = parseXhrBody(this);
        emit({
          url: absolutize(meta.url),
          method: meta.method,
          status: this.status,
          source: "xhr",
          body,
          capturedAt: new Date().toISOString()
        });
        maybeExpandCapturedResponse(meta.url, meta.method, body, requestBody);
      } catch {
        // Ignore XHR responses that cannot be represented as JSON.
      }
    });

    return originalSend.apply(this, arguments as unknown as Parameters<typeof originalSend>);
  };
}

function shouldCapture(url: string, contentType: string | null) {
  const absoluteUrl = absolutize(url);
  const isSundhed = absoluteUrl.startsWith("https://www.sundhed.dk/");
  const isApi = absoluteUrl.includes("/api/") || absoluteUrl.includes("/app/");
  const isBinary = looksLikeBinaryContent(contentType);

  return isSundhed && isApi && !isBinary;
}

function looksLikeBinaryContent(contentType: string | null) {
  if (!contentType) {
    return false;
  }

  const normalized = contentType.toLowerCase();
  return (
    normalized.includes("image/") ||
    normalized.includes("font/") ||
    normalized.includes("audio/") ||
    normalized.includes("video/") ||
    normalized.includes("application/pdf") ||
    normalized.includes("application/octet-stream")
  );
}

function emit(payload: SerializableResponse) {
  window.postMessage({ source: SOURCE, type: "API_RESPONSE", payload }, window.location.origin);
}

function listenForCaptureStatus() {
  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== window.location.origin) {
      return;
    }

    const data = event.data as { source?: string; type?: string; status?: string };
    if (data.source === CONTENT_SOURCE && data.type === "CAPTURE_STATUS") {
      const wasCapturing = captureEnabled;
      captureEnabled = data.status === "capturing";
      if (!wasCapturing && captureEnabled) {
        flushPendingExpansions();
      }
    }
  });
}

function maybeExpandCapturedResponse(url: string, method: string, body: unknown, requestBody?: unknown) {
  if (!captureEnabled) {
    rememberPendingExpansion(url, method, body, requestBody);
    return;
  }

  markRequestSeen(method, url);
  maybeExpandJournalResponse(url, body);
  maybeExpandJournalDocumentPageResponse(url, body, requestBody);
  maybeExpandProevesvarResponse(url);
  maybeExpandRoentgenResponse(url, body);
}

function rememberPendingExpansion(url: string, method: string, body: unknown, requestBody?: unknown) {
  if (!isAutoExpandableUrl(url)) {
    return;
  }

  pendingExpandableResponses = [...pendingExpandableResponses.slice(-9), { url, method, body, requestBody }];
}

function flushPendingExpansions() {
  const pending = pendingExpandableResponses;
  pendingExpandableResponses = [];
  pending.forEach(response => maybeExpandCapturedResponse(response.url, response.method, response.body, response.requestBody));
}

function maybeExpandJournalResponse(url: string, body: unknown) {
  if (!captureEnabled || !isJournalExpandableUrl(url)) {
    return;
  }

  const overview = getRecord(body);
  if (isJournalOverviewUrl(url)) {
    scheduleAdditionalOverviewPages(url, overview);
  }
  scheduleJournalDetailCalls(overview);
}

function scheduleAdditionalOverviewPages(url: string, overview: Record<string, unknown>) {
  const total = numberValue(readCaseInsensitive(overview, "NumberOfForloeb"));
  const currentForloeb = asArray(readCaseInsensitive(overview, "Forloeb")).length;
  if (total <= currentForloeb) {
    return;
  }

  const parsed = new URL(absolutize(url));
  const currentPage = numberValue(parsed.searchParams.get("Side")) || 1;
  const itemsPerPage = numberValue(parsed.searchParams.get("ItemsPerPage")) || Math.max(currentForloeb, 10);
  const totalPages = Math.ceil(total / itemsPerPage);

  for (let page = 1; page <= totalPages; page += 1) {
    if (page === currentPage) {
      continue;
    }

    if (latestJournalFilterBase) {
      scheduleJournalPost(`${EJOURNAL_API_BASE}/filter`, buildJournalFilterBody(page, itemsPerPage, parsed));
    } else {
      const pageUrl = new URL(parsed.href);
      pageUrl.searchParams.set("Side", String(page));
      scheduleApiFetch(pageUrl.href, { "page-app-id": "717" });
    }
  }
}

function buildJournalFilterBody(page: number, itemsPerPage: number, parsedOverviewUrl: URL) {
  return {
    Sektorer: latestJournalFilterBase?.Sektorer ?? [],
    Filtre: [],
    Diagnoser: [],
    DatoFra: latestJournalFilterBase?.DatoFra ?? "",
    DatoTil: latestJournalFilterBase?.DatoTil ?? "",
    Side: page,
    Sortering: parsedOverviewUrl.searchParams.get("Sortering") ?? "updated",
    SortDesc: parsedOverviewUrl.searchParams.get("SortDesc") !== "false",
    ItemsPerPage: itemsPerPage
  };
}

function scheduleJournalDetailCalls(overview: Record<string, unknown>) {
  asArray(readCaseInsensitive(overview, "Forloeb"))
    .map(getRecord)
    .forEach(treatmentCourse => {
      const key = getRecord(readCaseInsensitive(treatmentCourse, "IdNoegle"));
      const hasKey = typeof readCaseInsensitive(key, "Noegle") === "string";
      if (!hasKey) {
        return;
      }

      if (numberValue(readCaseInsensitive(treatmentCourse, "AntalKontaktperioder")) > 0) {
        scheduleJournalDetailFetch("kontaktperioder", key);
      }
      if (numberValue(readCaseInsensitive(treatmentCourse, "AntalEpikriser")) > 0) {
        scheduleJournalDetailFetch("epikriser", key);
        scheduleJournalPageFetch("epikriser", key);
      }
      if (numberValue(readCaseInsensitive(treatmentCourse, "AntalNotater")) > 0) {
        scheduleJournalDetailFetch("notater", key);
        scheduleJournalPageFetch("notater", key);
      }
    });
}

function scheduleJournalDetailFetch(endpoint: "kontaktperioder" | "epikriser" | "notater", key: Record<string, unknown>) {
  const url = new URL(`${EJOURNAL_API_BASE}/${endpoint}`, window.location.origin);
  url.searchParams.set(
    "noegle",
    JSON.stringify({
      Database: readCaseInsensitive(key, "Database") ?? null,
      Noegle: readCaseInsensitive(key, "Noegle"),
      VaerdispringNoegle: readCaseInsensitive(key, "VaerdispringNoegle") ?? null
    })
  );
  scheduleApiFetch(url.href, { "page-app-id": "717" });
}

function scheduleJournalPageFetch(endpoint: "epikriser" | "notater", key: Record<string, unknown>) {
  const url = new URL(`${EJOURNAL_API_BASE}/${endpoint}-page`, window.location.origin);
  url.searchParams.set(
    "noegle",
    JSON.stringify({
      Database: readCaseInsensitive(key, "Database") ?? null,
      Noegle: readCaseInsensitive(key, "Noegle"),
      VaerdispringNoegle: readCaseInsensitive(key, "VaerdispringNoegle") ?? null
    })
  );
  scheduleApiPost(url.href, buildJournalDataTablesBody(), { "page-app-id": "717" });
}

function buildJournalDataTablesBody() {
  return buildJournalDataTablesBodyWithPaging(0, 50, 1);
}

function buildJournalDataTablesBodyWithPaging(start: number, length: number, draw: number) {
  const searchableColumn = (data: string, orderable: boolean) => ({
    data,
    name: "",
    searchable: true,
    orderable,
    search: { value: "" }
  });

  return {
    draw,
    columns: [
      searchableColumn("DatoFra", true),
      searchableColumn("Overskrift", true),
      searchableColumn("Noegle", false),
      searchableColumn("NotatType", false)
    ],
    order: [{ column: 0, dir: "desc" }],
    start,
    length,
    search: { value: "" }
  };
}

function maybeExpandJournalDocumentPageResponse(url: string, body: unknown, requestBody: unknown) {
  if (!isJournalDocumentPageUrl(url)) {
    return;
  }

  const response = getRecord(body);
  const pageItems = asArray(readCaseInsensitive(response, "Notater")).length || asArray(readCaseInsensitive(response, "Epikriser")).length;
  const total =
    numberValue(readCaseInsensitive(response, "TotalCount")) ||
    numberValue(readCaseInsensitive(response, "Filtered")) ||
    numberValue(readCaseInsensitive(response, "recordsFiltered")) ||
    numberValue(readCaseInsensitive(response, "recordsTotal"));
  const request = parseDataTablesRequestBody(requestBody);
  const length = request.length || pageItems || 50;
  const start = request.start;
  if (total <= start + length || length <= 0) {
    return;
  }

  for (let nextStart = start + length, pageIndex = 1; nextStart < total; nextStart += length, pageIndex += 1) {
    scheduleApiPost(
      url,
      buildNextJournalDataTablesBody(request.body, nextStart, length, request.draw + pageIndex),
      { "page-app-id": "717" }
    );
  }
}

function maybeExpandProevesvarResponse(url: string) {
  if (!isProevesvarSvaroversigtUrl(url)) {
    return;
  }

  const parsed = new URL(absolutize(url));
  const til = parsed.searchParams.get("til") ?? formatLocalDateTime(new Date(), true);
  const currentFra = parsed.searchParams.get("fra");
  const expandedFra = buildLookbackDate(til, PROEVESVAR_LOOKBACK_YEARS);
  if (!expandedFra || (currentFra && isDateAtOrBefore(currentFra, expandedFra))) {
    return;
  }

  parsed.searchParams.set("fra", expandedFra);
  if (!parsed.searchParams.get("til")) {
    parsed.searchParams.set("til", til);
  }
  scheduleApiFetch(parsed.href);
}

function maybeExpandRoentgenResponse(url: string, body: unknown) {
  if (!isRoentgenHenvisningerUrl(url)) {
    return;
  }

  const parsed = new URL(absolutize(url));
  const response = getRecord(body);
  const total = numberValue(readCaseInsensitive(response, "TotalItems")) || numberValue(readCaseInsensitive(response, "TotalCount"));
  const responseItems =
    asArray(readCaseInsensitive(response, "Svar")).length ||
    asArray(readCaseInsensitive(response, "Henvisninger")).length ||
    asArray(readCaseInsensitive(response, "Items")).length;
  const itemsPerPage = numberValue(parsed.searchParams.get("ItemsPerPage")) || Math.max(responseItems, 10);
  const currentPage = numberValue(parsed.searchParams.get("CurrentPage")) || 1;
  if (total <= itemsPerPage || itemsPerPage <= 0) {
    return;
  }

  const totalPages = Math.ceil(total / itemsPerPage);
  for (let page = 1; page <= totalPages; page += 1) {
    if (page === currentPage) {
      continue;
    }
    const pageUrl = new URL(parsed.href);
    pageUrl.searchParams.set("CurrentPage", String(page));
    scheduleApiFetch(pageUrl.href);
  }
}

function scheduleApiFetch(url: string, extraHeaders: Record<string, string> = {}) {
  const absoluteUrl = new URL(url, window.location.origin).href;
  const requestKey = `GET:${absoluteUrl}`;
  if (scheduledApiRequests.has(requestKey)) {
    return;
  }
  scheduledApiRequests.add(requestKey);

  window.setTimeout(() => {
    void window
      .fetch(absoluteUrl, {
        credentials: "same-origin",
        headers: {
          accept: "application/json, text/plain, */*",
          ...extraHeaders
        }
      })
      .catch(() => undefined);
  }, 0);
}

function scheduleJournalPost(url: string, body: Record<string, unknown>) {
  scheduleApiPost(url, body, { "page-app-id": "717" });
}

function scheduleApiPost(url: string, body: Record<string, unknown>, extraHeaders: Record<string, string> = {}) {
  const absoluteUrl = new URL(url, window.location.origin).href;
  const serializedBody = JSON.stringify(body);
  const requestKey = `POST:${absoluteUrl}:${serializedBody}`;
  if (scheduledApiRequests.has(requestKey)) {
    return;
  }
  scheduledApiRequests.add(requestKey);

  window.setTimeout(() => {
    void window
      .fetch(absoluteUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          accept: "application/json, text/plain, */*",
          "content-type": "application/json;charset=UTF-8",
          ...extraHeaders
        },
        body: serializedBody
      })
      .catch(() => undefined);
  }, 0);
}

function markRequestSeen(method: string, url: string) {
  scheduledApiRequests.add(`${method.toUpperCase()}:${new URL(absolutize(url)).href}`);
}

function parseDataTablesRequestBody(body: unknown) {
  const parsedBody = parseJsonBody(body);
  return {
    body: parsedBody,
    start: numberValue(readCaseInsensitive(parsedBody, "start")),
    length: numberValue(readCaseInsensitive(parsedBody, "length")),
    draw: numberValue(readCaseInsensitive(parsedBody, "draw")) || 1
  };
}

function buildNextJournalDataTablesBody(baseBody: Record<string, unknown>, start: number, length: number, draw: number) {
  if (Object.keys(baseBody).length === 0) {
    return buildJournalDataTablesBodyWithPaging(start, length, draw);
  }

  return {
    ...baseBody,
    draw,
    start,
    length
  };
}

function getFetchUrl(input: RequestInfo | URL) {
  if (input instanceof Request) {
    return input.url;
  }
  return absolutize(String(input));
}

function absolutize(url: string) {
  return new URL(url, window.location.href).href;
}

function isJournalOverviewUrl(url: string) {
  try {
    const parsed = new URL(absolutize(url));
    return parsed.pathname === `${EJOURNAL_API_BASE}/forloebsoversigt`;
  } catch {
    return false;
  }
}

function isJournalExpandableUrl(url: string) {
  try {
    const parsed = new URL(absolutize(url));
    return parsed.pathname === `${EJOURNAL_API_BASE}/forloebsoversigt` || parsed.pathname === `${EJOURNAL_API_BASE}/filter`;
  } catch {
    return false;
  }
}

function isJournalDocumentPageUrl(url: string) {
  try {
    const parsed = new URL(absolutize(url));
    return parsed.pathname === `${EJOURNAL_API_BASE}/epikriser-page` || parsed.pathname === `${EJOURNAL_API_BASE}/notater-page`;
  } catch {
    return false;
  }
}

function isAutoExpandableUrl(url: string) {
  return isJournalExpandableUrl(url) || isJournalDocumentPageUrl(url) || isProevesvarSvaroversigtUrl(url) || isRoentgenHenvisningerUrl(url);
}

function isProevesvarSvaroversigtUrl(url: string) {
  try {
    const parsed = new URL(absolutize(url));
    return parsed.pathname === `${PROEVESVAR_API_BASE}/svaroversigt`;
  } catch {
    return false;
  }
}

function isRoentgenHenvisningerUrl(url: string) {
  try {
    const parsed = new URL(absolutize(url));
    return parsed.pathname === ROENTGEN_HENVISNINGER_PATH;
  } catch {
    return false;
  }
}

function rememberJournalRequestBody(url: string, body: unknown) {
  try {
    const parsed = new URL(absolutize(url));
    if (parsed.pathname !== `${EJOURNAL_API_BASE}/filtervalg`) {
      return;
    }

    const requestBody = parseJsonBody(body);
    if (!requestBody) {
      return;
    }

    const datoFra = requestBody.DatoFra;
    const datoTil = requestBody.DatoTil;
    const sektorer = requestBody.Sektorer;
    if (typeof datoFra === "string" && typeof datoTil === "string" && Array.isArray(sektorer)) {
      latestJournalFilterBase = { DatoFra: datoFra, DatoTil: datoTil, Sektorer: sektorer };
    }
  } catch {
    // Ignore request bodies that are not journal filter JSON.
  }
}

function parseJsonBody(body: unknown) {
  if (typeof body === "string") {
    return getRecord(JSON.parse(body));
  }
  return {};
}

function getRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readCaseInsensitive(record: Record<string, unknown>, key: string) {
  if (key in record) {
    return record[key];
  }

  const normalizedKey = key.toLowerCase();
  const matchingKey = Object.keys(record).find(candidate => candidate.toLowerCase() === normalizedKey);
  return matchingKey ? record[matchingKey] : undefined;
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildLookbackDate(til: string, years: number) {
  const endDate = new Date(til);
  if (Number.isNaN(endDate.getTime())) {
    return undefined;
  }

  const startDate = new Date(endDate);
  startDate.setFullYear(startDate.getFullYear() - years);
  startDate.setHours(0, 0, 0, 0);
  return formatLocalDateTime(startDate, false);
}

function formatLocalDateTime(date: Date, endOfDay: boolean) {
  const adjusted = new Date(date);
  if (endOfDay) {
    adjusted.setHours(23, 59, 59, 0);
  }

  const pad = (value: number) => String(value).padStart(2, "0");
  return `${adjusted.getFullYear()}-${pad(adjusted.getMonth() + 1)}-${pad(adjusted.getDate())}T${pad(adjusted.getHours())}:${pad(
    adjusted.getMinutes()
  )}:${pad(adjusted.getSeconds())}`;
}

function isDateAtOrBefore(value: string, reference: string) {
  const valueDate = new Date(value);
  const referenceDate = new Date(reference);
  if (Number.isNaN(valueDate.getTime()) || Number.isNaN(referenceDate.getTime())) {
    return false;
  }

  return valueDate.getTime() <= referenceDate.getTime();
}

function parseXhrBody(xhr: XMLHttpRequest) {
  if (xhr.responseType === "json" && xhr.response !== null) {
    return xhr.response;
  }

  if (typeof xhr.response === "string" && xhr.response.length > 0) {
    return JSON.parse(xhr.response);
  }

  return JSON.parse(xhr.responseText);
}

declare global {
  interface XMLHttpRequest {
    __sundhedsarkivMeta?: {
      method: string;
      url: string;
    };
  }
}

export {};
