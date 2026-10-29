// Writes the whole database as one JSON file: a readable backup, and the input for the demo anonymizer.
// Opens the database read-only, so it never migrates or changes it.
//
//   npm run export                         (data/export-YYYY-MM-DD.json)
//   npm run export -- out.json --no-pdfs   (resume PDFs left out)

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { shown } from "./shown.ts";
import { PORTABLE_TABLES, readPortable } from "../portable.ts";

const args = process.argv.slice(2);
const noPdfs = args.includes("--no-pdfs");
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(import.meta.dirname, "../../data");
const out = path.resolve(args.find((a) => !a.startsWith("--")) ?? path.join(dataDir, `export-${new Date().toLocaleDateString("en-CA")}.json`));

const db = new Database(path.join(dataDir, "jobs.db"), { readonly: true, fileMustExist: true });

const data = readPortable(db, { pdfs: !noPdfs });

fs.writeFileSync(out, JSON.stringify(data, null, 2) + "\n");
const counts = PORTABLE_TABLES.map((t) => `${data.tables[t].length} ${t}`).join(", ");
console.log(`Exported ${counts} to ${shown(out)}`);
