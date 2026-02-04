/**
 * Session Helper Functions
 *
 * Utility functions for working with Session objects
 */

import type {
  Session,
  Entry,
  TokenUsage,
  ThinkingBlock,
  ToolUseBlock,
  ToolResultBlock,
} from './types';
import {
  isUserPrompt,
  isAssistantResponse,
  getThinkingBlocks,
  getToolUseBlocks,
  getToolResultBlocks,
  getTextContent,
  getTotalTokens,
} from './entry';

/**
 * Get all user prompt entries from a session
 */
export function getUserPrompts(session: Session): Entry[] {
  return session.entries.filter(isUserPrompt);
}

/**
 * Get all assistant response entries from a session
 */
export function getAssistantResponses(session: Session): Entry[] {
  return session.entries.filter(isAssistantResponse);
}

/**
 * Get an entry by its UUID
 */
export function getEntryByUuid(session: Session, uuid: string): Entry | undefined {
  return session.entries.find((entry) => entry.uuid === uuid);
}

/**
 * Get a tool result by tool use ID across all entries
 */
export function getToolResultById(session: Session, toolUseId: string): ToolResultBlock | undefined {
  for (const entry of session.entries) {
    const results = getToolResultBlocks(entry);
    const result = results.find((r) => r.toolUseId === toolUseId);
    if (result) return result;
  }
  return undefined;
}

/**
 * Get all sidechain (branched) entries
 */
export function getSidechainEntries(session: Session): Entry[] {
  return session.entries.filter((entry) => entry.isSidechain);
}

/**
 * Get all root (non-branched) entries
 */
export function getRootEntries(session: Session): Entry[] {
  return session.entries.filter((entry) => !entry.isSidechain);
}

/**
 * Get all checkpoint entries
 */
export function getCheckpointEntries(session: Session): Entry[] {
  return session.entries.filter((entry) => entry.isCheckpoint);
}

/**
 * Calculate session duration from first to last entry
 */
export function getSessionDuration(session: Session): number {
  if (session.entries.length < 2) return 0;

  const timestamps = session.entries
    .map((e) => e.timestamp.getTime())
    .filter((t) => !isNaN(t));

  if (timestamps.length < 2) return 0;

  const min = Math.min(...timestamps);
  const max = Math.max(...timestamps);
  return max - min;
}

/**
 * Calculate total token usage across all entries
 */
export function getTotalTokenUsage(session: Session): TokenUsage {
  const total: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  };

  for (const entry of session.entries) {
    if (entry.usage) {
      total.inputTokens += entry.usage.inputTokens ?? 0;
      total.outputTokens += entry.usage.outputTokens ?? 0;
      total.cacheCreationInputTokens! += entry.usage.cacheCreationInputTokens ?? 0;
      total.cacheReadInputTokens! += entry.usage.cacheReadInputTokens ?? 0;
    }
  }

  return total;
}

/**
 * Get all thinking blocks from entire session
 */
export function getAllThinkingBlocks(session: Session): ThinkingBlock[] {
  return session.entries.flatMap(getThinkingBlocks);
}

/**
 * Get all tool use blocks from entire session
 */
export function getAllToolUseBlocks(session: Session): ToolUseBlock[] {
  return session.entries.flatMap(getToolUseBlocks);
}

/**
 * Get all tool result blocks from entire session
 */
export function getAllToolResultBlocks(session: Session): ToolResultBlock[] {
  return session.entries.flatMap(getToolResultBlocks);
}

/**
 * Count entries by role
 */
export function countEntriesByRole(session: Session): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of session.entries) {
    counts[entry.role] = (counts[entry.role] ?? 0) + 1;
  }
  return counts;
}

/**
 * Get unique tool names used in the session
 */
export function getUniqueToolNames(session: Session): string[] {
  const names = new Set<string>();
  for (const entry of session.entries) {
    for (const block of getToolUseBlocks(entry)) {
      names.add(block.toolName);
    }
  }
  return [...names].sort();
}

/**
 * Get first user prompt text (for preview)
 */
export function getFirstPrompt(session: Session): string {
  const userEntries = getUserPrompts(session);
  if (userEntries.length === 0) return '';
  return getTextContent(userEntries[0]);
}

/**
 * Get the model used in the session (from first assistant entry)
 */
export function getSessionModel(session: Session): string | undefined {
  const assistantEntries = getAssistantResponses(session);
  if (assistantEntries.length === 0) return undefined;
  return assistantEntries[0].model;
}

/**
 * Check if session has any errors
 */
export function hasErrors(session: Session): boolean {
  for (const entry of session.entries) {
    const results = getToolResultBlocks(entry);
    if (results.some((r) => r.isError)) return true;
  }
  return false;
}

/**
 * Get all error tool results
 */
export function getErrorResults(session: Session): ToolResultBlock[] {
  return getAllToolResultBlocks(session).filter((r) => r.isError);
}

/**
 * Count total tokens in session
 */
export function countTotalTokens(session: Session): number {
  return session.entries.reduce((sum, entry) => sum + getTotalTokens(entry), 0);
}

// Note: Turn analysis has been moved to './turn' module
// Re-export for backward compatibility
export { groupEntriesByTurn } from './turn';
export type { Turn } from './turn';

/**
 * Get conversation as alternating user/assistant messages (simplified view)
 */
export function getConversationFlow(session: Session): Array<{
  role: 'user' | 'assistant';
  content: string;
  entry: Entry;
}> {
  const flow: Array<{ role: 'user' | 'assistant'; content: string; entry: Entry }> = [];

  for (const entry of session.entries) {
    if (entry.role === 'user') {
      flow.push({
        role: 'user',
        content: getTextContent(entry),
        entry,
      });
    } else if (entry.role === 'assistant') {
      flow.push({
        role: 'assistant',
        content: getTextContent(entry),
        entry,
      });
    }
  }

  return flow;
}

/**
 * Calculate statistics for the session
 */
export interface SessionStats {
  entryCount: number;
  userPromptCount: number;
  assistantResponseCount: number;
  thinkingBlockCount: number;
  toolUseCount: number;
  toolResultCount: number;
  errorCount: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  uniqueToolNames: string[];
}

export function calculateSessionStats(session: Session): SessionStats {
  const usage = getTotalTokenUsage(session);
  const thinkingBlocks = getAllThinkingBlocks(session);
  const toolUses = getAllToolUseBlocks(session);
  const toolResults = getAllToolResultBlocks(session);
  const errors = toolResults.filter((r) => r.isError);

  return {
    entryCount: session.entries.length,
    userPromptCount: getUserPrompts(session).length,
    assistantResponseCount: getAssistantResponses(session).length,
    thinkingBlockCount: thinkingBlocks.length,
    toolUseCount: toolUses.length,
    toolResultCount: toolResults.length,
    errorCount: errors.length,
    totalTokens: usage.inputTokens + usage.outputTokens,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    durationMs: getSessionDuration(session),
    uniqueToolNames: getUniqueToolNames(session),
  };
}
