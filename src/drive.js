"use strict";

const { google } = require("googleapis");

// Both scopes are required: Drive to list files, Sheets to read/write rows
const AUTH_SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
];

function buildAuthClient() {
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  return new google.auth.JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: privateKey,
    scopes: AUTH_SCOPES,
  });
}

/**
 * Lists all non-trashed files inside a Drive folder.
 * Handles pagination automatically.
 *
 * @param {string} folderId  Google Drive folder ID
 * @returns {Promise<Array<{ id: string, name: string, mimeType: string }>>}
 */
async function listFilesInFolder(folderId) {
  const auth = buildAuthClient();
  const drive = google.drive({ version: "v3", auth });

  const files = [];
  let pageToken = null;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType)",
      pageSize: 1000,
      ...(pageToken ? { pageToken } : {}),
    });

    files.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken || null;
  } while (pageToken);

  return files;
}

module.exports = { buildAuthClient, listFilesInFolder };
