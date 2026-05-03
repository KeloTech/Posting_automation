# TikTok Automation System (Cursor + GitHub Actions)

## 🎯 Goal

Create a fully automated system that:

* Runs daily at scheduled times
* Reads video data from Google Sheets
* Posts videos to TikTok via Blotato API
* Updates the status in Google Sheets

Supports **5 TikTok accounts (languages)**:

* Finnish (FI)
* German (DE)
* Spanish (ES)
* Portuguese - Brazil (BR)
* English (US)

---

## 🧠 High-Level Logic

1. Run automation (GitHub Actions cron)
2. For each TikTok account:

   * Open corresponding Google Sheet
   * Find first row where `status != posted`
   * Extract:

     * caption
     * video_url
   * Send to Blotato API
   * If success:

     * update row → status = posted
     * add timestamp

---

## 🌍 Accounts Structure

We use **separate Google Sheets per language/account**:

* sheet_fi
* sheet_de
* sheet_es
* sheet_br
* sheet_us

Each sheet contains:

| caption | video_url | status         |
| ------- | --------- | -------------- |
| text    | url       | pending/posted |

---

## ⏱ Scheduling (IMPORTANT)

We use **2 workflows**:

### 🇪🇺 EU Workflow

Runs at **12:00 Helsinki time**

Includes:

* Finnish (FI)
* German (DE)
* Spanish (ES)

Cron (UTC approx):

```
0 9 * * *
```

---

### 🌎 US + Brazil Workflow

Runs at **12:00 US local time**

Includes:

* English (US)
* Portuguese (BR)

Cron:
(adjust based on timezone, e.g. EST)

```
0 17 * * *
```

---

## ⚙️ Tech Stack

* Node.js
* Google Sheets API
* Blotato API (TikTok posting)
* GitHub Actions (scheduler)

---

## 🔐 Environment Variables (GitHub Secrets)

Store these:

* GOOGLE_CLIENT_EMAIL
* GOOGLE_PRIVATE_KEY
* SHEET_ID_FI
* SHEET_ID_DE
* SHEET_ID_ES
* SHEET_ID_BR
* SHEET_ID_US
* BLOTATO_API_KEY

---

## 🧩 Implementation Steps

### 1. Setup Google Sheets API

* Create Google Cloud project
* Enable Sheets API
* Create Service Account
* Share each sheet with service account email

---

### 2. Core Script (Node.js)

Create file: `postVideos.js`

Main logic:

```id="cceyvv"
const accounts = [
  { name: "FI", sheetId: process.env.SHEET_ID_FI },
  { name: "DE", sheetId: process.env.SHEET_ID_DE },
  { name: "ES", sheetId: process.env.SHEET_ID_ES },
  { name: "BR", sheetId: process.env.SHEET_ID_BR },
  { name: "US", sheetId: process.env.SHEET_ID_US },
];
```

Workflow:

```id="1p0fs1"
for each account in correct order:
    connect to Google Sheets
    find first row where status != "posted"
    
    if no rows:
        continue
    
    extract caption + video_url
    
    send POST request to Blotato API
    
    if success:
        update row status = "posted"
        add timestamp
```

---

## 🔁 Execution Order

### EU workflow order:

1. FI
2. DE
3. ES

### US/BR workflow order:

1. US
2. BR

---

## 🌐 Blotato API Call

POST request should include:

* video_url
* caption
* account identifier (VERY IMPORTANT)

Handle:

* success response
* error handling

---

## ⛔ Sequential Processing (MANDATORY)

* Do NOT run accounts in parallel
* Add delay between posts (5–10 seconds)

---

## 🤖 GitHub Actions Setup

### EU Workflow

`.github/workflows/post-eu.yml`

```id="w63phs"
name: Post EU TikToks

on:
  schedule:
    - cron: "0 9 * * *"

jobs:
  run-script:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: 18

      - run: npm install

      - run: node postVideos.js eu
```

---

### US + BR Workflow

`.github/workflows/post-us.yml`

```id="3ozd0z"
name: Post US + BR TikToks

on:
  schedule:
    - cron: "0 17 * * *"

jobs:
  run-script:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: 18

      - run: npm install

      - run: node postVideos.js us
```

---

## 🧠 Script Mode Handling

Script should accept argument:

```id="iy50o4"
node postVideos.js eu
node postVideos.js us
```

Logic:

* if "eu" → run FI, DE, ES
* if "us" → run US, BR

---

## ⚠️ Edge Cases

Handle:

* No pending videos → skip
* API failure → do NOT mark posted
* Invalid URL → skip
* Rate limits → delay

---

## 🧪 Testing Plan

1. Test locally with 1 sheet
2. Verify posting works
3. Verify sheet updates
4. Then enable full workflows

---

## 🚀 Future Improvements

* Retry system
* Logging (Discord webhook)
* AI caption generation
* Multi-video per day

---

## ✅ Definition of Done

System:

* runs automatically daily
* posts 1 video per account
* updates sheets correctly
* no manual work needed

---

## ❗ Notes

* Videos are pre-edited → no processing needed
* Sheets are source of truth
* Reliability depends on Blotato API

---
