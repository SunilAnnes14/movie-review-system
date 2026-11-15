# Deploying MoviQ

MoviQ is deployed as three pieces:

| Piece | Host | Why |
|---|---|---|
| Frontend (Angular) | **Vercel** | Static site + SPA routing, global CDN |
| Backend (Express + Socket.IO) | **Render** (free web service) | Needs a long-running server for live chat, the poll/reminder scheduler and uploads, which Vercel's serverless functions can't provide |
| Database | **MongoDB Atlas** (free M0) | Managed MongoDB reachable from Render |

The repository already contains the configuration: `render.yaml` (backend) and `frontend/movie-review-frontend/vercel.json` (frontend). Follow the steps **in this order**: the frontend needs the backend URL at build time, and the backend needs the frontend URL for CORS.

This setup was verified locally by simulating it: a clean `npm ci --omit=dev` backend with production settings, and the production frontend build served statically. Login, live chat across the two origins, CORS, proxy-aware rate limiting and rejection of old development tokens all passed (13/13).

---

## 1. Database: MongoDB Atlas (≈5 min)
1. Create a free account at https://www.mongodb.com/cloud/atlas and create an **M0 (free)** cluster.
2. **Database Access** → add a database user with a strong password.
3. **Network Access** → *Add IP Address* → **Allow access from anywhere** (`0.0.0.0/0`). Render's outbound IPs change, so this is required on the free tier; the database user's password still protects it.
4. **Connect** → *Drivers* → copy the connection string and add a database name before the `?`:
   `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/moviq?retryWrites=true&w=majority`
5. **Load the catalog and demo community** (run once, from your PC, in `backend/`). Keep the string out of files and chat:
   ```bash
   # Git Bash
   MONGO_URI="mongodb+srv://...your string.../moviq?retryWrites=true&w=majority" npm run seed
   ```
   ```powershell
   # PowerShell
   $env:MONGO_URI="mongodb+srv://...your string..."; npm run seed; Remove-Item Env:MONGO_URI
   ```
   This creates the movies (including the IMDb top and Tamil additions) and the demo accounts. **Change or delete the demo accounts afterwards if the site is public**; their passwords are in the README.

## 2. Backend: Render (≈5 min)
1. Sign in at https://render.com with GitHub.
2. **New +** → **Blueprint** → select `SunilAnnes14/movie-review-system`. Render reads `render.yaml` and proposes the `moviq-api` service.
3. Fill in the values it asks for:
   - `MONGO_URI`: the Atlas string from step 1.
   - `CLIENT_URL`: put `https://placeholder.vercel.app` for now; you'll replace it in step 4.
   - `TMDB_READ_TOKEN`, `ANTHROPIC_API_KEY`: optional; leave empty to use the local catalog and local AI models.
   - `JWT_SECRET` is **generated automatically**. Don't reuse the development secret (it appears in this repo's history).
4. **Apply**. When the deploy finishes, open `https://moviq-api.onrender.com/api/health` (your service URL may differ). It should return `{"status":"OK","message":"MoviQ API is running"}`.

## 3. Frontend: Vercel (≈3 min)
1. Sign in at https://vercel.com with GitHub → **Add New…** → **Project** → import `SunilAnnes14/movie-review-system`.
2. **Root Directory** → `frontend/movie-review-frontend` (important).
3. **Environment Variables** → add `MOVIQ_API_URL` = your Render URL, e.g. `https://moviq-api.onrender.com`. `/api` is added automatically.
4. **Deploy**. Build, install and output settings come from `vercel.json`; no changes needed.
5. Note your site URL, e.g. `https://movie-review-system-xyz.vercel.app`.

## 4. Connect them
1. In Render → `moviq-api` → **Environment** → set `CLIENT_URL` to your exact Vercel URL (no trailing slash) → **Save** (Render redeploys).
   - Several frontends (e.g. a custom domain too)? Use `CORS_ORIGINS` with comma-separated URLs instead.
2. Open your Vercel URL and sign in. Check the browser console shows no CORS errors.

## Updating
Push to `main`: Vercel and Render both redeploy automatically.

## Free-tier behaviour to know about
- **Render free instances sleep after ~15 minutes idle.** The first request after that takes ~30–60 s to wake the server. Chat reconnects automatically. A paid instance avoids this.
- **Uploaded images are not permanent on Render's free tier**: the disk is reset on each deploy or restart. Image URLs pasted as links are unaffected. For durable uploads, attach a Render persistent disk (paid) and set `UPLOAD_DIR` to its mount path, or move uploads to object storage.
- Vercel **preview deployments** get different URLs that aren't in `CLIENT_URL`, so they can't call the API unless you add them to `CORS_ORIGINS`.

## Troubleshooting
| Symptom | Fix |
|---|---|
| Site shows "Cannot reach the MoviQ server" | `MOVIQ_API_URL` missing or wrong in Vercel → fix it and **redeploy** (it's applied at build time). Or the Render service is asleep or failing: check `/api/health`. |
| Browser console: CORS error | `CLIENT_URL` in Render doesn't exactly match the Vercel URL (https, no trailing slash). |
| Render deploy fails on MongoDB | Check `MONGO_URI`, the Atlas user/password, and that Network Access allows `0.0.0.0/0`. |
| Everyone gets logged out after a deploy | Expected only if `JWT_SECRET` changed. Keep the generated value. |
