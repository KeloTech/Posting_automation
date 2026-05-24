"use strict";

// Load .env only when running locally; GitHub Actions injects secrets as env vars directly
if (process.env.CI !== "true") {
  require("dotenv").config();
}

const { google } = require("googleapis");
const { buildAuthClient, listFilesInFolder } = require("./src/drive");
const logger = require("./src/logger");

// ─── Config ───────────────────────────────────────────────────────────────────

const SHEET_TAB = "Sheet1";

const LANGUAGE_SHEET_IDS = {
  fi: () => process.env.SHEET_ID_FI,
  de: () => process.env.SHEET_ID_DE,
  us: () => process.env.SHEET_ID_US,
};

// Video file extensions to accept; mimeType fallback also checked
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"]);

// ─── Validation ───────────────────────────────────────────────────────────────

function validateEnv() {
  const required = [
    "GOOGLE_CLIENT_EMAIL",
    "GOOGLE_PRIVATE_KEY",
    "DRIVE_FOLDER_ID_NEW_VIDEOS",
    "SHEET_ID_FI",
    "SHEET_ID_DE",
    "SHEET_ID_US",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

// ─── File helpers ─────────────────────────────────────────────────────────────

function isVideoFile(file) {
  const dot = file.name.lastIndexOf(".");
  if (dot !== -1) {
    const ext = file.name.slice(dot).toLowerCase();
    if (VIDEO_EXTENSIONS.has(ext)) return true;
  }
  return (file.mimeType || "").startsWith("video/");
}

/**
 * Detects language from file name suffix.
 * Accepts names like: sipster_34_fi.mp4, sipster_35_de.mp4, sipster_36_us.mp4
 *
 * @param {string} fileName
 * @returns {"fi"|"de"|"us"|null}
 */
function detectLanguage(fileName) {
  // Strip extension, then check trailing language code
  const base = fileName.toLowerCase().replace(/\.[^.]+$/, "");
  if (base.endsWith("_fi")) return "fi";
  if (base.endsWith("_de")) return "de";
  if (base.endsWith("_us")) return "us";
  return null;
}

function buildVideoUrlRaw(fileId) {
  return `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
}

// ─── Sheet helpers ────────────────────────────────────────────────────────────

/**
 * Reads columns E and G from a sheet in a single API call.
 * Returns:
 *   existingFileIds — Set of file IDs already in column G (dedup check)
 *   nextRow         — 1-based row number of the first truly empty row
 *
 * Why column E for nextRow: older rows may have column G empty (they were
 * added before this sync system existed). The Sheets API only returns rows up
 * to the last non-empty cell, so basing nextRow on column G alone would
 * return a row number that is too low and overwrite existing data.
 * Column E (video_url_raw) is populated on every row, so its length reliably
 * reflects the real last data row in the sheet.
 *
 * Columns A–D are never read or touched by this script.
 *
 * @param {string} sheetId
 * @returns {Promise<{ existingFileIds: Set<string>, nextRow: number }>}
 */
async function readSheetState(sheetId) {
  const auth = buildAuthClient();
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: sheetId,
    ranges: [`${SHEET_TAB}!E:E`, `${SHEET_TAB}!G:G`],
  });

  const eRows = (res.data.valueRanges[0].values) || [];
  const gRows = (res.data.valueRanges[1].values) || [];

  // Column G: skip header row (index 0), collect non-empty file_ids
  const existingFileIds = new Set(
    gRows.slice(1).map((r) => (r[0] || "").trim()).filter(Boolean)
  );

  // Use the longer of E and G to find the true last data row.
  // This guards against old rows that have E filled but G empty, or vice versa.
  const nextRow = Math.max(eRows.length, gRows.length) + 1;

  return { existingFileIds, nextRow };
}

/**
 * Writes only columns E, F, and G for a given row.
 * Columns A–D are never touched — they are managed by the sheet itself.
 *
 * Column layout written:
 *   E  = video_url_raw
 *   F  = file_name
 *   G  = file_id
 *
 * @param {string} sheetId
 * @param {number} rowNumber  1-based row number to write
 * @param {{ videoUrlRaw: string, fileName: string, fileId: string }} data
 */
async function writeRow(sheetId, rowNumber, { videoUrlRaw, fileName, fileId }) {
  const auth = buildAuthClient();
  const sheets = google.sheets({ version: "v4", auth });

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${SHEET_TAB}!E${rowNumber}:G${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[videoUrlRaw, fileName, fileId]],
    },
  });
}

// ─── Per-language sync ────────────────────────────────────────────────────────

async function syncLanguage(lang, files) {
  const sheetId = LANGUAGE_SHEET_IDS[lang]();

  logger.divider(`Language: ${lang.toUpperCase()} — ${files.length} file(s) to check`);

  if (!sheetId) {
    logger.warn(`SHEET_ID_${lang.toUpperCase()} is not set — skipping`);
    return { added: 0, skipped: 0, failed: 0 };
  }

  let existingFileIds, nextRow;
  try {
    ({ existingFileIds, nextRow } = await readSheetState(sheetId));
    logger.info(`Sheet has ${existingFileIds.size} existing file ID(s); next available row: ${nextRow}`);
  } catch (err) {
    logger.error("Failed to read sheet state — skipping this language", err);
    return { added: 0, skipped: 0, failed: 0 };
  }

  let added = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    if (existingFileIds.has(file.id)) {
      logger.info(`  SKIP  ${file.name} (already in sheet)`);
      skipped++;
      continue;
    }

    const rowNumber = nextRow + added; // track locally so each new row goes to the right place
    const videoUrlRaw = buildVideoUrlRaw(file.id);

    try {
      await writeRow(sheetId, rowNumber, {
        videoUrlRaw,
        fileName: file.name,
        fileId: file.id,
      });
      logger.success(`  ADD   ${file.name} → row ${rowNumber}`);
      added++;
    } catch (err) {
      logger.error(`  FAIL  ${file.name} — could not write row ${rowNumber}`, err);
      failed++;
    }
  }

  logger.info(`  Result: ${added} added, ${skipped} skipped, ${failed} failed`);
  return { added, skipped, failed };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  logger.divider("Google Drive → Sheets Sync");

  validateEnv();

  const folderId = process.env.DRIVE_FOLDER_ID_NEW_VIDEOS;
  logger.info(`Drive folder: ${folderId}`);

  // 1. List all files in the Drive folder
  let allFiles;
  try {
    allFiles = await listFilesInFolder(folderId);
  } catch (err) {
    logger.error("Failed to list files from Google Drive — aborting", err);
    process.exit(1);
  }
  logger.info(`Files found in folder: ${allFiles.length}`);

  // 2. Filter to video files only
  const videoFiles = allFiles.filter(isVideoFile);
  logger.info(`Video files: ${videoFiles.length}`);

  if (videoFiles.length === 0) {
    logger.info("No video files found — nothing to sync");
    logger.divider("Sync complete (nothing to do)");
    return;
  }

  // 3. Group by detected language
  const byLang = { fi: [], de: [], us: [] };
  const unrecognised = [];

  for (const file of videoFiles) {
    const lang = detectLanguage(file.name);
    if (!lang) {
      logger.warn(`Unknown language suffix: "${file.name}" — skipping`);
      unrecognised.push(file.name);
      continue;
    }
    byLang[lang].push(file);
  }

  logger.info(
    `Grouped: FI=${byLang.fi.length}, DE=${byLang.de.length}, US=${byLang.us.length}` +
    (unrecognised.length ? `, unrecognised=${unrecognised.length}` : "")
  );

  // 4. Sync each language sheet in order
  const totals = { added: 0, skipped: 0, failed: 0 };

  for (const lang of ["fi", "de", "us"]) {
    if (byLang[lang].length === 0) {
      logger.info(`No ${lang.toUpperCase()} files — skipping sheet`);
      continue;
    }
    const result = await syncLanguage(lang, byLang[lang]);
    totals.added += result.added;
    totals.skipped += result.skipped;
    totals.failed += result.failed;
  }

  logger.divider(
    `Sync complete — added: ${totals.added}, skipped: ${totals.skipped}, failed: ${totals.failed}`
  );

  if (totals.failed > 0) {
    logger.warn(`${totals.failed} row(s) failed to write — check logs above`);
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error("Unhandled error — aborting", err);
  process.exit(1);
});
