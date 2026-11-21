# Alif Quran

Quran reading, Mushaf pages, audio playback, memorization practice, and Recite Along.

## Run the local preview (PowerShell)

Requires Node.js and npm.

```powershell
cd frontend
npm install --legacy-peer-deps
npm run build
cd ..
node .\preview-server.cjs
```

Open http://localhost:4174. The preview uses online Quran APIs and provides local account/progress storage. It is a development preview, not a production authentication service. Some backend features depend on the configured upstream service.

For phone access, in another PowerShell window:

```powershell
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://127.0.0.1:4174 --no-autoupdate
```

Keep the computer awake and both processes running. The tunnel URL changes between sessions.

## Checks

From frontend, run `npm run test:recitation`, `npm run test:along`, `npm run test:playback`, and `npm run build`.

## Full backend

The FastAPI backend is included in backend/. It requires MongoDB, environment configuration (MONGO_URL, DB_NAME, and provider credentials for speech/AI features), and the dependencies in backend/requirements.txt, including emergentintegrations. No credentials or personal account/progress data are included. Set REACT_APP_BACKEND_URL when building the frontend to target your own backend.

This repository starts with a fresh Git history containing the current application source.
