# Friday Fusion

Friday Fusion is a realtime web app for team sessions with mini-games:
- Hangman
- Two Truths and a Lie
- Trivia

## Local development

Requirements:
- Node.js 20 recommended (Node 16 works for core scripts in this repo)

Install and run:

```bash
npm install
npm run dev
```

Web app: `http://localhost:5173`  
API/WebSocket server: `http://localhost:3000`

## Tests and build

```bash
npm run lint
npm test
npm run build
```

## Persistence

Session state is written to `DATA_DIR/sessions.json` (default `./data/sessions.json`).
Stale sessions are cleaned up automatically after 24 hours.

## Fly.io deploy

1. Create app and volume:
   ```bash
   flyctl launch --no-deploy
   flyctl volumes create fusion_data --size 1 --region ord
   ```
2. Deploy:
   ```bash
   flyctl deploy
   ```

The app uses one running machine and a mounted `/data` volume for persistence.
