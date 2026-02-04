/**
 * Tests for Entry helper functions
 */

import { describe, it, expect } from 'vitest';
import type { Entry, TextBlock, ThinkingBlock, ToolUseBlock, ToolResultBlock } from '../types';
import {
  getTextContent,
  hasThinking,
  getThinkingBlocks,
  getThinkingContent,
  getThinkingDuration,
  hasToolUse,
  getToolUseBlocks,
  hasToolResult,
  getToolResultById,
  isUserPrompt,
  isAssistantResponse,
  hasError,
  getTotalTokens,
  getPreview,
  countBlocksByType,
  getToolNames,
  getBlocksInDisplayOrder,
} from '../entry';

// Helper to create test entries
function createEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    uuid: 'test-uuid',
    role: 'assistant',
    timestamp: new Date(),
    source: 'claude',
    contentBlocks: [],
    ...overrides,
  };
}

describe('Entry Helpers', () => {
  describe('getTextContent', () => {
    it('returns text field if set', () => {
      const entry = createEntry({ text: 'direct text' });
      expect(getTextContent(entry)).toBe('direct text');
    });

    it('concatenates text blocks if text field not set', () => {
      const entry = createEntry({
        contentBlocks: [
          { type: 'text', text: 'hello' } as TextBlock,
          { type: 'thinking', thinking: 'hmm' } as ThinkingBlock,
          { type: 'text', text: 'world' } as TextBlock,
        ],
      });
      expect(getTextContent(entry)).toBe('hello\nworld');
    });

    it('returns empty string for entries with no text', () => {
      const entry = createEntry({
        contentBlocks: [
          { type: 'thinking', thinking: 'hmm' } as ThinkingBlock,
        ],
      });
      expect(getTextContent(entry)).toBe('');
    });
  });

  describe('hasThinking', () => {
    it('returns true if entry has thinking blocks', () => {
      const entry = createEntry({
        contentBlocks: [
          { type: 'thinking', thinking: 'reasoning' } as ThinkingBlock,
        ],
      });
      expect(hasThinking(entry)).toBe(true);
    });

    it('returns false if entry has no thinking blocks', () => {
      const entry = createEntry({
        contentBlocks: [
          { type: 'text', text: 'hello' } as TextBlock,
        ],
      });
      expect(hasThinking(entry)).toBe(false);
    });
  });

  describe('getThinkingBlocks', () => {
    it('returns all thinking blocks', () => {
      const entry = createEntry({
        contentBlocks: [
          { type: 'text', text: 'hello' } as TextBlock,
          { type: 'thinking', thinking: 'first' } as ThinkingBlock,
          { type: 'thinking', thinking: 'second' } as ThinkingBlock,
        ],
      });
      const blocks = getThinkingBlocks(entry);
      expect(blocks).toHaveLength(2);
      expect(blocks[0].thinking).toBe('first');
      expect(blocks[1].thinking).toBe('second');
    });
  });

  describe('getThinkingContent', () => {
    it('concatenates thinking content', () => {
      const entry = createEntry({
        contentBlocks: [
          { type: 'thinking', thinking: 'first thought' } as ThinkingBlock,
          { type: 'thinking', thinking: 'second thought' } as ThinkingBlock,
        ],
      });
      expect(getThinkingContent(entry)).toBe('first thought\n\nsecond thought');
    });
  });

  describe('getThinkingDuration', () => {
    it('sums duration from all thinking blocks', () => {
      const entry = createEntry({
        contentBlocks: [
          { type: 'thinking', thinking: 'a', durationMs: 100 } as ThinkingBlock,
          { type: 'thinking', thinking: 'b', durationMs: 200 } as ThinkingBlock,
        ],
      });
      expect(getThinkingDuration(entry)).toBe(300);
    });

    it('handles missing duration', () => {
      const entry = createEntry({
        contentBlocks: [
          { type: 'thinking', thinking: 'a', durationMs: 100 } as ThinkingBlock,
          { type: 'thinking', thinking: 'b' } as ThinkingBlock,
        ],
      });
      expect(getThinkingDuration(entry)).toBe(100);
    });
  });

  describe('hasToolUse', () => {
    it('returns true if entry has tool_use blocks', () => {
      const entry = createEntry({
        contentBlocks: [
          { type: 'tool_use', toolUseId: '1', toolName: 'test', toolInput: {} } as ToolUseBlock,
        ],
      });
      expect(hasToolUse(entry)).toBe(true);
    });

    it('returns false if entry has no tool_use blocks', () => {
      const entry = createEntry({
        contentBlocks: [
          { type: 'text', text: 'hello' } as TextBlock,
        ],
      });
      expect(hasToolUse(entry)).toBe(false);
    });
  });

  describe('getToolUseBlocks', () => {
    it('returns all tool_use blocks', () => {
      const entry = createEntry({
        contentBlocks: [
          { type: 'tool_use', toolUseId: '1', toolName: 'read', toolInput: {} } as ToolUseBlock,
          { type: 'text', text: 'hello' } as TextBlock,
          { type: 'tool_use', toolUseId: '2', toolName: 'write', toolInput: {} } as ToolUseBlock,
        ],
      });
      const blocks = getToolUseBlocks(entry);
      expect(blocks).toHaveLength(2);
      expect(blocks[0].toolName).toBe('read');
      expect(blocks[1].toolName).toBe('write');
    });
  });

  describe('hasToolResult', () => {
    it('returns true if entry has tool_result blocks', () => {
      const entry = createEntry({
        contentBlocks: [
          { type: 'tool_result', toolUseId: '1', toolResult: 'ok', isError: false } as ToolResultBlock,
        ],
      });
      expect(hasToolResult(entry)).toBe(true);
    });
  });

  describe('getToolResultById', () => {
    it('finds tool result by ID', () => {
      const entry = createEntry({
        contentBlocks: [
          { type: 'tool_result', toolUseId: 'a', toolResult: 'result-a', isError: false } as ToolResultBlock,
          { type: 'tool_result', toolUseId: 'b', toolResult: 'result-b', isError: false } as ToolResultBlock,
        ],
      });
      const result = getToolResultById(entry, 'b');
      expect(result?.toolResult).toBe('result-b');
    });

    it('returns undefined if not found', () => {
      const entry = createEntry({
        contentBlocks: [
          { type: 'tool_result', toolUseId: 'a', toolResult: 'result-a', isError: false } as ToolResultBlock,
        ],
      });
      expect(getToolResultById(entry, 'x')).toBeUndefined();
    });
  });

  describe('isUserPrompt', () => {
    it('returns true for user entries', () => {
      const entry = createEntry({ role: 'user' });
      expect(isUserPrompt(entry)).toBe(true);
    });

    it('returns false for non-user entries', () => {
      const entry = createEntry({ role: 'assistant' });
      expect(isUserPrompt(entry)).toBe(false);
    });
  });

  describe('isAssistantResponse', () => {
    it('returns true for assistant entries', () => {
      const entry = createEntry({ role: 'assistant' });
      expect(isAssistantResponse(entry)).toBe(true);
    });

    it('returns false for non-assistant entries', () => {
      const entry = createEntry({ role: 'user' });
      expect(isAssistantResponse(entry)).toBe(false);
    });
  });

  describe('hasError', () => {
    it('returns true if any tool result has error', () => {
      const entry = createEntry({
        contentBlocks: [
          { type: 'tool_result', toolUseId: '1', toolResult: 'ok', isError: false } as ToolResultBlock,
          { type: 'tool_result', toolUseId: '2', toolResult: 'failed', isError: true } as ToolResultBlock,
        ],
      });
      expect(hasError(entry)).toBe(true);
    });

    it('returns false if no errors', () => {
      const entry = createEntry({
        contentBlocks: [
          { type: 'tool_result', toolUseId: '1', toolResult: 'ok', isError: false } as ToolResultBlock,
        ],
      });
      expect(hasError(entry)).toBe(false);
    });
  });

  describe('getTotalTokens', () => {
    it('returns sum of input and output tokens', () => {
      const entry = createEntry({
        usage: { inputTokens: 100, outputTokens: 50 },
      });
      expect(getTotalTokens(entry)).toBe(150);
    });

    it('returns 0 if no usage', () => {
      const entry = createEntry();
      expect(getTotalTokens(entry)).toBe(0);
    });
  });

  describe('getPreview', () => {
    it('returns full text if under max length', () => {
      const entry = createEntry({ text: 'short text' });
      expect(getPreview(entry, 100)).toBe('short text');
    });

    it('truncates long text', () => {
      const entry = createEntry({ text: 'a'.repeat(150) });
      const preview = getPreview(entry, 100);
      expect(preview.length).toBe(100);
      expect(preview.endsWith('...')).toBe(true);
    });
  });

  describe('countBlocksByType', () => {
    it('counts blocks by type', () => {
      const entry = createEntry({
        contentBlocks: [
          { type: 'text', text: 'a' } as TextBlock,
          { type: 'text', text: 'b' } as TextBlock,
          { type: 'thinking', thinking: 'c' } as ThinkingBlock,
          { type: 'tool_use', toolUseId: '1', toolName: 'x', toolInput: {} } as ToolUseBlock,
        ],
      });
      const counts = countBlocksByType(entry);
      expect(counts).toEqual({
        text: 2,
        thinking: 1,
        tool_use: 1,
      });
    });
  });

  describe('getToolNames', () => {
    it('returns unique tool names', () => {
      const entry = createEntry({
        contentBlocks: [
          { type: 'tool_use', toolUseId: '1', toolName: 'read', toolInput: {} } as ToolUseBlock,
          { type: 'tool_use', toolUseId: '2', toolName: 'write', toolInput: {} } as ToolUseBlock,
          { type: 'tool_use', toolUseId: '3', toolName: 'read', toolInput: {} } as ToolUseBlock,
        ],
      });
      const names = getToolNames(entry);
      expect(names).toEqual(['read', 'write']);
    });
  });

  describe('getBlocksInDisplayOrder', () => {
    it('orders blocks for display', () => {
      const entry = createEntry({
        contentBlocks: [
          { type: 'tool_result', toolUseId: '1', toolResult: 'r', isError: false } as ToolResultBlock,
          { type: 'thinking', thinking: 't' } as ThinkingBlock,
          { type: 'tool_use', toolUseId: '1', toolName: 'x', toolInput: {} } as ToolUseBlock,
          { type: 'text', text: 'hello' } as TextBlock,
        ],
      });
      const ordered = getBlocksInDisplayOrder(entry);
      expect(ordered.map(b => b.type)).toEqual(['text', 'thinking', 'tool_use', 'tool_result']);
    });
  });
});
