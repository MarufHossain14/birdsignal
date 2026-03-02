import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1_BATx5SBmOSEmMoEp6iSW61WwmiX4tghZVSBAygLvQs/edit?gid=0#gid=0";

const publicDir = "/home/maruf/labs/birdcourse/frontend/public";
const catalogDir = path.join(publicDir, "data", "course-catalog");
const rawPath = path.join(catalogDir, "raw.json");
const normalizedPath = path.join(catalogDir, "normalized.json");
const byCodePath = path.join(catalogDir, "by-code.json");

const inputUrl = process.argv[2] || process.env.BIRDCOURSE_SHEET_URL || DEFAULT_SHEET_URL;

const toExportUrl = (url) => {
  const parsed = new URL(url);
  const idMatch = parsed.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
  if (!idMatch) {
    throw new Error(`Could not parse spreadsheet id from URL: ${url}`);
  }
  const sheetId = idMatch[1];
  const gid = parsed.searchParams.get("gid") || "0";
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
};

const parseCsv = (csvText) => {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const ch = csvText[i];
    const next = csvText[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
};

const rowsToRawJson = (rows) =>
  rows
    .map((columns) => ({
      "Bird Courses": String(columns[0] ?? "").trim(),
      "Unnamed: 1": String(columns[1] ?? "").trim(),
      "Unnamed: 2": String(columns[2] ?? "").trim(),
    }))
    .filter((row) => row["Bird Courses"] || row["Unnamed: 1"] || row["Unnamed: 2"]);

const readJsonIfExists = (filePath, fallback) => {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
};

const normalizeCode = (value) => String(value ?? "").trim().toUpperCase();

const toMergedEntry = (incoming, existing) => {
  const code = normalizeCode(incoming?.code || existing?.code);
  if (!code) return null;

  const incomingAlt = Array.isArray(incoming?.alt_codes) ? incoming.alt_codes : [];
  const existingAlt = Array.isArray(existing?.alt_codes) ? existing.alt_codes : [];
  const altCodes = [...new Set([...incomingAlt, ...existingAlt].map(normalizeCode).filter(Boolean))].filter(
    (alt) => alt !== code
  );

  const incomingRaw = Array.isArray(incoming?.raw_codes) ? incoming.raw_codes : [];
  const existingRaw = Array.isArray(existing?.raw_codes) ? existing.raw_codes : [];
  const rawCodes = [...new Set([...incomingRaw, ...existingRaw].map((v) => String(v).trim()).filter(Boolean))];

  const incomingCategories = Array.isArray(incoming?.categories) ? incoming.categories : [];
  const existingCategories = Array.isArray(existing?.categories) ? existing.categories : [];
  const categories = [...new Set([...incomingCategories, ...existingCategories].map((v) => String(v).trim()).filter(Boolean))];

  const title =
    String(incoming?.title ?? "").trim() ||
    String(existing?.title ?? "").trim() ||
    code;
  const description =
    String(incoming?.description ?? "").trim() ||
    String(existing?.description ?? "").trim() ||
    null;
  const category =
    String(incoming?.category ?? "").trim() ||
    String(existing?.category ?? "").trim() ||
    (categories[0] ?? "Uncategorized");

  return {
    code,
    alt_codes: altCodes,
    raw_codes: rawCodes,
    title,
    description: description || null,
    category,
    categories: categories.length ? categories : [category],
    is_online_hint: Boolean(incoming?.is_online_hint || existing?.is_online_hint),
  };
};

const mergeCatalogEntries = (sheetEntries, existingEntries) => {
  const mergedByCode = new Map();

  for (const entry of existingEntries) {
    const code = normalizeCode(entry?.code);
    if (!code) continue;
    mergedByCode.set(code, toMergedEntry({ code }, entry));
  }

  for (const entry of sheetEntries) {
    const code = normalizeCode(entry?.code);
    if (!code) continue;
    const existing = mergedByCode.get(code);
    mergedByCode.set(code, toMergedEntry(entry, existing));
  }

  return Array.from(mergedByCode.values());
};

const buildByCodeMap = (entries) => {
  const byCode = {};
  for (const item of entries) {
    byCode[item.code] = item;
    for (const alt of item.alt_codes) {
      if (!byCode[alt]) byCode[alt] = item;
    }
  }
  return byCode;
};

const main = async () => {
  fs.mkdirSync(catalogDir, { recursive: true });
  const previousNormalized = readJsonIfExists(normalizedPath, []);

  const exportUrl = toExportUrl(inputUrl);
  console.log(`Fetching sheet CSV from ${exportUrl}`);

  const response = await fetch(exportUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch sheet CSV: HTTP ${response.status}`);
  }

  const csvText = await response.text();
  const parsedRows = parseCsv(csvText);
  const rawRows = rowsToRawJson(parsedRows);

  fs.writeFileSync(rawPath, `${JSON.stringify(rawRows, null, 2)}\n`);
  console.log(`Wrote ${rawRows.length} rows to ${rawPath}`);

  const normalize = spawnSync("node", ["scripts/normalize-bird-courses.mjs"], {
    cwd: "/home/maruf/labs/birdcourse/frontend",
    stdio: "inherit",
  });

  if (normalize.status !== 0) {
    throw new Error("Catalog normalization failed after sheet sync");
  }

  const normalizedFromSheet = readJsonIfExists(normalizedPath, []);
  const mergedNormalized = mergeCatalogEntries(normalizedFromSheet, previousNormalized);
  const mergedByCode = buildByCodeMap(mergedNormalized);

  fs.writeFileSync(normalizedPath, `${JSON.stringify(mergedNormalized, null, 2)}\n`);
  fs.writeFileSync(byCodePath, `${JSON.stringify(mergedByCode, null, 2)}\n`);

  console.log(
    `Merged catalog: ${normalizedFromSheet.length} from sheet + ${previousNormalized.length} previous -> ${mergedNormalized.length} unique courses`
  );
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
