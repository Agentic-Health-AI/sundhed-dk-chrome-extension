const SOURCE = "sundhedsarkiv:page-hook";

type SerializableResponse = {
  url: string;
  method: string;
  status: number;
  source: "fetch" | "xhr";
  body: unknown;
  capturedAt: string;
};

patchFetch();
patchXhr();

function patchFetch() {
  const originalFetch = window.fetch;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await originalFetch(input, init);
    const url = getFetchUrl(input);
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
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
  } catch {
    // Ignore non-JSON bodies even when the content-type is misleading.
  }
}

function patchXhr() {
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function patchedOpen(method: string, url: string | URL) {
    this.__sundhedsarkivMeta = { method, url: String(url) };
    return originalOpen.apply(this, arguments as unknown as Parameters<typeof originalOpen>);
  };

  XMLHttpRequest.prototype.send = function patchedSend() {
    this.addEventListener("loadend", () => {
      const meta = this.__sundhedsarkivMeta;
      const contentType = this.getResponseHeader("content-type");
      if (!meta || !shouldCapture(meta.url, contentType)) {
        return;
      }

      try {
        const body = typeof this.response === "string" ? JSON.parse(this.response) : JSON.parse(this.responseText);
        emit({
          url: absolutize(meta.url),
          method: meta.method,
          status: this.status,
          source: "xhr",
          body,
          capturedAt: new Date().toISOString()
        });
      } catch {
        // Ignore XHR responses that cannot be represented as JSON.
      }
    });

    return originalSend.apply(this, arguments as unknown as Parameters<typeof originalSend>);
  };
}

function shouldCapture(url: string, contentType: string | null) {
  const absoluteUrl = absolutize(url);
  const isSundhed =
    absoluteUrl.startsWith("https://www.sundhed.dk/") || absoluteUrl.startsWith("https://sundhed.dk/");
  const isApi = absoluteUrl.includes("/api/") || absoluteUrl.includes("/app/");
  const isJson = contentType?.toLowerCase().includes("json");

  return isSundhed && isApi && Boolean(isJson);
}

function emit(payload: SerializableResponse) {
  window.postMessage({ source: SOURCE, type: "API_RESPONSE", payload }, window.location.origin);
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

declare global {
  interface XMLHttpRequest {
    __sundhedsarkivMeta?: {
      method: string;
      url: string;
    };
  }
}

export {};
