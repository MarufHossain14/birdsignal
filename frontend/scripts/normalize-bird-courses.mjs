import fs from "node:fs";
import path from "node:path";

const publicDir = "/home/maruf/labs/birdcourse/frontend/public";
const catalogDir = path.join(publicDir, "data", "course-catalog");
const inputPath = path.join(catalogDir, "raw.json");
const outputPath = path.join(catalogDir, "normalized.json");
const mapOutputPath = path.join(catalogDir, "by-code.json");

fs.mkdirSync(catalogDir, { recursive: true });

const raw = fs.readFileSync(inputPath, "utf8");
const rows = JSON.parse(raw);

const SECTION_LABELS = new Map([
  ["Bird Courses", "Bird Courses"],
  ["Courses We Recommend:", "Recommended"],
  ["Learning Arabic:", "Learning Arabic"],
  ["Other Courses:", "Other Courses"],
]);

const codeRegex = /[A-Z]{2,5}\d{2,4}[A-Z]?/g;

const extractCodes = (rawCode) => {
  const matches = rawCode.toUpperCase().match(codeRegex);
  if (!matches) return [];
  return [...new Set(matches)];
};

let currentCategory = "Bird Courses";
const byPrimaryCode = new Map();

for (const row of rows) {
  const rawCode = String(row["Bird Courses"] ?? "").trim();
  const title = String(row["Unnamed: 1"] ?? "").trim();
  const description = String(row["Unnamed: 2"] ?? "").trim();

  if (!rawCode) continue;

  if (SECTION_LABELS.has(rawCode) && !title && !description) {
    currentCategory = SECTION_LABELS.get(rawCode);
    continue;
  }

  const codes = extractCodes(rawCode);
  if (!codes.length) continue;

  const isOnlineHint =
    rawCode.toUpperCase().includes("(OC)") ||
    description.toLowerCase().includes("online learning only");

  const primaryCode = codes[0];
  const next = {
    code: primaryCode,
    alt_codes: codes.slice(1),
    raw_codes: [rawCode],
    title: title || rawCode,
    description: description || null,
    category: currentCategory,
    categories: [currentCategory],
    is_online_hint: isOnlineHint,
  };

  const existing = byPrimaryCode.get(primaryCode);
  if (!existing) {
    byPrimaryCode.set(primaryCode, next);
    continue;
  }

  const mergedAltCodes = [...new Set([...existing.alt_codes, ...next.alt_codes])];
  const mergedRawCodes = [...new Set([...existing.raw_codes, ...next.raw_codes])];
  const mergedCategories = [...new Set([...existing.categories, ...next.categories])];

  const keepNextTitle =
    (!existing.title && next.title) ||
    (next.title && existing.title && next.title.length > existing.title.length);
  const keepNextDescription =
    (!existing.description && next.description) ||
    (next.description &&
      existing.description &&
      next.description.length > existing.description.length);

  byPrimaryCode.set(primaryCode, {
    ...existing,
    alt_codes: mergedAltCodes,
    raw_codes: mergedRawCodes,
    title: keepNextTitle ? next.title : existing.title,
    description: keepNextDescription ? next.description : existing.description,
    category: mergedCategories[0],
    categories: mergedCategories,
    is_online_hint: existing.is_online_hint || next.is_online_hint,
  });
}

const normalized = Array.from(byPrimaryCode.values());
const byCode = {};
for (const item of normalized) {
  byCode[item.code] = item;
  for (const alt of item.alt_codes) {
    if (!byCode[alt]) byCode[alt] = item;
  }
}

fs.writeFileSync(outputPath, `${JSON.stringify(normalized, null, 2)}\n`);
fs.writeFileSync(mapOutputPath, `${JSON.stringify(byCode, null, 2)}\n`);

console.log(`Wrote ${normalized.length} entries to ${outputPath}`);
console.log(`Wrote ${Object.keys(byCode).length} code mappings to ${mapOutputPath}`);
