"use strict";

const axios = require("axios");
const logger = require("./logger");

const BLOTATO_POSTS_URL = "https://api.blotato.com/v2/posts";

function redactHeadersForLog(headers) {
  const out = { ...headers };
  if (out.Authorization) {
    out.Authorization = "Bearer <redacted>";
  }
  if (out["blotato-api-key"]) {
    out["blotato-api-key"] = "<redacted>";
  }
  return out;
}

function assertSuccessfulPostResponse(response) {
  const { status, data } = response;
  if (status < 200 || status >= 300) {
    const body =
      data == null ? "" : typeof data === "string" ? data : JSON.stringify(data);
    throw new Error(`Blotato API returned status ${status}: ${body}`);
  }
  if (data && typeof data === "object") {
    if (data.success === false) {
      throw new Error(
        `Blotato API reported success=false: ${JSON.stringify(data)}`
      );
    }
    if (data.error != null && data.error !== "") {
      throw new Error(
        `Blotato API error field: ${JSON.stringify(data)}`
      );
    }
  }
}

/**
 * Posts a video to TikTok via the Blotato API.
 *
 * POST https://api.blotato.com/v2/posts
 * Body: { post: { accountId, target: "tiktok", content: { caption, mediaUrls } } }
 *
 * Language / market is implied by accountId (per-sheet mapping) and caption text — not sent as a field.
 *
 * @param {object} options
 * @param {string} options.accountId   Blotato account ID for this TikTok account
 * @param {string} options.videoUrl    Public URL of the video to post
 * @param {string} options.caption     Post caption / description
 * @returns {Promise<void>}            Throws on failure so the caller can skip marking as posted
 */
async function postVideo({ accountId, videoUrl, caption }) {
  const apiKey = process.env.BLOTATO_API_KEY;

  if (!apiKey) {
    throw new Error("BLOTATO_API_KEY is not set");
  }

  if (!accountId) {
    throw new Error("Blotato accountId is not set for this account");
  }

  const payload = {
    post: {
      accountId,
      target: "tiktok",
      content: {
        caption: caption ?? "",
        mediaUrls: [videoUrl],
      },
    },
  };

  const requestHeaders = {
    "blotato-api-key": apiKey,
    "Content-Type": "application/json",
  };

  logger.info("Blotato request:");
  logger.info(`  POST ${BLOTATO_POSTS_URL}`);
  logger.info(`  headers: ${JSON.stringify(redactHeadersForLog(requestHeaders))}`);
  logger.info(`  body: ${JSON.stringify(payload)}`);

  let response;
  try {
    response = await axios.post(BLOTATO_POSTS_URL, payload, {
      headers: requestHeaders,
      timeout: 30_000,
      validateStatus: () => true,
    });
  } catch (err) {
    logger.error("Blotato request failed (network/timeout)", err);
    throw err;
  }

  logger.info("Blotato response:");
  logger.info(`  status: ${response.status}`);
  logger.info(`  headers: ${JSON.stringify(response.headers)}`);
  logger.info(
    `  body: ${typeof response.data === "string" ? response.data : JSON.stringify(response.data)}`
  );

  assertSuccessfulPostResponse(response);
  logger.success(`Blotato post accepted (${response.status})`);
}

module.exports = { postVideo };
