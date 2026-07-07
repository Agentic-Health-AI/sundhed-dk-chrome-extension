const SOURCE = "sundhedsarkiv:page-hook";
const CONTENT_SOURCE = "sundhedsarkiv:content-script";
const EJOURNAL_API_BASE = "/app/ejournalportalborger/api/ejournal";

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

let captureEnabled = false;
let latestJournalFilterBase: JournalFilterBase | undefined;
const scheduledJournalRequests = new Set<string>();

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
    void captureFetchResponse(response, url, method);
    return response;
  };
}

async function captureFetchResponse(response: Response, url: string, method: string) {
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
    maybeExpandJournalResponse(url, body);
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
        maybeExpandJournalResponse(meta.url, body);
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
      captureEnabled = data.status === "capturing";
    }
  });
}

function maybeExpandJournalResponse(url: string, body: unknown) {
  if (!captureEnabled || !isJournalExpandableUrl(url)) {
    return;
  }

  scheduledJournalRequests.add(`GET:${new URL(absolutize(url)).href}`);
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
      scheduleJournalFetch(pageUrl.href);
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
      }
      if (numberValue(readCaseInsensitive(treatmentCourse, "AntalNotater")) > 0) {
        scheduleJournalDetailFetch("notater", key);
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
  scheduleJournalFetch(url.href);
}

function scheduleJournalFetch(url: string) {
  const absoluteUrl = new URL(url, window.location.origin).href;
  const requestKey = `GET:${absoluteUrl}`;
  if (scheduledJournalRequests.has(requestKey)) {
    return;
  }
  scheduledJournalRequests.add(requestKey);

  window.setTimeout(() => {
    void window
      .fetch(absoluteUrl, {
        credentials: "same-origin",
        headers: {
          accept: "application/json, text/plain, */*",
          "page-app-id": "717"
        }
      })
      .catch(() => undefined);
  }, 0);
}

function scheduleJournalPost(url: string, body: Record<string, unknown>) {
  const absoluteUrl = new URL(url, window.location.origin).href;
  const serializedBody = JSON.stringify(body);
  const requestKey = `POST:${absoluteUrl}:${serializedBody}`;
  if (scheduledJournalRequests.has(requestKey)) {
    return;
  }
  scheduledJournalRequests.add(requestKey);

  window.setTimeout(() => {
    void window
      .fetch(absoluteUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          accept: "application/json, text/plain, */*",
          "content-type": "application/json;charset=UTF-8",
          "page-app-id": "717"
        },
        body: serializedBody
      })
      .catch(() => undefined);
  }, 0);
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
