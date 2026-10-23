# Deploying Prakati on AWS with Jenkins CI/CD

Everything in this repo is ready for a single AWS server. You do not need RDS, S3 or CloudFront.
One EC2 instance runs the whole thing with Docker, and Jenkins redeploys it every time you push to GitHub.

```
 you ──git push──▶ GitHub ◀──polls every ~2 min── Jenkins (container on the server)
                                                      │ test → build → deploy → smoke test
                                                      ▼
 browser ──HTTPS──▶  Caddy (web container) ──/api, /webhooks, /health──▶ backend ──▶ PostgreSQL
                     serves React app,                                     │
                     free Let's Encrypt cert                               └──▶ Vapi, Groq, Slack, Gmail
 Vapi ──HTTPS POST──▶ /webhooks/vapi
```

## 1. Is it free?

- New AWS accounts (created after 15 July 2025) get a Free Plan with credits that pay for EC2. It lasts up to 6 months or until the credits run out. Check Billing → Credits for your exact amount. Older accounts have the legacy 12-month free tier instead. AWS changes these terms, so confirm on the AWS Free Tier page.
- This design keeps credit use low: one server, PostgreSQL in a container (no RDS), no CloudFront, no load balancer.
- Rough cost from credits: a `t3.small` is about $15 a month, plus disk and a public IPv4 address (AWS charges for these). Expect roughly $20 a month. These are estimates, so watch the Billing page in your first week.
- Set a budget alert before you launch anything. Billing → Budgets → create a $5 budget.
- When you are done (after recording your demo and screenshots), terminate the instance, release the Elastic IP and delete the volume. See section 8.

**If you cannot use AWS credits** (older account, no card, or after the 6 months), the same repo runs unchanged on any Linux server with Docker:
- Oracle Cloud "Always Free" VMs (check current terms and availability in your region).
- A spare laptop or Raspberry Pi at home, exposed with a free tunnel such as Cloudflare Tunnel.
- Any cheap VPS. Skip Part 4 and use `bash deploy/deploy.sh`.

## 2. What you need before starting

| Item | Where |
|---|---|
| AWS account (with a budget alert set) | aws.amazon.com |
| This repo pushed to your own GitHub repo | github.com |
| A free domain name | duckdns.org (sign in, create e.g. `prakati-yourname.duckdns.org`) |
| Vapi private key and public key | dashboard.vapi.ai |
| Groq API key | console.groq.com |
| Optional: Slack webhook URL, Gmail App Password | see README |

## 3. Launch the server (EC2)

1. Region: pick one near you (for example Mumbai, `ap-south-1`).
2. EC2 → Launch instance.
   - Image: Ubuntu Server 24.04 LTS.
   - Type: `t3.small` (2 GB RAM). If the console says it is not covered by your plan, use `t3.micro`. It also works because the bootstrap script adds swap, but builds are slower.
   - Key pair: create one and download the `.pem` file.
   - Storage: 20 to 30 GB gp3.
3. Security group, inbound rules:
   - SSH (22) from **My IP** only
   - HTTP (80) from anywhere
   - HTTPS (443) from anywhere
   - Do **not** open 8080. Jenkins is reached through an SSH tunnel.
4. Allocate an **Elastic IP** and associate it with the instance, so the address survives restarts.
5. On duckdns.org set your domain's IP to the Elastic IP.

## 4. Set up the server (about 10 minutes)

```bash
ssh -i your-key.pem ubuntu@YOUR_ELASTIC_IP
git clone https://github.com/YOU/prakati.git
cd prakati
sudo bash deploy/ec2-bootstrap.sh
```

The script installs Docker, adds swap, creates `/opt/prakati/.env` (database password generated for you), creates `jenkins/.env`, and starts Jenkins. It prints the Jenkins admin password. Save it.

Log out and back in once, then fill in your secrets:

```bash
nano /opt/prakati/.env
```

Set at least `DOMAIN`, `VAPI_API_KEY`, `VITE_VAPI_PUBLIC_KEY` and `GROQ_API_KEY`.

First deploy:

```bash
cd ~/prakati
bash deploy/deploy.sh
```

Open `https://YOUR_DOMAIN`. The first load can take a minute while Caddy gets the certificate.

Private repo? Edit `jenkins/.env`, set `GITHUB_USER` and `GITHUB_TOKEN` (a personal access token with read access), and make sure `REPO_URL` is the `https://` address. Then run `docker compose -f jenkins/docker-compose.yml --env-file jenkins/.env up -d --build` in `~/prakati`.

## 5. Connect Vapi to your server

Vapi must be able to reach your backend. In the Vapi dashboard set the **Server URL** to:

```
https://YOUR_DOMAIN/webhooks/vapi
```

Recommended: set a "Server URL Secret" in Vapi and put the same value in `VAPI_WEBHOOK_SECRET` in `/opt/prakati/.env`. The backend then rejects fake webhook calls. After editing the env file, run `bash deploy/deploy.sh` again.

## 6. Use Jenkins

From your laptop, open a tunnel:

```bash
ssh -i your-key.pem -L 8080:localhost:8080 ubuntu@YOUR_ELASTIC_IP
```

Then browse to http://localhost:8080 and log in as `admin` with the password from `jenkins/.env`.

You will find a job called **prakati**, created automatically. Click **Build Now** once to try it. After that:

- You `git push` to `main`.
- Within about 2 minutes Jenkins notices the commit and runs the pipeline in `Jenkinsfile`:
  1. **Preflight**: checks Docker and the env file.
  2. **Backend tests**: builds the `test` stage of `backend/Dockerfile` (runs `npm test`).
  3. **Build images**: builds backend and web (the web build runs `npm run build`).
  4. **Deploy**: `docker compose up -d` (database migrations run on backend start).
  5. **Smoke test**: waits for the backend health check and calls `https://DOMAIN/health`.
- If any stage fails, nothing new is deployed and the old version keeps running.

## 7. Everyday commands

```bash
docker ps                              # what is running
docker logs -f prakati-backend         # API logs
docker logs -f prakati-web             # Caddy / HTTPS logs
bash deploy/deploy.sh                  # redeploy by hand
bash deploy/backup.sh                  # database backup to /opt/prakati/backups
docker compose -f jenkins/docker-compose.yml --env-file jenkins/.env up -d --build   # after changing jenkins/ files
```

Backup every night: `crontab -e` and add `0 3 * * * /home/ubuntu/prakati/deploy/backup.sh`.
Copy backups off the server occasionally (for example to an S3 bucket), because the disk is deleted when you terminate the instance.

## 8. Stop paying (teardown)

1. EC2 → terminate the instance.
2. EC2 → Elastic IPs → release the address.
3. EC2 → Volumes → delete anything left over.
4. Check Billing the next day.

## 9. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Site does not load over HTTPS | DNS not pointing to the Elastic IP yet, or ports 80/443 closed. Check `docker logs prakati-web`. |
| Browser CORS error | `DOMAIN` in `/opt/prakati/.env` does not match the address you are visiting. Redeploy. |
| Frontend calls the old or wrong API URL | `VITE_*` values are baked in at build time. Change `.env`, then redeploy (it rebuilds). |
| Backend keeps restarting | `docker logs prakati-backend`. Usually a wrong `POSTGRES_PASSWORD` after the first run (the database keeps the first password), or a missing secret. |
| Jenkins says "permission denied" on docker | `DOCKER_GID` in `jenkins/.env` is wrong. Fix it (`getent group docker`) and restart Jenkins. |
| Jenkins build cannot clone | Private repo without a token, or `REPO_URL` is an `ssh` address. Use the `https` address. |
| Build killed or very slow | Out of memory. Use `t3.small`, and confirm swap with `free -h`. |
| Leads do not trigger Slack or email | Check `SLACK_WEBHOOK_URL` or the `SMTP_*` values and `NOTIFY_EMAIL_TO`, then read `docker logs prakati-backend`. |
| Mic does not work | The site must be on HTTPS. Do not test over plain HTTP. |

## 10. Security notes (good interview material)

- Secrets live only in `/opt/prakati/.env` on the server (mode 600). They are never in Git, in the images or in the Jenkins UI.
- The database has no published port. Only the backend container can reach it.
- Jenkins listens on localhost only and is reached through SSH. It has a login and no anonymous access.
- Jenkins can use the host's Docker socket. That is effectively root on the server, which is acceptable for a personal project but not for a shared team. A production setup would use separate build agents.
- Webhooks can be protected with `VAPI_WEBHOOK_SECRET`.
- Caddy handles HTTPS certificates and renewal automatically.

## 11. Local test without AWS

```bash
cp .env.example .env     # keep DOMAIN=localhost, set a POSTGRES_PASSWORD
ENV_FILE=.env bash deploy/deploy.sh
```

Then open https://localhost (accept the self-signed certificate warning).
