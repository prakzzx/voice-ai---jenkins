# What was added or changed for deployment

## New files
- `Jenkinsfile`: the CI/CD pipeline
- `jenkins/`: Jenkins image, plugins, configuration-as-code and compose file
- `docker-compose.yml`: PostgreSQL + backend + web (Caddy)
- `backend/Dockerfile`, `backend/docker-entrypoint.sh`, `backend/.dockerignore`
- `frontend/Dockerfile`, `frontend/Caddyfile`, `frontend/.dockerignore`
- `deploy/ec2-bootstrap.sh`, `deploy/deploy.sh`, `deploy/backup.sh`
- `backend/middleware/webhookAuth.js` and `backend/test/webhookAuth.test.js`
- `.env.example`, `.gitattributes`, `DEPLOYMENT.md`, this file

## Changes to existing code (backend/server.js)
1. **`notify_lead` is now registered.** It was only registered inside the tests, so Slack and email alerts never fired in a real run.
2. **`send_lead` URL is no longer hard-coded** to `http://localhost:3001`. It uses `LEAD_WEBHOOK_URL` if set, otherwise this server on its own `PORT`.
3. **`/api/lead` moved after `express.json()`.** Before, it ran ahead of the body parser, so the lead payload arrived as `undefined`. It now also accepts requests only from the server itself.
4. **`/webhooks` is protected by an optional shared secret** (`VAPI_WEBHOOK_SECRET`). If the variable is not set, behaviour is unchanged.
5. **`trust proxy` is enabled** because the API now runs behind Caddy.

## .gitignore
Now also ignores every `.env.*` file except `.env.example`, and `jenkins/.env`.

## Not changed, but worth knowing
- The frontend `npm run lint` script cannot run: ESLint and its plugins are missing from `devDependencies`. The pipeline skips lint for that reason.
- The code reads `GROQ_API_KEY` (memory extraction, stage conditions, and the Vapi model). `OPENAI_API_KEY` and `DEEPGRAM_API_KEY` are not read by the backend code. The README lists OpenAI as the model provider, but the default model provider in `vapiService.js` is Groq (`llama3-70b-8192`). That model name may have been retired by Groq, so check Groq's current model list and set `LLM_MODEL` in the env file if needed.
- `npm test` passes (12 tests). I could not run Docker in my environment, so the Docker, Caddy and Jenkins files were checked for syntax but not run end to end. Expect to fix small things on your first deploy, and use the troubleshooting table.
