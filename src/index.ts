/**
 * THINKT - Thinking Trace Library
 *
 * A TypeScript library for parsing and working with LLM conversation traces
 * from multiple sources (Claude, Kimi, etc.)
 *
 * @example
 * ```typescript
 * import { parse, Session, Entry } from './thinkt';
 *
 * // Parse a Claude Code JSONL file
 * const session = parse(jsonlContent);
 *
 * // Access session metadata
 * console.log(session.meta.title);
 * console.log(session.meta.model);
 *
 * // Iterate through entries
 * for (const entry of session.entries) {
 *   if (entry.role === 'user') {
 *     console.log('User:', entry.text);
 *   }
 * }
 * ```
 */

// ============================================
// Core Types
// ============================================

export type {
  // Source identification
  Source,
  Workspace,

  // Message classification
  Role,

  // Content blocks
  ContentBlockType,
  ContentBlock,
  TextBlock,
  ThinkingBlock,
  ToolUseBlock,
  ToolResultBlock,
  ImageBlock,
  DocumentBlock,

  // Token usage
  TokenUsage,
  CacheCreation,

  // Thinking configuration
  ThinkingMetadata,

  // Entry
  Entry,

  // Session
  SessionMeta,
  Session,

  // Project
  Project,
} from './types';

// Type guards
export {
  isTextBlock,
  isThinkingBlock,
  isToolUseBlock,
  isToolResultBlock,
  isImageBlock,
  isDocumentBlock,
} from './types';

// ============================================
// Entry Helpers
// ============================================

export {
  // Content extraction
  getTextContent,
  getThinkingContent,
  getThinkingDuration,
  getPreview,

  // Block queries
  hasThinking,
  getThinkingBlocks,
  hasToolUse,
  getToolUseBlocks,
  hasToolResult,
  getToolResultBlocks,
  getToolResultById,
  getTextBlocks,
  getBlocksInDisplayOrder,

  // Entry classification
  isUserPrompt,
  isAssistantResponse,
  hasError,

  // Agent/Team
  hasAgent,
  getAgentId,
  hasSourceAgent,
  getSourceAgentId,
  isFromAgent,

  // Utilities
  getTotalTokens,
  countBlocksByType,
  getToolNames,
  matchToolUseWithResult,
} from './entry';

// ============================================
// Session Helpers
// ============================================

export {
  // Entry queries
  getUserPrompts,
  getAssistantResponses,
  getEntryByUuid,
  getSidechainEntries,
  getRootEntries,
  getCheckpointEntries,

  // Block queries (session-wide)
  getAllThinkingBlocks,
  getAllToolUseBlocks,
  getAllToolResultBlocks,
  getToolResultById as getSessionToolResultById,

  // Statistics
  getSessionDuration,
  getTotalTokenUsage,
  countEntriesByRole,
  getUniqueToolNames,
  countTotalTokens,
  hasErrors,
  getErrorResults,
  calculateSessionStats,

  // Convenience
  getFirstPrompt,
  getSessionModel,

  // Conversation flow (legacy)
  getConversationFlow,
} from './session';

export type { SessionStats } from './session';

// ============================================
// Turn Analysis (Primary Interface for Visualization)
// ============================================

export {
  // Core classes
  TurnBuilder,
  DefaultTurnStrategy,
  ClaudeTurnStrategy,
  KimiTurnStrategy,
  GeminiTurnStrategy,

  // Factory functions
  createTurnBuilder,
  analyzeTurns,
  extractSearchableContent,

  // Legacy compatibility
  groupEntriesByTurn,
} from './turn';

export type {
  // Core types
  Turn,
  TurnCluster,
  TurnMetrics,
  SearchableTurn,

  // Strategy
  TurnBuildingStrategy,

  // Analysis result
  TurnAnalysis,
} from './turn';

// ============================================
// Parsers
// ============================================

export {
  // Registry
  ParserRegistry,
  parserRegistry,

  // Convenience functions
  parse,
  canParse,
  detectSource,

  // Claude parser
  claudeParser,
  createClaudeParser,

  // Kimi parser
  kimiParser,
  createKimiParser,

  // Gemini parser
  geminiParser,
  createGeminiParser,

  // Error
  ParseError,
} from './parsers';

export type {
  Parser,
  ParseResult,
  ParserFactory,
  ParserOptions,
} from './parsers';

// ============================================
// API Client
// ============================================

export {
  // High-level client (domain types)
  ThinktClient,
  createClient,
  getDefaultClient,
  configureDefaultClient,
  resetDefaultClient,

  // Low-level client (raw API types)
  ThinktApiClient,
  ThinktAPIError,
  ThinktNetworkError,
  createApiClient,
  getDefaultApiClient,
} from './api';

export type {
  ThinktClientConfig,
  SessionResponse,
  ApiSessionResponse,
  APISourceInfo,
  ErrorResponse,
} from './api';

export type { paths as APIPaths, components as APIComponents } from './api';
