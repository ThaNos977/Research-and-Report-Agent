# Microsoft Word Add-in (Office.js)

This package contains the Office.js adapter and manifest for running the **Research & Documentation Assistant** inside Microsoft Word (Word on Web, Mac, and Windows).

## Sideloading Instructions

### Word on the Web (Office 365)
1. Ensure your local Vite dev server is running on HTTPS:
   ```bash
   npm run dev
   ```
2. Open any document in [Word Online](https://office.live.com/).
3. Go to the **Insert** tab > **Add-ins** > **Upload My Add-in**.
4. Browse to and select `packages/host-word/manifest.xml`.
5. The **Research** tab will appear in the Word ribbon. Click **Open Research Assistant** to launch the side panel!

### Word on macOS
1. Copy `manifest.xml` to the Office Add-in catalog:
   ```bash
   cp packages/host-word/manifest.xml ~/Library/Containers/com.microsoft.Word/Data/Documents/wef/
   ```
2. Restart Microsoft Word.
3. Open a document and click **Insert** > **My Add-ins** > **Research & Documentation Assistant**.
