import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { chromium } from "playwright";

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = process.env.AUDIT_OUTPUT_DIR ?? `/tmp/sundhed-api-audit-${runId}`;
const profileDir = process.env.AUDIT_PROFILE_DIR ?? `/tmp/sundhed-api-audit-profile-${runId}`;
const extensionPath = resolve("dist");
const apiLogPath = `${outputDir}/api-calls.jsonl`;
const summaryPath = `${outputDir}/summary.json`;
const apiLog = createWriteStream(apiLogPath, { flags: "a" });
const seen = new Map();

mkdirSync(outputDir, { recursive: true });
mkdirSync(dirname(profileDir), { recursive: true });

const context = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`
  ],
  viewport: { width: 1440, height: 960 }
});

const page = context.pages()[0] ?? await context.newPage();

context.on("response", response => {
  void recordResponse(response).catch(error => {
    console.error(`[audit] response logging failed: ${error instanceof Error ? error.message : String(error)}`);
  });
});

await page.goto("https://www.sundhed.dk/", { waitUntil: "domcontentloaded" });

console.log(`[audit] Browser opened at https://www.sundhed.dk/`);
console.log(`[audit] Log path: ${apiLogPath}`);
console.log(`[audit] Commands: goto <url-or-path> | summary | url | stop`);

const rl = createInterface({ input: process.stdin, output: process.stdout });
rl.on("line", line => {
  void handleCommand(line.trim()).catch(error => {
    console.error(`[audit] command failed: ${error instanceof Error ? error.message : String(error)}`);
  });
});

async function handleCommand(command) {
  if (!command) {
    return;
  }

  if (command === "stop" || command === "exit" || command === "quit") {
    await writeSummary();
    apiLog.end();
    rl.close();
    await context.close();
    process.exit(0);
  }

  if (command === "summary") {
    await writeSummary();
    console.log(`[audit] Summary written: ${summaryPath}`);
    return;
  }

  if (command === "url") {
    console.log(`[audit] Current URL: ${page.url()}`);
    return;
  }

  if (command.startsWith("goto ")) {
    const target = normalizeTarget(command.slice("goto ".length).trim());
    console.log(`[audit] Navigating to ${target}`);
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 60_000 });
    return;
  }

  console.log(`[audit] Unknown command: ${command}`);
}

async function recordResponse(response) {
  const url = response.url();
  if (!looksLikeSundhedApi(url)) {
    return;
  }

  const request = response.request();
  const headers = response.headers();
  const contentType = headers["content-type"] ?? "";
  const entry = {
    at: new Date().toISOString(),
    method: request.method(),
    url: redactUrl(url),
    pathname: new URL(url).pathname,
    queryKeys: Array.from(new URL(url).searchParams.keys()).sort(),
    status: response.status(),
    resourceType: request.resourceType(),
    contentType,
    requestBodyShape: summarizePostData(request.postData()),
    responseBodyShape: await summarizeResponseBody(response, contentType)
  };

  apiLog.write(`${JSON.stringify(entry)}\n`);
  const key = `${entry.method} ${entry.pathname}`;
  const existing = seen.get(key) ?? {
    method: entry.method,
    pathname: entry.pathname,
    count: 0,
    statuses: new Set(),
    queryKeys: new Set(),
    contentTypes: new Set(),
    responseBodyShapes: new Map()
  };

  existing.count += 1;
  existing.statuses.add(entry.status);
  entry.queryKeys.forEach(queryKey => existing.queryKeys.add(queryKey));
  if (entry.contentType) {
    existing.contentTypes.add(entry.contentType);
  }
  const shapeKey = JSON.stringify(entry.responseBodyShape);
  existing.responseBodyShapes.set(shapeKey, (existing.responseBodyShapes.get(shapeKey) ?? 0) + 1);
  seen.set(key, existing);
  console.log(`[api] ${entry.method} ${entry.status} ${entry.pathname}`);
}

async function summarizeResponseBody(response, contentType) {
  if (looksBinary(contentType)) {
    return { type: "binary" };
  }

  try {
    return summarizeValue(await response.json());
  } catch {
    return { type: "unparsed" };
  }
}

function summarizePostData(postData) {
  if (!postData) {
    return undefined;
  }

  try {
    return summarizeValue(JSON.parse(postData));
  } catch {
    return { type: "string", length: postData.length };
  }
}

function summarizeValue(value, depth = 0) {
  if (value === null) {
    return { type: "null" };
  }

  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      item: value.length > 0 && depth < 4 ? summarizeValue(value[0], depth + 1) : undefined
    };
  }

  const valueType = typeof value;
  if (valueType !== "object") {
    return { type: valueType };
  }

  if (depth >= 4) {
    return { type: "object", keys: Object.keys(value).sort() };
  }

  const entries = Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 80)
    .map(([key, child]) => [key, summarizeValue(child, depth + 1)]);

  return {
    type: "object",
    keys: Object.keys(value).sort(),
    fields: Object.fromEntries(entries)
  };
}

function looksLikeSundhedApi(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.hostname === "www.sundhed.dk" && (url.pathname.includes("/api/") || url.pathname.includes("/app/"));
  } catch {
    return false;
  }
}

function redactUrl(rawUrl) {
  const url = new URL(rawUrl);
  for (const key of url.searchParams.keys()) {
    url.searchParams.set(key, "[redacted]");
  }
  return url.toString();
}

function normalizeTarget(target) {
  if (target.startsWith("https://www.sundhed.dk/")) {
    return target;
  }

  if (target.startsWith("/")) {
    return `https://www.sundhed.dk${target}`;
  }

  throw new Error("Target must be a https://www.sundhed.dk/ URL or absolute path.");
}

function looksBinary(contentType) {
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

async function writeSummary() {
  const summary = Array.from(seen.values()).map(item => ({
    method: item.method,
    pathname: item.pathname,
    count: item.count,
    statuses: Array.from(item.statuses).sort(),
    queryKeys: Array.from(item.queryKeys).sort(),
    contentTypes: Array.from(item.contentTypes).sort(),
    responseBodyShapes: Array.from(item.responseBodyShapes.entries()).map(([shape, count]) => ({
      count,
      shape: JSON.parse(shape)
    }))
  }));

  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
}
