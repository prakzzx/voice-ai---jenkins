

\# Jenkins CI Setup — Voice AI Platform



\## 1. Project Overview



This project uses Jenkins for Continuous Integration (CI) of the Voice AI Platform.



\*\*GitHub Repository:\*\* https://github.com/prakzzx/voice-ai---jenkins  

\*\*Branch:\*\* main  

\*\*Jenkins URL:\*\* http://localhost:8080  

\*\*Jenkins Job:\*\* prakati  

\*\*Environment:\*\* Windows, Docker Desktop, Jenkins container



\## 2. Architecture



Developer

&#x20;  |

&#x20;  v

Git commit and push

&#x20;  |

&#x20;  v

GitHub Repository (main)

&#x20;  |

&#x20;  v

Jenkins SCM Polling

&#x20;  |

&#x20;  v

Jenkins Pipeline

&#x20;  |

&#x20;  +--> Preflight: Check Docker connectivity

&#x20;  |

&#x20;  +--> Backend tests: Build backend test target

&#x20;  |

&#x20;  +--> Frontend build: Build frontend Docker image

&#x20;  |

&#x20;  v

CI Success or Failure



\## 3. Jenkins Configuration



\- Jenkins runs locally in Docker Desktop.

\- Jenkins dashboard is bound to 127.0.0.1:8080.

\- Jenkins uses Pipeline script from SCM.

\- Repository: https://github.com/prakzzx/voice-ai---jenkins.git

\- Branch specifier: \*/main

\- Script path: Jenkinsfile

\- Jenkins checks SCM changes approximately every two minutes.

\- Jenkins has access to the Docker daemon through the mounted Docker socket.



\## 4. Pipeline Stages



\### Preflight

Checks Docker connectivity using `docker version`.



\### Backend tests

Builds the backend test target:



`docker build --target test -t prakati-backend-test:$BUILD\_NUMBER backend`



\### Frontend build

Builds the frontend image:



`docker build -t prakati-frontend-ci:$BUILD\_NUMBER frontend`



\### Deployment

The local CI pipeline does not deploy or restart the application.



\## 5. Successful Build



\- Jenkins job: prakati

\- Git commit: 5fb6f91 — Use safe local CI pipeline

\- Result: SUCCESS

\- Docker connectivity: Verified

\- Backend test-target build: Passed

\- Frontend image build: Passed

\- Application deployment: Not performed



Note: Successful image builds do not independently establish that every application feature works correctly in production.



\## 6. Important Files



\- `Jenkinsfile` — Local CI pipeline

\- `Jenkinsfile.ec2-backup` — Backup of the earlier deployment pipeline

\- `jenkins/Dockerfile` — Custom Jenkins image

\- `jenkins/casc.yaml` — Jenkins configuration as code

\- `jenkins/plugins.txt` — Jenkins plugin list

\- `jenkins/docker-compose.yml` — Original deployment-oriented Jenkins configuration

\- `jenkins/docker-compose.local.yml` — Local Jenkins configuration

\- `jenkins/.env` — Local Jenkins configuration secrets; never commit this file



\## 7. Security and Safety



\- The local Jenkins dashboard is bound to localhost.

\- Never commit passwords, API keys, tokens, or `.env` files.

\- The local pipeline must remain separate from the AWS deployment pipeline.

\- Do not run the EC2 deployment pipeline locally.

\- Review pipeline changes before triggering builds.



\## 8. Future AWS EC2 Plan



When AWS EC2 access becomes available:



1\. Verify AWS account access and billing status.

2\. Check EC2 free-tier or promotional eligibility and current pricing.

3\. Launch and secure an EC2 instance if the cost is acceptable.

4\. Install and configure Jenkins or a separate deployment runner.

5\. Configure deployment credentials securely.

6\. Create a separate AWS deployment pipeline.

7\. Test deployment and application health.

8\. Configure AWS billing alerts and shut down resources when not needed.



The AWS deployment pipeline will be separate from the local CI pipeline.





## Slack build notifications

1. Install/rebuild Jenkins with the `slack` plugin listed in `jenkins/plugins.txt`.
2. In Slack API app settings, install the app to your workspace and copy the Bot User OAuth Token (`xoxb-...`). Do not put it in Git or chat.
3. Invite the app/bot to `#voice-ai-notifications` using `/invite @Voice AI Notifications` in that channel.
4. In Jenkins, open **Manage Jenkins → System → Slack**. Configure the workspace/team subdomain, choose/add a Jenkins **Secret text** credential containing the bot token, set the default channel to `#voice-ai-notifications`, and test the connection.
5. Set `SLACK_CHANNEL=#voice-ai-notifications` in `jenkins/.env` if needed and recreate/rebuild Jenkins only after backing up Jenkins home. The Jenkinsfile sends Slack notifications for both success and failure; no deployment notifications are sent.

## Voice AI Slack notifications and tool webhooks

- Add `SLACK_WEBHOOK_URL` to the backend runtime environment using a Slack Incoming Webhook configured for `#voice-ai-notifications`. This is separate from the bot token used by Jenkins.
- The Vapi `call-ended` / `end-of-call-report` event triggers a chat-completed Slack message after the conversation is saved.
- Existing registered tools use a registry/router/executor. The `slack_message` tool can send an explicit mid-call alert when the router detects a supported alert phrase.
- `POST /webhooks/tools` invokes only server-registered tools. Send `x-tool-webhook-secret` matching `TOOL_WEBHOOK_SECRET` (or `VAPI_WEBHOOK_SECRET` fallback). Configure a long random secret in the backend runtime environment. Never accept a URL/destination from the request body.
- For production, set `VAPI_WEBHOOK_SECRET` and `TOOL_WEBHOOK_SECRET`; requests are rejected if the secrets are absent while `NODE_ENV=production`.
- Chat-completion alerts include the conversation ID, agent name, duration when provided, and summary when present. Avoid putting sensitive transcript contents in Slack.
