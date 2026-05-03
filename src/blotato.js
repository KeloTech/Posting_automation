"use strict";

const axios = require("axios");
const logger = require("./logger");

const BLOTATO_BASE_URL = "https://backend.blotato.com/v2";

/**
 * Posts a video to TikTok via the Blotato API.
 *
 * Blotato expects:
 *   POST /v2/posts
 *   Authorization: Bearer <api_key>
 *   Body: { target: { targetType, accountId }, post: { text, videoUrl } }
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
    throw new Error("Blotato accountId is not set for this language");
  }

  const payload = {
    target: {
      targetType: "tiktok",
      accountId,
    },
    post: {
      text: caption,
      videoUrl,
    },
  };

  logger.info(`Calling Blotato API → accountId=${accountId}`);
  logger.info(`  videoUrl: ${videoUrl}`);
  logger.info(`  caption:  ${caption.slice(0, 80)}${caption.length > 80 ? "…" : ""}`);

  const response = await axios.post(`${BLOTATO_BASE_URL}/posts`, payload, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    timeout: 30_000,
  });

  logger.success(`Blotato response: ${response.status} ${JSON.stringify(response.data)}`);
}

module.exports = { postVideo };
