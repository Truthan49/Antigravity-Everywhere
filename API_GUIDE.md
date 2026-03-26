# Antigravity API Guide

> Reverse-engineered reference for the Antigravity language server gRPC protocol and the Gateway REST API.

---

## Table of Contents

- [Connection & Authentication](#connection--authentication)
- [Gateway REST API](#gateway-rest-api)
- [gRPC Protocol Reference](#grpc-protocol-reference)
- [Step Types & Data Structures](#step-types--data-structures)
- [Pitfalls & Lessons Learned](#pitfalls--lessons-learned)

---

## Connection & Authentication

### How the Gateway Discovers Language Servers

The Antigravity desktop app spawns one `language_server` process per workspace. Each process listens on a random HTTPS port on `127.0.0.1` and requires a CSRF token for authentication.

**Discovery steps** (see `src/bridge/discovery.ts`):
1. `ps aux | grep language_server` → extract PID + `--csrf_token` from args
2. `lsof -iTCP -sTCP:LISTEN` → match PID to its TCP LISTEN port
3. `--workspace_id` arg → identifies which workspace the server manages

**Authentication** (see `src/bridge/statedb.ts`):
- The API key is stored in `~/Library/Application Support/Antigravity/User/globalStorage/state.vscdb`
- SQLite query: `SELECT value FROM ItemTable WHERE key='antigravityAuthStatus'` → JSON with `apiKey`

### Making a gRPC-Web Call

All calls use **gRPC-Web over HTTPS** with JSON encoding:

```bash
curl -k 'https://127.0.0.1:{PORT}/exa.language_server_pb.LanguageServerService/{METHOD}' \
  -H 'Content-Type: application/json' \
  -H 'connect-protocol-version: 1' \
  -H 'x-codeium-csrf-token: {CSRF_TOKEN}' \
  -d '{JSON_BODY}'
```

The `metadata` object is required in most calls:
```json
{
  "ideName": "antigravity",
  "apiKey": "YOUR_API_KEY",
  "locale": "en",
  "ideVersion": "1.20.5",
  "extensionName": "antigravity"
}
```

---

## Gateway Architecture

```
┌─────────────────────────────────────┐
│ Browser (http://localhost:3000)      │
│ Next.js App (React + shadcn/ui)     │
│   /api/* → rewrite → localhost:3001 │
│   /ws    → rewrite → localhost:3001 │
└─────────────┬───────────────────────┘
              │
┌─────────────▼───────────────────────┐
│ Express Backend (port 3001)         │
│   REST API: /api/*                  │
│   WebSocket: /ws (streams per conv) │
│   ↓ Opens StreamAgentStateUpdates   │
│   ↓ to language_server per conv     │
└─────────────┬───────────────────────┘
              │ HTTPS (Connect protocol)
┌─────────────▼───────────────────────┐
│ language_server instances           │
│ (1 per workspace, random ports)     │
│ Discovered via ps + lsof            │
└─────────────────────────────────────┘
```

- **Next.js**: `http://localhost:3000` — React frontend, rewrites API/WS to backend
- **Express**: `http://localhost:3001` — REST + WebSocket, proxies to language servers
- **WebSocket flow**: Client subscribes → backend opens `StreamAgentStateUpdates` → forward real-time updates

---

## Gateway REST API

The Gateway wraps gRPC calls into a standard REST API.

### User & System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/me` | User profile (name, email, credits) |
| GET | `/api/servers` | All discovered language_server instances |
| GET | `/api/models` | Available AI models with quota info |
| GET | `/api/workspaces` | Registered workspaces + playgrounds |
| GET | `/api/skills` | All available skills (global + workspace) |
| GET | `/api/skills/:name` | Full skill detail |
| GET | `/api/workflows` | Workflow .md files from workspace dirs |
| GET | `/api/mcp` | MCP server configuration |

### Conversations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/conversations` | List all conversations (sorted by recency) |
| POST | `/api/conversations` | Create new conversation |
| GET | `/api/conversations/:id/steps` | Get conversation steps (checkpoint) |
| POST | `/api/conversations/:id/send` | Send user message |
| POST | `/api/conversations/:id/proceed` | Approve artifact / proceed |
| POST | `/api/conversations/:id/cancel` | Stop AI generation |
| POST | `/api/conversations/:id/revert` | Revert to a specific step |
| GET | `/api/conversations/:id/revert-preview` | Preview revert outcome |

### WebSocket (backed by StreamAgentStateUpdates)

Connect to `ws://{host}/ws` for real-time step updates. The backend opens a streaming connection to `StreamAgentStateUpdates` (Connect protocol) per conversation.

```json
// Subscribe to a conversation
{ "type": "subscribe", "cascadeId": "xxx-xxx-xxx" }

// Server pushes immediately with full state, then on every change:
{ "type": "steps", "cascadeId": "xxx", "data": { "steps": [...] }, "isActive": true }

// Status-only update (no new steps, just isActive change):
{ "type": "status", "cascadeId": "xxx", "isActive": false }

// Unsubscribe
{ "type": "unsubscribe" }
```

The `isActive` flag is from `CASCADE_RUN_STATUS_IDLE/RUNNING` — the authoritative activity indicator from the language server's streaming API.

---

## gRPC Protocol Reference

Service: `exa.language_server_pb.LanguageServerService`

### StartCascade

Creates a new conversation tied to a workspace.

```json
// Request
{
  "metadata": { "ideName": "antigravity", "apiKey": "...", ... },
  "source": "CORTEX_TRAJECTORY_SOURCE_CASCADE_CLIENT",
  "workspaceUris": ["file:///path/to/workspace"]
}

// Response
{ "cascadeId": "abc123-..." }
```

### SendUserCascadeMessage

Sends a user message to an existing conversation. Also used to approve artifacts.

```json
// Normal message
{
  "cascadeId": "abc123",
  "items": [{ "text": "Your message here" }],
  "metadata": { ... },
  "cascadeConfig": {
    "plannerConfig": {
      "conversational": { "plannerMode": "CONVERSATIONAL_PLANNER_MODE_DEFAULT", "agenticMode": true },
      "toolConfig": {
        "runCommand": { "autoCommandConfig": { "autoExecutionPolicy": "CASCADE_COMMANDS_AUTO_EXECUTION_EAGER" } },
        "notifyUser": { "artifactReviewMode": "ARTIFACT_REVIEW_MODE_ALWAYS" }
      },
      "requestedModel": { "model": "MODEL_PLACEHOLDER_M26" }
    }
  }
}

// Approve artifact (proceed)
{
  "cascadeId": "abc123",
  "metadata": { ... },
  "cascadeConfig": { ... },
  "artifactComments": [{
    "artifactUri": "file:///path/to/artifact.md",
    "fullFile": {},
    "approvalStatus": "ARTIFACT_APPROVAL_STATUS_APPROVED"
  }]
}
```

### GetCascadeTrajectorySteps

Returns steps from the loaded checkpoint (.pb file). Must call `LoadTrajectory` first for cold conversations.

```json
// Request
{ "cascadeId": "abc123", "metadata": { ... } }

// Response
{
  "steps": [
    {
      "type": "CORTEX_STEP_TYPE_USER_INPUT",
      "status": "CORTEX_STEP_STATUS_DONE",
      "userInput": { "items": [{ "text": "Hello" }] }
    },
    {
      "type": "CORTEX_STEP_TYPE_PLANNER_RESPONSE",
      "status": "CORTEX_STEP_STATUS_DONE",
      "plannerResponse": {
        "response": "Raw AI response",
        "modifiedResponse": "Formatted response (preferred)"
      }
    }
  ]
}
```

### LoadTrajectory

Loads a conversation's `.pb` checkpoint file into the language server's memory. Required before `GetCascadeTrajectorySteps` for inactive conversations.

```json
{ "cascadeId": "abc123" }
```

### GetAllCascadeTrajectories

Returns summaries of all active conversations across the server. Lightweight — used for activity detection and step count tracking.

```json
// Request
{}

// Response
{
  "trajectorySummaries": {
    "abc123": {
      "summary": "Conversation title",
      "stepCount": 42,
      "workspaces": [{ "workspaceFolderAbsoluteUri": "file:///path" }]
    }
  }
}
```

### GetCascadeTrajectory

Returns the live in-memory fork (steps added since the last checkpoint flush). **Contains only the delta, NOT the full conversation.**

```json
// Request
{ "cascadeId": "abc123" }

// Response
{ "trajectory": { "steps": [ ... ] } }
```

### CancelCascadeInvocation

Cancels the currently running AI generation. **Use this, not `CancelCascadeSteps`.**

```json
{ "cascadeId": "abc123", "metadata": { ... } }
```

### RevertToCascadeStep

Rolls back the conversation to a specific step index.

```json
{
  "cascadeId": "abc123",
  "stepIndex": 5,
  "metadata": { ... },
  "overrideConfig": {
    "plannerConfig": { "requestedModel": { "model": "MODEL_PLACEHOLDER_M26" } }
  }
}
```

### GetRevertPreview

Same parameters as `RevertToCascadeStep`, but only simulates the revert and returns projected state.

### GetCascadeModelConfigData

Returns available models with quota information.

```json
// Request
{ "metadata": { ... } }

// Response
{
  "clientModelConfigs": [
    {
      "label": "Claude Sonnet 4",
      "modelOrAlias": { "model": "MODEL_PLACEHOLDER_M26" },
      "quotaInfo": { "remainingFraction": 0.85 }
    }
  ]
}
```

### GetAllSkills

Returns all registered skills (global + workspace-scoped).

```json
// Request
{}

// Response
{
  "skills": [
    {
      "name": "skill-name",
      "description": "Description...",
      "path": "/abs/path/to/SKILL.md",
      "baseDir": "/abs/path/to/skill/",
      "scope": { "globalScope": {} }
    }
  ]
}
```

### AddTrackedWorkspace

Registers a new workspace folder with the language server.

```json
{ "workspace": "/absolute/path/to/folder" }
```

### StreamAgentStateUpdates (Connect Streaming)

The primary real-time API used by the Agent Manager. Returns full conversation state initially, then pushes deltas on changes.

**Protocol**: `application/connect+json` with binary envelope: `[flags:1][length:4 BE][JSON]`

```json
// Request
{ "conversationId": "abc123", "subscriberId": "gateway-client" }

// Response (streamed)
{
  "update": {
    "status": "CASCADE_RUN_STATUS_IDLE",  // or RUNNING
    "mainTrajectoryUpdate": {
      "stepsUpdate": {
        "steps": [...],   // same format as GetCascadeTrajectorySteps
        "totalLength": 42
      }
    }
  }
}
```

> **Note**: `StreamCascadeReactiveUpdates` and `StreamCascadeSummariesReactiveUpdates` are DISABLED ("reactive state is disabled").

---

## Step Types & Data Structures

Each step has a `type`, `status`, and type-specific data payload.

### Step Types

| Type | Description | Data Field |
|------|-------------|------------|
| `CORTEX_STEP_TYPE_USER_INPUT` | User message | `userInput.items[].text` |
| `CORTEX_STEP_TYPE_PLANNER_RESPONSE` | AI response | `plannerResponse.modifiedResponse` |
| `CORTEX_STEP_TYPE_NOTIFY_USER` | Approval request | `notifyUser` (see below) |
| `CORTEX_STEP_TYPE_TASK_BOUNDARY` | Task status update | `taskBoundary` |
| `CORTEX_STEP_TYPE_TOOL_RESULT` | Tool execution result | `toolResult` |
| `CORTEX_STEP_TYPE_TOOL_CALL` | Tool invocation | `toolCall` |
| `CORTEX_STEP_TYPE_CODE_EDIT` | Code modification | `codeEdit` |
| `CORTEX_STEP_TYPE_TERMINAL_COMMAND` | Shell command | `terminalCommand` |
| `CORTEX_STEP_TYPE_FILE_SEARCH` | File search | `fileSearch` |
| `CORTEX_STEP_TYPE_CODEBASE_SEARCH` | Code search | `codebaseSearch` |
| `CORTEX_STEP_TYPE_CODE_READ` | Read file | `codeRead` |
| `CORTEX_STEP_TYPE_WEB_SEARCH` | Web search | `webSearch` |
| `CORTEX_STEP_TYPE_URL_FETCH` | URL fetch | `urlFetch` |
| `CORTEX_STEP_TYPE_EPHEMERAL_MESSAGE` | System message | (usually empty) |

### Step Statuses

| Status | Meaning |
|--------|---------|
| `CORTEX_STEP_STATUS_DONE` | Step completed |
| `CORTEX_STEP_STATUS_RUNNING` | Step in progress |
| `CORTEX_STEP_STATUS_PENDING` | Waiting to execute |
| `CORTEX_STEP_STATUS_ERROR` | Step failed |

### NotifyUser Structure

```json
{
  "notifyUser": {
    "notificationContent": "Message to the user...",
    "isBlocking": true,
    "askForUserFeedback": true,
    "pathsToReview": [
      { "uri": "file:///path/to/artifact.md" }
    ]
  }
}
```

### TaskBoundary Structure

```json
{
  "taskBoundary": {
    "taskName": "Implementing Feature X",
    "taskStatus": "Writing unit tests",
    "taskSummary": "Completed core implementation...",
    "mode": "AGENT_MODE_EXECUTION"
  }
}
```

---

## Pitfalls & Lessons Learned

### ❌ Don't poll checkpoint for real-time updates

Phase 2 used 3s `setInterval` polling `GetCascadeTrajectorySteps`. This caused:
- Checkpoint lag (new steps invisible until flush)
- Multi-server inconsistency (different servers return different step counts)
- Stop button flicker (isActive oscillated)

**✅ Use `StreamAgentStateUpdates`** — the streaming API used by the Agent Manager. Pushes real-time state changes with authoritative `CASCADE_RUN_STATUS_IDLE/RUNNING`.

### ❌ Don't use position-based checks for Proceed button

`originalIndex >= totalSteps - 2` is too loose. NOTIFY_USER can appear mid-conversation (e.g., during PLANNING), not just at the end. And ephemeral/system steps may follow it.

**✅ Check if any `USER_INPUT` step exists after the `NOTIFY_USER` step.** If yes → user already responded → hide buttons. If no → still waiting → show buttons.

### ❌ Don't use `step.status` for Proceed button visibility

A `NOTIFY_USER` step's status resolves to `DONE` almost immediately, long before the user responds.

**✅ Check `isBlocking` + subsequent USER_INPUT**, not status.

### ⚠️ Monotonic guard still important

Step count can stay the same while the last step transitions from RUNNING → DONE.

**✅ Compare both step count AND last step status.** Apply a monotonic guard (never accept updates with fewer steps than currently displayed).

### ⚠️ `CancelCascadeSteps` vs `CancelCascadeInvocation`

The correct method is **`CancelCascadeInvocation`**, not `CancelCascadeSteps`. After cancelling, force-reload steps after ~500ms to update the UI.

### ⚠️ Model identifiers

Model strings like `MODEL_PLACEHOLDER_M26` are internal names. Use `GetCascadeModelConfigData` to get the actual available models and their display labels.
