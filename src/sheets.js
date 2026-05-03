"use strict";

const { google } = require("googleapis");
const logger = require("./logger");

// Column indices (0-based) matching sheet layout: caption | video_url | status | posted_at
const COL = {
  CAPTION: 0,
  VIDEO_URL: 1,
  STATUS: 2,
  POSTED_AT: 3,
};

const SHEET_TAB = "Sheet1";
const DATA_RANGE = `${SHEET_TAB}!A:D`;
const POSTED_STATUS = "posted";
const HEADER_ROW_COUNT = 1;

function buildAuthClient() {
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  return new google.auth.JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

/**
 * Returns the first pending row from the given sheet.
 * Returns null if every row is already posted or the sheet is empty.
 *
 * @param {string} sheetId
 * @returns {Promise<{ rowIndex: number, caption: string, videoUrl: string } | null>}
 */
async function getFirstPendingRow(sheetId) {
  const auth = buildAuthClient();
  const sheets = google.sheets({ version: "v4", auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: DATA_RANGE,
  });

  const rows = response.data.values || [];

  for (let i = HEADER_ROW_COUNT; i < rows.length; i++) {
    const row = rows[i];
    const status = (row[COL.STATUS] || "").trim().toLowerCase();

    if (status === POSTED_STATUS) continue;

    const caption = (row[COL.CAPTION] || "").trim();
    const videoUrl = (row[COL.VIDEO_URL] || "").trim();

    if (!videoUrl) {
      logger.warn(`Row ${i + 1}: missing video_url — skipping`);
      continue;
    }

    return {
      rowIndex: i + 1, // 1-based row number in the sheet
      caption,
      videoUrl,
    };
  }

  return null;
}

/**
 * Marks a row as posted and records the UTC timestamp.
 *
 * @param {string} sheetId
 * @param {number} rowIndex  1-based row number
 */
async function markAsPosted(sheetId, rowIndex) {
  const auth = buildAuthClient();
  const sheets = google.sheets({ version: "v4", auth });

  const postedAt = new Date().toISOString();
  const updateRange = `${SHEET_TAB}!C${rowIndex}:D${rowIndex}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: updateRange,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[POSTED_STATUS, postedAt]],
    },
  });

  logger.success(`Sheet row ${rowIndex} marked as posted (${postedAt})`);
}

module.exports = { getFirstPendingRow, markAsPosted };
