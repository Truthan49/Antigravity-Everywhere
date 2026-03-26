// === API Response Types ===

export interface UserInfo {
  name?: string;
  email?: string;
  hasApiKey: boolean;
}

export interface ModelConfig {
  label: string;
  modelOrAlias?: { model?: string };
  quotaInfo?: { remainingFraction?: number };
  isRecommended?: boolean;
  tagTitle?: string;
}

export interface ModelsResponse {
  clientModelConfigs?: ModelConfig[];
  globalPreferredModel?: string;
}

export interface Conversation {
  id: string;
  title: string;
  workspace: string;
  mtime: number;
  steps: number;
}

export interface Server {
  pid: number;
  port: number;
  csrf: string;
  workspace: string;
}

export interface Workspace {
  name: string;
  uri: string;
}

export interface WorkspacesResponse {
  workspaces: Workspace[];
  playgrounds: string[];
}

export interface Skill {
  name: string;
  description: string;
  path: string;
  baseDir: string;
  scope: 'global' | 'workspace';
}

export interface CloudSkill {
  rank: number;
  slug: string;
  name: string;
  description: string;
  version: string;
  homepage: string;
  downloads: number;
  stars: number;
  score: number;
  categories: string[];
}

export interface Workflow {
  name: string;
  description: string;
  path: string;
  workspace?: string;
  content?: string;
  scope?: 'global' | 'workspace';
  baseDir?: string;
}

export interface Rule {
  name: string;
  description: string;
  path: string;
  content?: string;
  scope?: 'global' | 'workspace';
  baseDir?: string;
}

export interface AnalyticsData {
  completionStatistics?: {
    numCompletionsAccepted?: number;
    numCompletionsGenerated?: number;
  };
  completionsByDay?: Array<{
    date?: string;
    numCompletionsAccepted?: number;
  }>;
  completionsByLanguage?: Array<{
    language?: number;
    numCompletionsAccepted?: number;
  }>;
  chatsByModel?: Array<{
    model?: string;
    numChats?: number;
  }>;
}

export interface McpConfig {
  servers?: McpServer[];
}

export interface McpServer {
  name?: string;
  command?: string;
  description?: string;
}

// === Knowledge Item Types ===

export interface KnowledgeItem {
  id: string;
  title: string;
  summary: string;
  references: Array<{ type: string; value: string }>;
  timestamps: { created: string; modified: string; accessed: string };
  artifactFiles: string[];
}

export interface KnowledgeDetail extends KnowledgeItem {
  artifacts: Record<string, string>;
}

// === Step Types (match actual protobuf structure) ===

// Step status lifecycle: PENDING → RUNNING → GENERATING → DONE / CANCELED / ERROR
export type StepStatus =
  | 'CORTEX_STEP_STATUS_PENDING'
  | 'CORTEX_STEP_STATUS_RUNNING'
  | 'CORTEX_STEP_STATUS_GENERATING'
  | 'CORTEX_STEP_STATUS_DONE'
  | 'CORTEX_STEP_STATUS_CANCELED'
  | 'CORTEX_STEP_STATUS_ERROR';

export interface MessageItem {
  text?: string;
  item?: {
    file?: {
      absoluteUri?: string;
      workspaceUrisToRelativePaths?: Record<string, string>;
    };
  };
}

export interface MessageMedia {
  mimeType?: string;
  inlineData?: string;
  uri?: string;
  thumbnail?: string;
}

export interface Step {
  type: string;
  status?: string;
  // Each step has one of these populated based on type
  userInput?: {
    items?: MessageItem[];
    media?: MessageMedia[];
  };
  plannerResponse?: {
    response?: string;
    modifiedResponse?: string;
  };
  taskBoundary?: {
    taskName?: string;
    mode?: string;
    taskStatus?: string;
    taskSummary?: string;
  };
  notifyUser?: {
    notificationContent?: string;
    reviewAbsoluteUris?: string[];
    isBlocking?: boolean;
    // Rich fields from gRPC traffic
    blockedOnUser?: boolean;
    pathsToReview?: string[];
    shouldAutoProceed?: boolean;
  };
  codeAction?: {
    description?: string;
    isArtifactFile?: boolean;
    actionSpec?: {
      createFile?: { absoluteUri?: string };
      editFile?: { absoluteUri?: string };
      deleteFile?: { absoluteUri?: string };
    };
  };
  viewFile?: {
    absoluteUri?: string;
  };
  grepSearch?: {
    query?: string;
    searchPattern?: string;
  };
  runCommand?: {
    command?: string;
    commandLine?: string;
    safeToAutoRun?: boolean;
  };
  commandStatus?: {
    commandId?: string;
    output?: string;
  };
  sendCommandInput?: {
    commandId?: string;
    input?: string;
  };
  searchWeb?: {
    query?: string;
  };
  listDirectory?: {
    path?: string;
  };
  find?: {
    pattern?: string;
    searchDirectory?: string;
  };
  browserSubagent?: {
    taskName?: string;
    task?: string;
  };
  errorMessage?: {
    message?: string;
    errorMessage?: string;
  };
}

export interface StepsData {
  steps: Step[];
  cascadeStatus?: string; // 'running' | 'idle' — from WS
}
