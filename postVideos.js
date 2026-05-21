"use strict";

// Load .env only when running locally; GitHub Actions injects secrets as env vars directly
if (process.env.CI !== "true") {
  require("dotenv").config();
}

const { getFirstPendingRow, markAsPosted } = require("./src/sheets");
const { postVideo } = require("./src/blotato");
const logger = require("./src/logger");

// ─── Account definitions ──────────────────────────────────────────────────────

const ALL_ACCOUNTS = {
  FI: {
    name: "FI (Finnish)",
    sheetId: () => process.env.SHEET_ID_FI,
    blotatoAccountId: () => process.env.BLOTATO_ACCOUNT_ID_FI,
  },
  DE: {
    name: "DE (German)",
    sheetId: () => process.env.SHEET_ID_DE,
    blotatoAccountId: () => process.env.BLOTATO_ACCOUNT_ID_DE,
  },
  US: {
    name: "US (English)",
    sheetId: () => process.env.SHEET_ID_US,
    blotatoAccountId: () => process.env.BLOTATO_ACCOUNT_ID_US,
  },
};

// One account per workflow run (cron defines when; no hour check in script)
const WORKFLOWS = {
  fi: ["FI"],
  de: ["DE"],
  us: ["US"],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function validateEnv() {
  const required = [
    "GOOGLE_CLIENT_EMAIL",
    "GOOGLE_PRIVATE_KEY",
    "BLOTATO_API_KEY",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

// ─── Per-account logic ────────────────────────────────────────────────────────

async function processAccount(key) {
  const account = ALL_ACCOUNTS[key];
  logger.divider(`Account: ${account.name}`);

  const sheetId = account.sheetId();
  const blotatoAccountId = account.blotatoAccountId();

  if (!sheetId) {
    logger.warn(`SHEET_ID_${key} is not set — skipping`);
    return;
  }

  if (!blotatoAccountId) {
    logger.warn(`BLOTATO_ACCOUNT_ID_${key} is not set — skipping`);
    return;
  }

  logger.info("Reading Google Sheet for first pending row…");
  let pending;
  try {
    pending = await getFirstPendingRow(sheetId);
  } catch (err) {
    logger.error("Failed to read Google Sheet", err);
    return;
  }

  if (!pending) {
    logger.info("No pending videos found — nothing to post");
    return;
  }

  logger.info(`Found pending row ${pending.rowIndex}: "${pending.videoUrl}"`);

  try {
    await postVideo({
      accountId: blotatoAccountId,
      videoUrl: pending.videoUrl,
      caption: pending.caption,
    });
  } catch (err) {
    logger.error("Blotato API call failed — row NOT marked as posted", err);
    return;
  }

  try {
    await markAsPosted(sheetId, pending.rowIndex);
  } catch (err) {
    logger.error("Video was posted but failed to update sheet status", err);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const mode = (process.argv[2] || "").toLowerCase();

  if (!WORKFLOWS[mode]) {
    console.error(`Usage: node postVideos.js <fi|de|us>`);
    console.error(`  fi → Finnish account (1 video per run)`);
    console.error(`  de → German account (1 video per run)`);
    console.error(`  us → US account (1 video per run)`);
    process.exit(1);
  }

  logger.divider(`TikTok Automation — mode: ${mode.toUpperCase()}`);
  validateEnv();

  const accountKeys = WORKFLOWS[mode];
  for (const key of accountKeys) {
    await processAccount(key);
  }

  logger.divider("Run complete");
  logger.success(`Done for mode: ${mode.toUpperCase()}`);
}

main().catch((err) => {
  logger.error("Unhandled error — aborting", err);
  process.exit(1);
});
