# Voice AI

A production-style voice AI platform for building, orchestrating and running conversational voice agents.

This platform enables users to create configurable voice agents, automatically provision voice assistants, run realtime conversations, orchestrate multi-stage flows, manage memory, execute tools, and build advanced conversational workflows.

---

# Overview

Prakati is designed as a full voice AI platform rather than a simple chatbot application.

Users can:

* Create configurable voice agents
* Automatically provision assistants
* Run realtime voice conversations
* Build multi-stage prompt orchestration workflows
* Add memory and context injection
* Execute tools and webhook integrations
* Store conversations and transcripts
* Create production-style conversational pipelines

---

# Tech Stack

## Frontend

* React
* Vite
* React Router
* Dark Dashboard UI
* React Flow (Prompt Orchestration UI)

## Backend

* Node.js
* Express
* CommonJS Architecture

## Database

* PostgreSQL
* Prisma ORM

## Voice Stack

* Vapi
* Deepgram
* OpenAI Voices
* ElevenLabs Voices

---

# Architecture

```text
Agent Configuration

↓

Prompt Layers

↓

Prompt Orchestration Engine

↓

Memory Layer

↓

Tool Layer

↓

Conversation Context

↓

Runtime Context Injection

↓

Voice Runtime
```

---

# Project Structure

```text
prakati/

├── frontend/
│
│   ├── src/
│   │
│   ├── components/
│   │   ├── AgentCard.jsx
│   │   ├── FlowDefinitionEditor.jsx
│   │   ├── Layout.jsx
│   │   ├── MessageBubble.jsx
│   │   └── NotificationToast.jsx
│   │
│   ├── pages/
│   │   ├── Dashboard.jsx
│   │   ├── AgentsList.jsx
│   │   ├── AgentDetail.jsx
│   │   ├── CreateAgent.jsx
│   │   ├── TalkToAgent.jsx
│   │   ├── ConversationHistory.jsx
│   │   └── ConversationDetail.jsx
│
├── backend/
│
│   ├── controllers/
│   ├── routes/
│   ├── services/
│   │
│   │   ├── agentService.js
│   │   ├── callStateStore.js
│   │   ├── conditionEvaluator.js
│   │   ├── contextService.js
│   │   ├── conversationService.js
│   │   ├── memoryService.js
│   │   ├── orchestrationService.js
│   │   ├── orchestrationSchema.js
│   │   ├── promptService.js
│   │   ├── notificationService.js
│   │   ├── toolExecutor.js
│   │   ├── toolRegistry.js
│   │   └── toolRouter.js
│
│   └── server.js
│
├── prisma/
│
└── frontend/
```

---

# Core Features

## Agent Management

* Create Agents
* Edit Agents
* Delete Agents
* Agent Dashboard
* Dynamic Routing
* Voice Provider Selection

## Voice Features

* Realtime Voice Calls
* Live Transcript UI
* Conversation Completion UI
* Automatic Assistant Provisioning
* Assistant Storage
* Voice Provider Integration

## Prompt Orchestration

* Multi Stage Flows
* Stage Based Conversation Management
* Dynamic Stage Advancement
* Flow Builder UI
* Runtime Prompt Injection

## Memory System

* Conversation State Store
* Transcript Storage
* Runtime Context Injection
* Collected Data Persistence During Calls

## Tool Calling

* Tool Registry
* Tool Router
* Webhook Execution
* Structured Tool Payloads
* Lead Collection Workflow
* Lead Notifications (Slack / Email) via a chained second tool

---

# Runtime Flow

```text
User Speaks

↓

Transcript Generated

↓

Conversation State Updated

↓

Memory Extraction

↓

Prompt Compilation

↓

Stage Evaluation

↓

Tool Detection

↓

Webhook Execution (Optional)

↓

Assistant Response

↓

Next Stage Evaluation
```

---

# Example Lead Collection Flow

```text
User:

"My name is John"

↓

Memory Stores:

name=John

↓

User:

"Company is Google"

↓

Memory Stores:

company=Google

↓

User:

"john at gmail dot com"

↓

Extracted:

john@gmail.com

↓

User:

"Save this lead"

↓

Tool Router Detects Tool

↓

Webhook Executes With:

{

 name:"John",

 company:"Google",

 email:"john@gmail.com"

}
```

---

# Lead Notifications (Slack / Email)

When a lead is saved, Prakati runs a second tool, `notify_lead`, which alerts your team.

```text
"Save this lead"  →  send_lead (webhook)  →  notify_lead  →  Slack and/or Email
```

* `notify_lead` only runs if `send_lead` succeeded.
* Slack and email are independent. A failure in one never blocks the other or the lead save.
* Each channel turns on automatically when its env vars are set. Use `NOTIFY_CHANNELS` to restrict.
* Lead data is escaped before it goes into Slack or HTML email.

**Slack:** create an [Incoming Webhook](https://api.slack.com/messaging/webhooks) and set `SLACK_WEBHOOK_URL`.

**Email:** set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` and `NOTIFY_EMAIL_TO` (any SMTP provider works).

Run the tests with `cd backend && npm test`.

---

# Environment Variables

Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env`, then fill in the values.

## Backend

```env
DATABASE_URL=

VAPI_API_KEY=

GROQ_API_KEY=

OPENAI_API_KEY=

DEEPGRAM_API_KEY=

VAPI_WEBHOOK_SECRET=

SLACK_WEBHOOK_URL=

SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
NOTIFY_EMAIL_TO=
```

## Frontend

```env
VITE_VAPI_PUBLIC_KEY=
```

---

# Installation

## Clone Repository

```bash
git clone <repo-url>

cd prakati
```

## Backend Setup

```bash
cd backend

npm install

npx prisma generate

npx prisma migrate dev

npm run dev
```

Backend:

```text
localhost:3001
```

## Frontend Setup

```bash
cd frontend

npm install

npm run dev
```

Frontend:

```text
localhost:5173
```

---

# Deployment (AWS + Jenkins)

The repo includes Docker, Caddy (automatic HTTPS) and a Jenkins pipeline. A push to `main` is tested, built and deployed to a single AWS EC2 server. See [DEPLOYMENT.md](DEPLOYMENT.md) for the step-by-step guide and [CHANGES.md](CHANGES.md) for what changed.

```text
git push → Jenkins → test → build images → deploy → smoke test
```

---

# Current Capabilities

* Realtime Voice Conversations
* Multi Layer Prompting
* Prompt Orchestration
* Memory Systems
* Runtime Context Injection
* Conversation Context
* Tool Calling Framework
* Webhook Integrations
* Structured Data Extraction
* Sales Workflow Automation

---

# Roadmap

## Next Steps

* CRM Integrations
* More notification channels (SMS, Teams)
* RAG / Document Uploads
* Analytics Dashboard
* Authentication
* Multi User Support
* Production Deployment
* Scaling Infrastructure

---

# Vision

Build a production-style voice AI platform capable of supporting sophisticated conversational systems with orchestration, memory, tools, context injection, and realtime voice interactions.

The objective is not simply voice chat.

The objective is orchestration.

## Continuous Integration

This project uses Jenkins to validate backend and frontend Docker builds.
The local CI pipeline does not deploy or restart the application.
