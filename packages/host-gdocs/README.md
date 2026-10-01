# Google Docs Add-on (Apps Script)

This package contains the Apps Script integration for running the **Research & Documentation Assistant** as a sidebar inside Google Docs.

## Setup & Deployment Instructions

1. Install Google Clasp if you haven't already:
   ```bash
   npm install -g @google/clasp
   clasp login
   ```
2. Create or clone an Apps Script project bound to your Google Doc:
   ```bash
   clasp create --type docs --title "Research & Documentation Assistant"
   ```
3. Copy `Code.gs` and `appsscript.json` into your clasp project directory.
4. Push to Apps Script:
   ```bash
   clasp push
   ```
5. In your Google Doc, refresh the page. Click **Extensions** > **Research Assistant** > **Open Sidebar**!
