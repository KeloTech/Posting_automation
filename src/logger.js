"use strict";

function timestamp() {
  return new Date().toISOString();
}

function info(message) {
  console.log(`[${timestamp()}] [INFO]  ${message}`);
}

function success(message) {
  console.log(`[${timestamp()}] [OK]    ${message}`);
}

function warn(message) {
  console.warn(`[${timestamp()}] [WARN]  ${message}`);
}

function error(message, err) {
  const detail = err ? ` — ${err.message || err}` : "";
  console.error(`[${timestamp()}] [ERROR] ${message}${detail}`);
}

function divider(label) {
  const line = "─".repeat(50);
  console.log(`\n${line}`);
  if (label) console.log(`  ${label}`);
  console.log(line);
}

module.exports = { info, success, warn, error, divider };
