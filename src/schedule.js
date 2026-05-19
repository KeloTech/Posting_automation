"use strict";

const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "..", "schedule.config.json");

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  return JSON.parse(raw);
}

function getHelsinkiNow() {
  const timezone = "Europe/Helsinki";
  const now = new Date();

  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
  })
    .format(now)
    .toLowerCase();

  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
      hourCycle: "h23",
    }).format(now)
  );

  return { weekday, hour, timezone };
}

/**
 * Returns whether this account should post on the current Helsinki hour.
 */
function shouldPostAccount(accountKey, { force = false } = {}) {
  if (force || process.env.FORCE_POST === "true") {
    return {
      post: true,
      reason: "forced (manual override)",
      accountKey,
    };
  }

  const config = loadConfig();
  const account = config.accounts[accountKey];

  if (!account) {
    return {
      post: false,
      reason: `Unknown account "${accountKey}" in schedule.config.json`,
      accountKey,
    };
  }

  const { weekday, hour, timezone } = getHelsinkiNow();
  const postsToday = config.postsPerWeekday[weekday] ?? 0;
  const startHour = account.startHour;

  if (postsToday === 0) {
    return {
      post: false,
      reason: `No posts on ${weekday} (${timezone})`,
      accountKey,
      weekday,
      hour,
      postsToday,
    };
  }

  const slotIndex = hour - startHour;

  if (slotIndex < 0 || slotIndex >= postsToday) {
    return {
      post: false,
      reason: `${hour}:00 is outside ${accountKey}'s ${postsToday} slot(s) (${startHour}:00–${startHour + postsToday - 1}:00, ${timezone})`,
      accountKey,
      weekday,
      hour,
      postsToday,
      startHour,
      slotIndex,
    };
  }

  return {
    post: true,
    reason: `${accountKey} slot ${slotIndex + 1}/${postsToday} on ${weekday} at ${hour}:00 (${timezone})`,
    accountKey,
    weekday,
    hour,
    postsToday,
    startHour,
    slotIndex,
  };
}

function getAccountsToPost(accountKeys, options = {}) {
  return accountKeys
    .map((key) => ({ key, schedule: shouldPostAccount(key, options) }))
    .filter(({ schedule }) => schedule.post);
}

module.exports = { loadConfig, getHelsinkiNow, shouldPostAccount, getAccountsToPost };
