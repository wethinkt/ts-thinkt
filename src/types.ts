/**
 * THINKT Ontology Types
 *
 * This module defines the canonical data structures for representing
 * LLM conversation traces from multiple sources (Claude, Kimi, etc.)
 */

// ============================================
// Source Identification
// ============================================

/**
 * Source identifies which AI tool created the conversation data
 */
export type Source = 'claude' | 'kimi' | 'gemini';

/**
 * Workspace represents a unique machine/host context for sessions
 */
export interface Workspace {
  /** Device ID (stable_id for Claude, device_id for Kimi) */
  id: string;
  /** Human-readable name (hostname) */
  name: string;
  /** Machine hostname */
  hostname: string;
  /** Which AI tool */
  source: Source;
  /** Root storage path (~/.claude or ~/.kimi) */
  basePath: string;
}

// ============================================
// Message Classification
// ============================================

/**
 * Role classifies the type of conversation entry
 */
export type Role =
  | 'user'       // User input
  | 'assistant'  // AI response
  | 'tool'       // Tool execution result
  | 'system'     // System events
  | 'summary'    // Session summaries
  | 'progress'   // Tool execution progress
  | 'checkpoint'; // State recovery markers

// ============================================
// Content Blocks
// ============================================

/**
 * ContentBlockType identifies the type of content in a block
 */
export type ContentBlockType =
  | 'text'
  | 'thinking'
  | 'tool_use'
  | 'tool_result'
  | 'image'
  | 'document';

/**
 * Base content block with common fields
 */
interface ContentBlockBase {
  type: ContentBlockType;
}

/**
 * Text content block
 */
export interface TextBlock extends ContentBlockBase {
  type: 'text';
  text: string;
}

/**
 * Thinking/reasoning content block
 */
export interface ThinkingBlock extends ContentBlockBase {
  type: 'thinking';
  thinking: string;
  /** Optional signature for verification */
  signature?: string;
  /** Duration in milliseconds */
  durationMs?: number;
}

/**
 * Tool use (function call) content block
 */
export interface ToolUseBlock extends ContentBlockBase {
  type: 'tool_use';
  /** Tool call UUID */
  toolUseId: string;
  /** Function name */
  toolName: string;
  /** Function arguments (polymorphic) */
  toolInput: unknown;
}

/**
 * Tool result content block
 */
export interface ToolResultBlock extends ContentBlockBase {
  type: 'tool_result';
  /** References the tool_use ID */
  toolUseId: string;
  /** Result content (may be string or structured) */
  toolResult: string;
  /** Whether the tool execution failed */
  isError: boolean;
  /** Duration in milliseconds */
  durationMs?: number;
}

/**
 * Image content block
 */
export interface ImageBlock extends ContentBlockBase {
  type: 'image';
  /** MIME type */
  mediaType: string;
  /** Base64 data or URI */
  mediaData: string;
}

/**
 * Document content block (PDF, etc.)
 */
export interface DocumentBlock extends ContentBlockBase {
  type: 'document';
  /** MIME type */
  mediaType: string;
  /** Base64 data or URI */
  mediaData: string;
  /** Optional filename */
  filename?: string;
}

/**
 * Union of all content block types
 */
export type ContentBlock =
  | TextBlock
  | ThinkingBlock
  | ToolUseBlock
  | ToolResultBlock
  | ImageBlock
  | DocumentBlock;

// ============================================
// Token Usage
// ============================================

/**
 * Cache creation token details
 */
export interface CacheCreation {
  /** Short-term cache tokens (5 min) */
  ephemeral5mInputTokens?: number;
  /** Medium-term cache tokens (1 hour) */
  ephemeral1hInputTokens?: number;
}

/**
 * TokenUsage tracks token consumption for cost analysis
 */
export interface TokenUsage {
  /** Regular input tokens */
  inputTokens: number;
  /** Regular output tokens */
  outputTokens: number;
  /** Thinking/reasoning tokens (Claude extended thinking) */
  thinkingTokens?: number;
  /** Prompt caching creation tokens (Claude) */
  cacheCreationInputTokens?: number;
  /** Prompt cache read tokens (Claude) */
  cacheReadInputTokens?: number;
  /** Detailed cache creation breakdown */
  cacheCreation?: CacheCreation;
  /** Tokens used by server-side tool execution */
  serverToolUse?: number;
  /** Service tier used for the request */
  serviceTier?: string;
}

// ============================================
// Entry (Single Conversation Turn)
// ============================================

/**
 * Entry represents a single turn in a conversation
 */
export interface Entry {
  /** Unique identifier within session */
  uuid: string;
  /** For branching conversations (Claude) */
  parentUuid?: string;
  /** Message classification */
  role: Role;
  /** When this entry was created */
  timestamp: Date;

  // Provenance
  /** Which tool created this entry */
  source: Source;
  /** Which machine/workspace */
  workspaceId?: string;
  /** Resolved agent name (e.g., "researcher") for team/multi-agent sessions */
  agentId?: string;
  /** Raw source identifier (e.g., "ab17e07") for correlation with team config */
  sourceAgentId?: string;

  // Content
  /** Content blocks (structured content) */
  contentBlocks: ContentBlock[];
  /** Convenience field for simple text content */
  text?: string;

  // Context
  /** Model name/ID (for assistant entries) */
  model?: string;
  /** Token usage metrics */
  usage?: TokenUsage;
  /** Git branch when entry was created */
  gitBranch?: string;
  /** Working directory */
  cwd?: string;

  // State markers
  /** File history snapshot (Claude) */
  isCheckpoint?: boolean;
  /** Branched conversation (Claude) */
  isSidechain?: boolean;

  // Extensibility
  /** Source-specific fields */
  metadata?: Record<string, unknown>;
}

// ============================================
// Session Metadata
// ============================================

/**
 * SessionMeta provides lightweight session information without full content
 */
export interface SessionMeta {
  /** Session UUID */
  id: string;
  /** Working directory (normalized) */
  projectPath?: string;
  /** Absolute path to session file */
  fullPath?: string;
  /** Preview of first user message */
  firstPrompt?: string;
  /** Session summary */
  summary?: string;
  /** Number of turns */
  entryCount: number;
  /** File size in bytes */
  fileSize?: number;
  /** When session was created */
  createdAt?: Date;
  /** When session was last modified */
  modifiedAt?: Date;
  /** Git branch when session was created */
  gitBranch?: string;
  /** Model identifier */
  model?: string;
  /** Which tool */
  source: Source;
  /** Which workspace */
  workspaceId?: string;
  /** Number of chunk files (0=unknown, 1=single, 2+=chunked) */
  chunkCount?: number;
  /** Title derived from content or filename */
  title?: string;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Total token usage across all entries */
  totalUsage?: TokenUsage;
}

// ============================================
// Thinking Configuration
// ============================================

/**
 * ThinkingMetadata contains configuration for thinking mode
 */
export interface ThinkingMetadata {
  /** Thinking level (e.g., 'low', 'medium', 'high') */
  level?: string;
  /** Whether thinking is disabled */
  disabled?: boolean;
  /** Triggers that activate thinking */
  triggers?: string[];
}

// ============================================
// Session (Complete Conversation)
// ============================================

/**
 * Session represents a complete conversation with all entries
 */
export interface Session {
  /** Session metadata */
  meta: SessionMeta;
  /** Chronological conversation entries */
  entries: Entry[];
}

// ============================================
// Project (Working Directory Container)
// ============================================

/**
 * Project represents a working directory that contains sessions
 */
export interface Project {
  /** Canonical identifier */
  id: string;
  /** Display name (basename) */
  name: string;
  /** Full filesystem path */
  path: string;
  /** Human-readable path */
  displayPath?: string;
  /** Number of sessions in this project */
  sessionCount: number;
  /** Most recent session modification */
  lastModified?: Date;
  /** Which tool */
  source: Source;
  /** Which workspace */
  workspaceId?: string;
  /** Root storage path for this source (e.g., ~/.claude or ~/.kimi) */
  sourceBasePath?: string;
  /** Whether the project directory still exists on disk */
  pathExists?: boolean;
}

// ============================================
// Type Guards
// ============================================

export function isTextBlock(block: ContentBlock): block is TextBlock {
  return block.type === 'text';
}

export function isThinkingBlock(block: ContentBlock): block is ThinkingBlock {
  return block.type === 'thinking';
}

export function isToolUseBlock(block: ContentBlock): block is ToolUseBlock {
  return block.type === 'tool_use';
}

export function isToolResultBlock(block: ContentBlock): block is ToolResultBlock {
  return block.type === 'tool_result';
}

export function isImageBlock(block: ContentBlock): block is ImageBlock {
  return block.type === 'image';
}

export function isDocumentBlock(block: ContentBlock): block is DocumentBlock {
  return block.type === 'document';
}
