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
  ES: {
    name: "ES (Spanish)",
    sheetId: () => process.env.SHEET_ID_ES,
    blotatoAccountId: () => process.env.BLOTATO_ACCOUNT_ID_ES,
  },
  BR: {
    name: "BR (Portuguese)",
    sheetId: () => process.env.SHEET_ID_BR,
    blotatoAccountId: () => process.env.BLOTATO_ACCOUNT_ID_BR,
  },
  US: {
    name: "US (English)",
    sheetId: () => process.env.SHEET_ID_US,
    blotatoAccountId: () => process.env.BLOTATO_ACCOUNT_ID_US,
  },
};

// Workflow → ordered account list (sequential execution required)
const WORKFLOWS = {
  eu: ["FI", "DE", "ES"],
  us: ["US", "BR"],
  es: ["ES"],
  fi_de: ["FI", "DE"],
  us_only: ["US"],
  us_br: ["US", "BR"],
};

const DELAY_BETWEEN_POSTS_MS = 7_000; // 7 seconds between accounts

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

  // 1. Fetch first pending row from Google Sheets
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

  // 2. Post to TikTok via Blotato
  try {
    await postVideo({
      accountId: blotatoAccountId,
      videoUrl: pending.videoUrl,
      caption: pending.caption,
    });
  } catch (err) {
    // Do NOT mark as posted if the API call failed
    logger.error("Blotato API call failed — row NOT marked as posted", err);
    return;
  }

  // 3. Mark row as posted only after confirmed success
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
    console.error(`Usage: node postVideos.js <eu|us|es|fi_de|us_only|us_br>`);
    console.error(`  eu → posts FI, DE, ES`);
    console.error(`  us → posts US, BR`);
    console.error(`  es → posts ES`);
    console.error(`  fi_de → posts FI, DE`);
    console.error(`  us_only → posts US`);
    console.error(`  us_br → posts US, BR`);
    process.exit(1);
  }

  logger.divider(`TikTok Automation — mode: ${mode.toUpperCase()}`);
  logger.info(`Accounts to process: ${WORKFLOWS[mode].join(", ")}`);

  validateEnv();

  const accountKeys = WORKFLOWS[mode];

  for (let i = 0; i < accountKeys.length; i++) {
    await processAccount(accountKeys[i]);

    // Delay between accounts (skip delay after the last one)
    if (i < accountKeys.length - 1) {
      logger.info(`Waiting ${DELAY_BETWEEN_POSTS_MS / 1000}s before next account…`);
      await sleep(DELAY_BETWEEN_POSTS_MS);
    }
  }

  logger.divider("Run complete");
  logger.success(`All accounts processed for mode: ${mode.toUpperCase()}`);
}

main().catch((err) => {
  logger.error("Unhandled error — aborting", err);
  process.exit(1);
});
