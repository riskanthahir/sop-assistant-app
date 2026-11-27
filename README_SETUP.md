# SOP Assistant — Click-by-Click Setup Guide

This guide is written for telecom engineers with no software development experience. Everything runs on **100% free tiers** (GitHub private repository, Google AI Studio free Gemini API key, and Vercel Hobby).

---

## Step 1: Get a Free Gemini API Key

1. Open [Google AI Studio](https://aistudio.google.com/) and sign in with your Google account.
2. Click **Get API key** in the left menu (or top bar).
3. Click **Create API key**, choose a project (or create a new one), and copy the generated key.
4. Keep this key private. You will paste it into GitHub Secrets (Step 3) and Vercel Environment Variables (Step 6).

---

## Step 2: Create a Private GitHub Repository & Upload Files

1. Go to [GitHub](https://github.com) and sign in (or create a free account).
2. Click the **+** icon at the top-right and select **New repository**.
3. Set **Repository name** to `sop-assistant`.
4. Select **Private** (important so your company SOP PDFs stay private).
5. Click **Create repository**.
6. On the new repository page, click **uploading an existing file** (or use **GitHub Desktop** — recommended if your PDFs are large).
7. Drag and drop all project folders and files (`api/`, `data/`, `lib/`, `public/`, `scripts/`, `sops/`, `src/`, `.github/`, `index.html`, `package.json`, `server.ts`, `tsconfig.json`, `vercel.json`, `vite.config.ts`, `.env.example`, `.gitignore`, `.vercelignore`), then click **Commit changes**.

---

## Step 3: Add `GEMINI_API_KEY` to GitHub Secrets

GitHub Actions needs your Gemini key to turn your SOP PDFs into searchable files.

1. Open your `sop-assistant` repository on GitHub.
2. Click **Settings** (top tab).
3. In the left sidebar, click **Secrets and variables** -> **Actions**.
4. Click **New repository secret**.
5. Set **Name** to: `GEMINI_API_KEY`
6. Paste your Gemini API key into **Secret**.
7. Click **Add secret**.
8. Make sure Actions can commit data back:
   - Go to **Settings** -> **Actions** -> **General**.
   - Scroll to **Workflow permissions**, select **Read and write permissions**, and click **Save**.

---

## Step 4: Upload Your SOP PDFs to `/sops`

### Option A: GitHub Web Upload (for PDFs under 25 MB each)
1. Open the `sops` folder in your GitHub repository.
2. Click **Add file** -> **Upload files**.
3. Drag your SOP PDFs (up to 25 MB per file in the browser) into the upload box.
4. Click **Commit changes**.

### Option B: GitHub Desktop (for PDFs between 25 MB and 100 MB, or uploading 20 files at once)
GitHub's website blocks single uploads over **25 MB**, while Git allows files up to **100 MB**.
1. Download and install [GitHub Desktop](https://desktop.github.com/) and sign in.
2. Click **Clone a repository from the Internet** and choose `sop-assistant`.
3. Click **Show in Explorer** (Windows) or **Reveal in Finder** (Mac).
4. Copy your SOP PDF files into the `sops` folder.
5. (Optional) Edit `sops/manifest.json` in Notepad/TextEdit to set exact titles, revisions, Google Drive links, and mark old PDFs as `"status": "superseded"`.
   - If a PDF is not listed in `sops/manifest.json`, the script automatically reads the title, revision, and date from filenames like `SOP-FTTH-Install_Rev3_2026-10.pdf`.
6. Back in GitHub Desktop, type a short summary like `Add SOP PDFs`, click **Commit to main**, then click **Push origin**.

---

## Step 5: Check the GitHub Action & Ingest Report

1. Open your repository on GitHub and click the **Actions** tab.
2. You will see a workflow run called **Ingest SOP PDFs** running automatically. Wait for it to finish (usually 1–5 minutes depending on total pages).
3. Click on the finished run to view the **Summary** — it prints the full table showing pages, chunks, headings detected, any low-text/scanned pages, and errors.
4. You can also view the saved report anytime at `data/ingest-report.md` in your repo.
5. **If it stops with a Gemini free-tier quota limit:** partial progress is saved automatically. Wait a few minutes (or until the next day if daily quota hit), open **Actions** -> **Ingest SOP PDFs**, and click **Re-run all jobs** (or **Run workflow**). It continues right where it stopped.

---

## Step 6: Deploy to Vercel (Free Hobby Plan)

1. Go to [Vercel](https://vercel.com) and click **Sign Up** -> **Continue with GitHub**.
2. Click **Add New...** -> **Project**.
3. Find `sop-assistant` and click **Import**.
4. Leave **Framework Preset** as **Vite** (Vercel reads `vercel.json` automatically).
5. Expand **Environment Variables** and add these variables one by one:

| Name | Example Value | Notes |
| --- | --- | --- |
| `GEMINI_API_KEY` | *(your AI Studio key)* | Server-only API key |
| `ACCESS_CODE` | `TelcoSOP2026` | Shared passcode technicians enter once |
| `GEMINI_MODEL` | `gemini-4-hydrogen` | Current fast Gemini Flash model |
| `EMBED_MODEL` | `gemini-embedding-2` | Must match the ingest script model |
| `MIN_SCORE` | `0.42` | Minimum match threshold (tune on `/debug`) |
| `REPORT_URL` | `mailto:sop-team@company.com?subject=SOP%20Issue` | Or `https://wa.me/9477XXXXXXX` |
| `APP_NAME` | `SOP Assistant` | Title shown in the header |

6. Click **Deploy** and wait ~1 minute.
7. Once deployed, Vercel gives you a live URL like `https://sop-assistant-xxxx.vercel.app`.

*(Note: Because `.vercelignore` excludes `/sops`, your large raw PDFs are never uploaded to Vercel — only the compact indexed chunks in `/data` are bundled.)*

---

## Step 7: Open & Install on Phones (PWA)

1. Open your Vercel URL on a phone.
2. Enter your `ACCESS_CODE` once — the phone remembers it automatically.

### iPhone (iOS Safari)
1. Open the URL in **Safari** (not Chrome or in-app browsers).
2. Tap the **Add to Home** button in the top bar (or tap Safari's **Share** icon at the bottom).
3. Scroll down and tap **Add to Home Screen**, then **Add**.

### Android (Chrome)
1. Open the URL in **Chrome**.
2. Tap the **Install App** button in the top bar (or Chrome menu **⋮** -> **Install app**).

Once installed, the last 20 Q&As remain readable offline in underground chambers or weak-signal areas.

---

## Step 8: Adding, Replacing, or Removing SOPs Later

- **Add a new SOP:** Upload the new PDF to `/sops` (and optionally add its metadata + `driveUrl` to `sops/manifest.json`). Push to GitHub. Only the new PDF is processed.
- **Replace / supersede an old SOP:**
  - Either delete the old PDF from `/sops` and upload the new revision, **or**
  - Keep the old PDF in `/sops` and set `"status": "superseded"` for it in `sops/manifest.json`. Superseded documents are automatically removed from search answers.
- **Remove an SOP:** Delete its PDF from `/sops` and push. The next Action run removes its data files from `data/docs/`.
- **Wait ~2 minutes** after the GitHub Action commits `[skip ci]` to `data/` — Vercel automatically redeploys with the updated search index.

---

## Troubleshooting

| Symptom | Cause & Fix |
| --- | --- |
| **Action says "Permission denied" pushing `data/`** | Go to GitHub **Settings -> Actions -> General -> Workflow permissions**, choose **Read and write permissions**, and Save. |
| **Report lists "Low-Text Pages (Possible Scan)"** | Those PDF pages are scanned images without selectable text. Re-export the PDF with OCR enabled before uploading. |
| **Answers say "Not covered in current SOPs" for valid questions** | Open `https://your-app.vercel.app/debug`, enter your `ACCESS_CODE`, and test the question to see the actual chunk scores. Lower `MIN_SCORE` in Vercel (e.g. from `0.42` to `0.36`) and redeploy. |
| **429 / Quota exceeded during ingest** | Free Gemini tier limits requests per minute/day. Re-run the **Ingest SOP PDFs** Action — it resumes from the last completed batch. |
| **"Server ACCESS_CODE is not configured"** | Add `ACCESS_CODE` in Vercel **Project Settings -> Environment Variables**, then redeploy. |
| **Microphone icon missing on phone** | Voice input uses the browser's Web Speech API. It works on Android Chrome and iOS Safari over HTTPS; if a browser lacks support, the mic button hides automatically. |
