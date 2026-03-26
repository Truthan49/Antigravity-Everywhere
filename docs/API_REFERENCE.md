# Antigravity Language Server gRPC API Reference

Reverse-engineered from `language_server_macos_arm`. **Last updated: 2026-03-18**.

## Service: `exa.language_server_pb.LanguageServerService`

### Core Conversation APIs
| Method | Description | Tested |
|--------|-------------|--------|
| `StartCascade` | Create new conversation | ✅ |
| `SendUserCascadeMessage` | Send message / approve artifacts | ✅ |
| `GetCascadeTrajectorySteps` | Get checkpoint steps | ✅ |
| `CancelCascadeInvocation` | Stop AI generation | ✅ |
| `RevertToCascadeStep` | Revert to step | ✅ |
| `GetRevertPreview` | Preview revert outcome | ✅ |
| `GetCascadeTrajectory` | Get live fork (delta only) | ✅ |
| `LoadTrajectory` | Load `.pb` checkpoint into memory | ✅ |
| `GetAllCascadeTrajectories` | Trajectory summaries (stepCount, workspace) | ✅ |
| `GetUserTrajectoryDescriptions` | List all trajectories | ✅ |
| `UpdateConversationAnnotations` | Update annotations (e.g. `lastUserViewTime`) | ✅ |

#### The Correct Conversation Creation Flow
To ensure Agent Manager and language servers correctly track new conversations, follow this exact sequence:
1. **`AddTrackedWorkspace`** (Optional but recommended): If creating a conversation in a folder that doesn't have an active IDE window open, call this first to force a fallback server to track the folder.
2. **`StartCascade`**: Creates the conversation `cascadeId`.
3. **`UpdateConversationAnnotations`**: IMMEDIATELY call this with `{"lastUserViewTime": "<current_iso_time>"}`. Without this, Agent Manager will treat 0-step conversations as "ghosts" and filter them out of lists.

### Streaming APIs (Connect protocol, `application/connect+json`)

| Method | Status | Description |
|--------|--------|-------------|
| **`StreamAgentStateUpdates`** | ✅ **Primary** | Real-time full state for one conversation |
| `StreamCascadeReactiveUpdates` | ❌ Disabled | `"reactive state is disabled"` |
| `StreamCascadeSummariesReactiveUpdates` | ❌ Disabled | `"reactive state is disabled"` |
| `StreamCascadePanelReactiveUpdates` | ❓ | Panel state |
| `StreamUserTrajectoryReactiveUpdates` | ❓ | Trajectory changes |

#### StreamAgentStateUpdates — Full Details

**Protocol**: Connect streaming (NOT regular JSON). Binary envelope:
```
[1 byte flags=0x00] [4 bytes big-endian uint32 length] [JSON payload]
```

**Request**: `POST /exa.language_server_pb.LanguageServerService/StreamAgentStateUpdates`
```
Content-Type: application/connect+json
Connect-Protocol-Version: 1
x-codeium-csrf-token: {csrf}
```
```json
{ "conversationId": "uuid", "subscriberId": "unique-id" }
```

**Response** (~191KB initial for typical conversation, then deltas):
```
update/
  conversationId         ← UUID
  trajectoryId           ← UUID
  status                 ← CASCADE_RUN_STATUS_IDLE | CASCADE_RUN_STATUS_RUNNING
  executableStatus       ← same enum
  executorLoopStatus     ← same enum
  mainTrajectoryUpdate/
    stepsUpdate/
      indices[]          ← step index array
      steps[]            ← full step objects (same format as GetCascadeTrajectorySteps)
      totalLength        ← total step count
    generatorMetadatasUpdate/
    executorMetadatasUpdate/
    trajectoryType       ← CORTEX_TRAJECTORY_TYPE_CASCADE
    metadata/
      workspaces[]       ← workspace info
      workspaceUris[]    ← workspace URIs
      createdAt          ← ISO timestamp
```

**Key statuses**:
- `CASCADE_RUN_STATUS_IDLE` → AI finished → hide Stop button
- `CASCADE_RUN_STATUS_RUNNING` → AI working → show Stop button

#### UpdateConversationAnnotations

Standard JSON call (not streaming):
```json
{
  "cascadeId": "uuid",
  "annotations": { "lastUserViewTime": "2026-03-18T08:49:19.892Z" },
  "mergeAnnotations": true
}
```

### Skills & Customization
| Method | Description | Tested |
|--------|-------------|--------|
| `GetAllSkills` | All skills (global + workspace) | ✅ |
| `ListCustomizationPathsByFile` | Customization paths | ❓ |
| `UpdateCustomization` | Update customization | ❓ |

### User & Status
| Method | Description | Tested |
|--------|-------------|--------|
| `GetUserStatus` | Profile & plan info | ✅ |
| `GetProfileData` | Base64 avatar | ✅ |
| `GetCascadeModelConfigData` | Models & quotas | ✅ |
| `GetStatus` | Server status | ✅ |

### Workspace & Indexing
| Method | Description | Tested |
|--------|-------------|--------|
| `GetWorkspaceInfos` | Workspace URIs | ✅ |
| `AddTrackedWorkspace` | Register workspace (Crucial for non-IDE folders) | ✅ |
| `RemoveTrackedWorkspace` | Remove workspace | ❓ |

#### Note on `workspace_id` format
Language servers are launched with `--workspace_id` arguments. Antigravity encodes these by replacing **BOTH `/` and `-` with `_`**. 
Example: `/path/to/my-project-name` → `file_path_to_my_project_name`.
**Do not** naively `replace(/_/g, '/')` to decode it, as it will corrupt paths with hyphens. Use greedy filesystem resolution (`fs.existsSync`) to accurately decode.

### MCP
| Method | Description | Tested |
|--------|-------------|--------|
| `GetMcpServerStates` | MCP server states | ✅ Empty |

### Browser & UI
| Method | Description |
|--------|-------------|
| `GetBrowserOpenConversation` | Get open conversation |
| `SetBrowserOpenConversation` | Set open conversation |
| `SmartFocusConversation` | Focus conversation |

---

## Step Data Architecture

### Three data sources (in order of preference):

1. **`StreamAgentStateUpdates`** (streaming) — **Authoritative.** Real-time state including steps, status, and metadata. Gateway uses this for WebSocket proxy.

2. **`GetCascadeTrajectorySteps`** (checkpoint) — Stable snapshot from `.pb` file. Requires `LoadTrajectory` for cold conversations. Used for initial page load.

3. **`GetCascadeTrajectory`** (live fork) — In-memory delta since last checkpoint flush. Contains only NEW steps, not full history. **DO NOT merge with checkpoint** — causes UI flicker.

### Step Types

| Type | Data Field | Description |
|------|-----------|-------------|
| `USER_INPUT` | `userInput.items[].text` | User message |
| `PLANNER_RESPONSE` | `plannerResponse.modifiedResponse` | AI response |
| `NOTIFY_USER` | `notifyUser` | Approval request (has `isBlocking`, `pathsToReview`) |
| `TASK_BOUNDARY` | `taskBoundary` | Task mode/status (has `taskName`, `mode`) |
| `CODE_ACTION` | `codeAction` | File create/edit |
| `VIEW_FILE` | `viewFile` | File read |
| `RUN_COMMAND` | `runCommand` | Shell command |
| `SEARCH_WEB` | `searchWeb` | Web search |
| `GREP_SEARCH` | `grepSearch` | Code search |
| `LIST_DIRECTORY` | `listDirectory` | Directory listing |
| `ERROR_MESSAGE` | `errorMessage` | Error |
| `EPHEMERAL_MESSAGE` | — | System message |
| `CHECKPOINT` | — | Checkpoint marker |

All prefixed with `CORTEX_STEP_TYPE_`. Status values: `_DONE`, `_RUNNING`, `_PENDING`, `_ERROR`.

### Notify User (Proceed/Reject) Logic

```
Show Proceed button when:
  1. step.notifyUser.isBlocking === true
  2. No USER_INPUT step exists AFTER this notify step
     (if USER_INPUT follows → user already responded → hide)
```

> ⚠️ Do NOT use `step.status` — it becomes `DONE` immediately, even while waiting.
> ⚠️ Do NOT use position checks like `index >= total - 2` — NOTIFY_USER can appear mid-conversation.

---

## Critical Lessons Learned (3 Phases)

### Phase 1: Checkpoint+Live Merge → ❌ UI Flicker
Merging `[...checkpoint, ...liveFork]` caused duplicates and oscillating step counts. Never merge these two sources.

### Phase 2: Checkpoint-Only Polling → ❌ Lag + Inconsistency
3-second `setInterval` polling `GetCascadeTrajectorySteps`:
- New steps invisible until checkpoint flushes
- Multi-server step count disagreement → Stop button flicker
- `isActive` derived from trajectory summary comparison was unreliable

### Phase 3: StreamAgentStateUpdates → ✅ Current Solution
Opens streaming connection per conversation. Pushes real-time steps + authoritative `CASCADE_RUN_STATUS_IDLE/RUNNING`. Single data source, no polling, no flicker.

### Other Lessons
- **Cancel**: Use `CancelCascadeInvocation`, NOT `CancelCascadeSteps`
- **Monotonic guard**: Frontend should never accept updates with fewer steps than currently displayed
- **Model IDs**: `MODEL_PLACEHOLDER_M26` etc. are internal; use `GetCascadeModelConfigData` for display labels
- **Port config**: Express backend on 3001, Next.js frontend on 3000 (rewrites to 3001)
