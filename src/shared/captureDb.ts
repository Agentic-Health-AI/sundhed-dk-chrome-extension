import type { CapturedResponse } from "./types";

const DB_NAME = "sundhedsarkiv";
const DB_VERSION = 1;
const RESPONSES_STORE = "responses";

type StoredResponse = CapturedResponse & {
  signature: string;
};

export async function addStoredResponse(response: CapturedResponse) {
  const db = await openCaptureDb();
  const signature = responseSignature(response);

  return new Promise<boolean>((resolve, reject) => {
    const transaction = db.transaction(RESPONSES_STORE, "readwrite");
    const store = transaction.objectStore(RESPONSES_STORE);
    const index = store.index("signature");
    const existingRequest = index.getKey(signature);

    existingRequest.onerror = () => reject(existingRequest.error);
    existingRequest.onsuccess = () => {
      if (existingRequest.result) {
        resolve(false);
        return;
      }

      const putRequest = store.put({ ...response, signature } satisfies StoredResponse);
      putRequest.onerror = () => reject(putRequest.error);
      putRequest.onsuccess = () => resolve(true);
    };
  });
}

export async function getStoredResponses() {
  const db = await openCaptureDb();

  return new Promise<CapturedResponse[]>((resolve, reject) => {
    const request = db.transaction(RESPONSES_STORE, "readonly").objectStore(RESPONSES_STORE).getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      resolve((request.result as StoredResponse[]).map(({ signature: _signature, ...response }) => response));
    };
  });
}

export async function clearStoredResponses() {
  const db = await openCaptureDb();

  return new Promise<void>((resolve, reject) => {
    const request = db.transaction(RESPONSES_STORE, "readwrite").objectStore(RESPONSES_STORE).clear();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

function openCaptureDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RESPONSES_STORE)) {
        const store = db.createObjectStore(RESPONSES_STORE, { keyPath: "id" });
        store.createIndex("signature", "signature", { unique: true });
      }
    };
  });
}

function responseSignature(response: CapturedResponse) {
  return `${response.sectionId}:${response.method}:${response.status}:${response.url}:${stableStringify(response.body)}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}
