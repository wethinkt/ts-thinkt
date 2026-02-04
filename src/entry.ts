/**
 * Entry Helper Functions
 *
 * Utility functions for working with Entry objects
 */

import type {
  Entry,
  ContentBlock,
  ThinkingBlock,
  ToolUseBlock,
  ToolResultBlock,
  TextBlock,
} from './types';
import {
  isTextBlock,
  isThinkingBlock,
  isToolUseBlock,
  isToolResultBlock,
} from './types';

/**
 * Extract text content from an entry
 * Returns the text field if set, otherwise concatenates text blocks
 */
export function getTextContent(entry: Entry): string {
  if (entry.text) {
    return entry.text;
  }

  return entry.contentBlocks
    .filter(isTextBlock)
    .map((block) => block.text)
    .join('\n');
}

/**
 * Check if entry contains any thinking blocks
 */
export function hasThinking(entry: Entry): boolean {
  return entry.contentBlocks.some(isThinkingBlock);
}

/**
 * Get all thinking blocks from an entry
 */
export function getThinkingBlocks(entry: Entry): ThinkingBlock[] {
  return entry.contentBlocks.filter(isThinkingBlock);
}

/**
 * Get concatenated thinking content
 */
export function getThinkingContent(entry: Entry): string {
  return getThinkingBlocks(entry)
    .map((block) => block.thinking)
    .join('\n\n');
}

/**
 * Get total thinking duration in milliseconds
 */
export function getThinkingDuration(entry: Entry): number {
  return getThinkingBlocks(entry)
    .reduce((sum, block) => sum + (block.durationMs ?? 0), 0);
}

/**
 * Check if entry contains any tool uses
 */
export function hasToolUse(entry: Entry): boolean {
  return entry.contentBlocks.some(isToolUseBlock);
}

/**
 * Get all tool use blocks from an entry
 */
export function getToolUseBlocks(entry: Entry): ToolUseBlock[] {
  return entry.contentBlocks.filter(isToolUseBlock);
}

/**
 * Check if entry contains any tool results
 */
export function hasToolResult(entry: Entry): boolean {
  return entry.contentBlocks.some(isToolResultBlock);
}

/**
 * Get all tool result blocks from an entry
 */
export function getToolResultBlocks(entry: Entry): ToolResultBlock[] {
  return entry.contentBlocks.filter(isToolResultBlock);
}

/**
 * Get a specific tool result by tool use ID
 */
export function getToolResultById(entry: Entry, toolUseId: string): ToolResultBlock | undefined {
  return entry.contentBlocks
    .filter(isToolResultBlock)
    .find((block) => block.toolUseId === toolUseId);
}

/**
 * Get all text blocks from an entry
 */
export function getTextBlocks(entry: Entry): TextBlock[] {
  return entry.contentBlocks.filter(isTextBlock);
}

/**
 * Check if entry is a user prompt
 */
export function isUserPrompt(entry: Entry): boolean {
  return entry.role === 'user';
}

/**
 * Check if entry is an assistant response
 */
export function isAssistantResponse(entry: Entry): boolean {
  return entry.role === 'assistant';
}

/**
 * Check if entry has any errors (tool result errors or API errors)
 */
export function hasError(entry: Entry): boolean {
  return entry.contentBlocks
    .filter(isToolResultBlock)
    .some((block) => block.isError);
}

/**
 * Get total token usage from an entry
 */
export function getTotalTokens(entry: Entry): number {
  if (!entry.usage) return 0;
  return (entry.usage.inputTokens ?? 0) + (entry.usage.outputTokens ?? 0);
}

/**
 * Get a preview of the entry content (truncated)
 */
export function getPreview(entry: Entry, maxLength: number = 100): string {
  const text = getTextContent(entry);
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Count content blocks by type
 */
export function countBlocksByType(entry: Entry): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const block of entry.contentBlocks) {
    counts[block.type] = (counts[block.type] ?? 0) + 1;
  }
  return counts;
}

/**
 * Get all unique tool names used in an entry
 */
export function getToolNames(entry: Entry): string[] {
  return [...new Set(
    getToolUseBlocks(entry).map((block) => block.toolName)
  )];
}

/**
 * Match a tool use with its result within the same entry or across entries
 */
export function matchToolUseWithResult(
  toolUse: ToolUseBlock,
  entries: Entry[]
): ToolResultBlock | undefined {
  for (const entry of entries) {
    const result = getToolResultById(entry, toolUse.toolUseId);
    if (result) return result;
  }
  return undefined;
}

/**
 * Get content blocks in display order
 * (text, thinking, tool_use, tool_result)
 */
export function getBlocksInDisplayOrder(entry: Entry): ContentBlock[] {
  const order: Record<string, number> = {
    text: 0,
    thinking: 1,
    tool_use: 2,
    tool_result: 3,
    image: 4,
    document: 5,
  };

  return [...entry.contentBlocks].sort(
    (a, b) => (order[a.type] ?? 99) - (order[b.type] ?? 99)
  );
}
