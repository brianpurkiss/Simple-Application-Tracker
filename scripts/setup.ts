// First-time setup, run by `npm run setup` after dependencies are installed. Checks Node, creates the database,
// and with --demo fills it with the made-up demo data to try things out.
//
//   npm run setup
//   npm run setup -- --demo

import { execFileSync } from "node:child_process";
import path from "node:path";
import { shown } from "../server/scripts/shown.ts";

const [major] = process.versions.node.split(".").map(Number);
if (major < 22) {
  console.error(`Node 22 or newer is needed (you have ${process.versions.node}). See https://nodejs.org.`);
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, "..");
const { db } = await import("../server/db.ts");
const jobs = (db.prepare("SELECT count(*) AS n FROM jobs").get() as { n: number }).n;
db.close();

if (process.argv.includes("--demo")) {
  if (jobs) {
    console.log(`Your database already has ${jobs} jobs, so the demo data wasn't loaded. Use a separate DATA_DIR to try it.`);
  } else {
    execFileSync(process.execPath, [...process.execArgv, path.join(root, "server/scripts/import-json.ts"), path.join(root, "demo/seed.json")], { stdio: "inherit" });
  }
}

const where = shown(path.join(process.env.DATA_DIR ?? path.join(root, "data"), "jobs.db"));
console.log(`
Ready. Your data lives in ${where}.

  npm run dev      start the app at http://localhost:5173 (while you change code)
  npm start        build once and run it at http://localhost:3001
  npm run export   save everything to a JSON file
`);
