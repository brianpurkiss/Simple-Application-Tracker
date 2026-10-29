// Builds the static, read-only demo into dist-demo/ from the committed demo/seed.json (never your own data):
// loads the seed into a throwaway database, runs the real API against it with the clock frozen at DEMO_NOW,
// saves every GET response the app makes, then builds the app with that snapshot bundled in.
//
//   npm run build:demo     (then deploy dist-demo, or `npm run demo` to preview it)

import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { DEMO_NOW } from "../demo/config.ts";

const root = path.resolve(import.meta.dirname, "..");
const tsx = [...process.execArgv];
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "job-tracker-demo-"));
const env = { ...process.env, DATA_DIR: dataDir, FROZEN_NOW: DEMO_NOW };

execFileSync(process.execPath, [...tsx, path.join(root, "server/scripts/import-json.ts"), path.join(root, "demo/seed.json")], { env, stdio: "inherit" });

const port = await new Promise<number>((resolve) => {
  const s = net.createServer().listen(0, () => {
    const { port } = s.address() as net.AddressInfo;
    s.close(() => resolve(port));
  });
});
const api = spawn(process.execPath, [...tsx, path.join(root, "server/index.ts")], { env: { ...env, API_PORT: String(port) }, stdio: "inherit" });

try {
  const base = `http://localhost:${port}`;
  for (let i = 0; ; i++) {
    try {
      await fetch(`${base}/api/profile`);
      break;
    } catch {
      if (i > 100) throw new Error("The API didn't start");
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  const get = async (url: string) => {
    const res = await fetch(base + url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    return res.json();
  };

  const snapshot: Record<string, unknown> = {};
  for (const url of ["/api/jobs", "/api/events", "/api/trash", "/api/profile", "/api/resumes", "/api/starred-groups", "/api/title-synonyms", "/api/fact-types"]) {
    snapshot[url] = await get(url);
  }
  // Every job page, trashed ones included (they open with a Restore button), and every resume page.
  const jobs = [...(snapshot["/api/jobs"] as { id: number }[]), ...(snapshot["/api/trash"] as { id: number }[])];
  for (const { id } of jobs) snapshot[`/api/jobs/${id}`] = await get(`/api/jobs/${id}`);
  const resumes = snapshot["/api/resumes"] as { id: number; has_pdf: boolean }[];
  for (const { id } of resumes) snapshot[`/api/resumes/${id}`] = await get(`/api/resumes/${id}`);
  snapshot["/api/backups"] = [];

  fs.mkdirSync(path.join(root, "demo/.snapshot"), { recursive: true });
  fs.writeFileSync(path.join(root, "demo/.snapshot/api.json"), JSON.stringify(snapshot));

  const pdfs: [number, Buffer][] = [];
  for (const r of resumes.filter((r) => r.has_pdf)) {
    pdfs.push([r.id, Buffer.from(await (await fetch(`${base}/api/resumes/${r.id}/pdf`)).arrayBuffer())]);
  }

  execFileSync(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "build"], {
    cwd: root,
    env: { ...process.env, VITE_DEMO: "1", VITE_FROZEN_NOW: DEMO_NOW },
    stdio: "inherit",
  });

  const out = path.join(root, "dist-demo");
  // GitHub Pages answers unknown paths with 404.html, so deep links still load the app.
  fs.copyFileSync(path.join(out, "index.html"), path.join(out, "404.html"));
  fs.mkdirSync(path.join(out, "demo"), { recursive: true });
  for (const [id, pdf] of pdfs) fs.writeFileSync(path.join(out, `demo/resume-${id}.pdf`), pdf);
  // Pages would otherwise run the output through Jekyll.
  fs.writeFileSync(path.join(out, ".nojekyll"), "");

  console.log(`\nDemo built in dist-demo/ (${jobs.length} jobs, frozen at ${DEMO_NOW}).`);
} finally {
  api.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
