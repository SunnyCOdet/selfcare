import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";

const root = process.cwd();
const outDir = join(root, "mobbin screens");
const maxPage = Number(process.env.MOBBIN_MAX_PAGE ?? 20);
const limit = Number(process.env.MOBBIN_LIMIT ?? 10);
const concurrency = Number(process.env.MOBBIN_CONCURRENCY ?? 8);
const platforms = ["ios", "web"];
const queries = [
  "onboarding",
  "fitness app onboarding",
  "health app onboarding",
  "habit tracker onboarding",
  "AI coach onboarding",
  "personalization onboarding with goals",
];

function safeName(text) {
  return text
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function getMobbinCredential() {
  const credentialPath = join(process.env.USERPROFILE, ".codex", ".credentials.json");
  return readFile(credentialPath, "utf8").then((text) => {
    const creds = JSON.parse(text);
    const credential = Object.values(creds).find((entry) => entry?.server_name === "mobbin");
    if (!credential?.access_token) throw new Error("Mobbin OAuth credential not found");
    return credential.access_token;
  });
}

const accessToken = await getMobbinCredential();
let sessionId = null;

async function rpc(method, params) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": "2025-06-18",
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  const res = await fetch("https://api.mobbin.com/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Math.floor(Math.random() * 1e9),
      method,
      params,
    }),
  });
  const sid = res.headers.get("mcp-session-id");
  if (sid) sessionId = sid;
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} HTTP ${res.status}: ${text.slice(0, 300)}`);
  if (text.startsWith("event:") || text.startsWith("data:")) {
    const dataLine = text.split(/\r?\n/).find((line) => line.startsWith("data:"));
    return JSON.parse(dataLine.slice(5).trim());
  }
  return JSON.parse(text);
}

async function searchFlows(query, platform, page) {
  const response = await rpc("tools/call", {
    name: "search_flows",
    arguments: {
      query,
      platform,
      limit,
      page,
      image_format: "jpg",
    },
  });
  const content = response.result?.structuredContent ?? response.result?.content?.[0]?.text;
  return typeof content === "string" ? JSON.parse(content) : content;
}

async function download(url, filePath) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`download HTTP ${res.status}`);
  await pipeline(res.body, createWriteStream(filePath));
}

async function downloadMany(tasks) {
  const queue = [...tasks];
  const failures = [];
  async function worker() {
    for (;;) {
      const task = queue.shift();
      if (!task) return;
      try {
        await download(task.url, task.filePath);
      } catch (error) {
        failures.push({
          filePath: task.filePath,
          url: task.url,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  return failures;
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await rpc("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "mobbin-onboarding-downloader", version: "1.0.0" },
});

const seenFlows = new Map();
const searchRuns = [];

for (const platform of platforms) {
  for (const query of queries) {
    for (let page = 1; page <= maxPage; page++) {
      console.log(`search ${platform} "${query}" page ${page}`);
      const result = await searchFlows(query, platform, page);
      const flows = result?.flows ?? [];
      searchRuns.push({
        query,
        platform,
        page,
        flowCount: flows.length,
        hasNextPage: !!result?.has_next_page,
      });
      for (const flow of flows) {
        if (!seenFlows.has(flow.id)) seenFlows.set(flow.id, flow);
      }
      if (!result?.has_next_page || flows.length === 0) break;
    }
  }
}

const flows = [...seenFlows.values()].sort((a, b) =>
  `${a.platform}-${a.app_name}-${a.name}`.localeCompare(`${b.platform}-${b.app_name}-${b.name}`)
);
const imageTasks = [];

for (const flow of flows) {
  const folder = join(
    outDir,
    safeName(flow.platform),
    safeName(flow.app_name),
    `${safeName(flow.name)}--${flow.id}`
  );
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, "flow.json"), `${JSON.stringify(flow, null, 2)}\n`, "utf8");
  for (const screen of flow.screens ?? []) {
    imageTasks.push({
      url: screen.image_url,
      filePath: join(folder, `${String(screen.position).padStart(3, "0")}--${screen.screen_id}.jpg`),
    });
  }
}

const failures = await downloadMany(imageTasks);
const summary = {
  generatedAt: new Date().toISOString(),
  note: "Downloaded paginated Mobbin onboarding-flow search results exposed by the MCP, not a full Mobbin database export.",
  platforms,
  queries,
  maxPage,
  limit,
  searchRuns,
  uniqueFlows: flows.length,
  attemptedImages: imageTasks.length,
  failedImages: failures.length,
  failures,
  flows: flows.map((flow) => ({
    id: flow.id,
    name: flow.name,
    app_name: flow.app_name,
    platform: flow.platform,
    screen_count: flow.screen_count,
    mobbin_url: flow.mobbin_url,
  })),
};

await writeFile(join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
await writeFile(
  join(outDir, "flows.csv"),
  [
    "platform,app_name,flow_name,screen_count,mobbin_url,id",
    ...summary.flows.map((flow) =>
      [flow.platform, flow.app_name, flow.name, flow.screen_count, flow.mobbin_url, flow.id]
        .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
        .join(",")
    ),
  ].join("\n") + "\n",
  "utf8"
);

console.log(
  `Done. ${summary.uniqueFlows} unique flows, ${summary.attemptedImages - summary.failedImages}/${summary.attemptedImages} images downloaded.`
);
