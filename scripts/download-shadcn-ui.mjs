import { mkdir, writeFile, rm } from "node:fs/promises";
import { join, basename } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const outDir = join(root, "shadcn");
const rawDir = join(outDir, "raw");
const uiDir = join(outDir, "ui");
const metaDir = join(outDir, "meta");
const concurrency = 16;

async function shadcn(args) {
  const bin = join(root, "node_modules", "shadcn", "dist", "index.js");
  const { stdout } = await execFileAsync(
    process.execPath,
    [bin, ...args],
    {
      cwd: root,
      maxBuffer: 20 * 1024 * 1024,
      windowsHide: true,
    }
  );
  return stdout;
}

async function worker(queue, results, failures) {
  for (;;) {
    const item = queue.shift();
    if (!item) return;
    try {
      const res = await fetch(
        `https://ui.shadcn.com/r/styles/new-york-v4/${encodeURIComponent(item.name)}.json`
      );
      if (!res.ok) throw new Error(`registry HTTP ${res.status}`);
      const registryItem = await res.json();
      if (!registryItem?.files?.length) {
        throw new Error("registry item had no files");
      }

      await writeFile(
        join(rawDir, `${item.name}.json`),
        `${JSON.stringify(registryItem, null, 2)}\n`,
        "utf8"
      );

      for (const file of registryItem.files) {
        const filename = basename(file.path);
        await writeFile(join(uiDir, filename), file.content ?? "", "utf8");
      }

      const meta = {
        name: registryItem.name,
        type: registryItem.type,
        dependencies: registryItem.dependencies ?? [],
        devDependencies: registryItem.devDependencies ?? [],
        registryDependencies: registryItem.registryDependencies ?? [],
        files: registryItem.files.map((file) => ({
          path: file.path,
          extractedTo: `ui/${basename(file.path)}`,
          type: file.type,
        })),
      };
      await writeFile(
        join(metaDir, `${item.name}.json`),
        `${JSON.stringify(meta, null, 2)}\n`,
        "utf8"
      );
      results.push(item.name);
      console.log(`ok ${item.name}`);
    } catch (error) {
      failures.push({ name: item.name, error: error instanceof Error ? error.message : String(error) });
      console.error(`fail ${item.name}: ${failures.at(-1).error}`);
    }
  }
}

await rm(outDir, { recursive: true, force: true });
await mkdir(rawDir, { recursive: true });
await mkdir(uiDir, { recursive: true });
await mkdir(metaDir, { recursive: true });

const searchOutput = await shadcn([
  "search",
  "@shadcn",
  "--type",
  "ui",
  "--limit",
  "500",
  "--json",
]);
const search = JSON.parse(searchOutput);
const items = search.items ?? [];

await writeFile(join(outDir, "registry-ui-index.json"), `${JSON.stringify(search, null, 2)}\n`, "utf8");
await writeFile(
  join(outDir, "component-list.txt"),
  `${items.map((item) => item.name).join("\n")}\n`,
  "utf8"
);

const queue = [...items];
const results = [];
const failures = [];
await Promise.all(
  Array.from({ length: Math.min(concurrency, queue.length) }, () => worker(queue, results, failures))
);

results.sort();
failures.sort((a, b) => a.name.localeCompare(b.name));
await writeFile(
  join(outDir, "download-report.json"),
  `${JSON.stringify(
    {
      expected: items.length,
      downloaded: results.length,
      failed: failures.length,
      components: results,
      failures,
    },
    null,
    2
  )}\n`,
  "utf8"
);

if (failures.length > 0 || results.length !== items.length) {
  throw new Error(`Downloaded ${results.length}/${items.length}; failures: ${failures.length}`);
}

console.log(`Downloaded ${results.length}/${items.length} shadcn UI components to ${outDir}`);
