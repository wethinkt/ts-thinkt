/**
 * Tests for Session helper functions
 */

import { describe, it, expect } from 'vitest';
import type { Session, Entry, TextBlock, ThinkingBlock, ToolUseBlock, ToolResultBlock } from '../types';
import {
  getUserPrompts,
  getAssistantResponses,
  getEntryByUuid,
  getSidechainEntries,
  getRootEntries,
  getCheckpointEntries,
  getSessionDuration,
  getTotalTokenUsage,
  getAllThinkingBlocks,
  getAllToolUseBlocks,
  countEntriesByRole,
  getUniqueToolNames,
  getFirstPrompt,
  getSessionModel,
  hasErrors,
  getErrorResults,
  countTotalTokens,
  groupEntriesByTurn,
  getConversationFlow,
  calculateSessionStats,
} from '../session';

// Helper to create test entries
function createEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    uuid: `uuid-${Math.random().toString(36).slice(2)}`,
    role: 'assistant',
    timestamp: new Date(),
    source: 'claude',
    contentBlocks: [],
    ...overrides,
  };
}

// Helper to create test session
function createSession(entries: Entry[]): Session {
  return {
    meta: {
      id: 'test-session',
      title: 'Test Session',
      source: 'claude',
      entryCount: entries.length,
    },
    entries,
  };
}

describe('Session Helpers', () => {
  describe('getUserPrompts', () => {
    it('returns only user entries', () => {
      const session = createSession([
        createEntry({ role: 'user', text: 'hello' }),
        createEntry({ role: 'assistant', text: 'hi' }),
        createEntry({ role: 'user', text: 'how are you' }),
      ]);
      const prompts = getUserPrompts(session);
      expect(prompts).toHaveLength(2);
      expect(prompts[0].text).toBe('hello');
      expect(prompts[1].text).toBe('how are you');
    });
  });

  describe('getAssistantResponses', () => {
    it('returns only assistant entries', () => {
      const session = createSession([
        createEntry({ role: 'user', text: 'hello' }),
        createEntry({ role: 'assistant', text: 'hi' }),
        createEntry({ role: 'assistant', text: 'how can I help' }),
      ]);
      const responses = getAssistantResponses(session);
      expect(responses).toHaveLength(2);
    });
  });

  describe('getEntryByUuid', () => {
    it('finds entry by UUID', () => {
      const session = createSession([
        createEntry({ uuid: 'a', text: 'first' }),
        createEntry({ uuid: 'b', text: 'second' }),
        createEntry({ uuid: 'c', text: 'third' }),
      ]);
      const entry = getEntryByUuid(session, 'b');
      expect(entry?.text).toBe('second');
    });

    it('returns undefined if not found', () => {
      const session = createSession([
        createEntry({ uuid: 'a' }),
      ]);
      expect(getEntryByUuid(session, 'x')).toBeUndefined();
    });
  });

  describe('getSidechainEntries / getRootEntries', () => {
    it('separates sidechain and root entries', () => {
      const session = createSession([
        createEntry({ isSidechain: false }),
        createEntry({ isSidechain: true }),
        createEntry({ isSidechain: false }),
        createEntry({ isSidechain: true }),
      ]);
      expect(getSidechainEntries(session)).toHaveLength(2);
      expect(getRootEntries(session)).toHaveLength(2);
    });
  });

  describe('getCheckpointEntries', () => {
    it('returns checkpoint entries', () => {
      const session = createSession([
        createEntry({ isCheckpoint: true, role: 'checkpoint' }),
        createEntry({ role: 'user' }),
        createEntry({ isCheckpoint: true, role: 'checkpoint' }),
      ]);
      expect(getCheckpointEntries(session)).toHaveLength(2);
    });
  });

  describe('getSessionDuration', () => {
    it('calculates duration between first and last entry', () => {
      const start = new Date('2024-01-01T10:00:00Z');
      const end = new Date('2024-01-01T10:05:00Z');
      const session = createSession([
        createEntry({ timestamp: start }),
        createEntry({ timestamp: new Date('2024-01-01T10:02:00Z') }),
        createEntry({ timestamp: end }),
      ]);
      expect(getSessionDuration(session)).toBe(5 * 60 * 1000); // 5 minutes
    });

    it('returns 0 for single entry', () => {
      const session = createSession([createEntry()]);
      expect(getSessionDuration(session)).toBe(0);
    });
  });

  describe('getTotalTokenUsage', () => {
    it('sums usage across all entries', () => {
      const session = createSession([
        createEntry({ usage: { inputTokens: 100, outputTokens: 50 } }),
        createEntry({ usage: { inputTokens: 200, outputTokens: 100 } }),
        createEntry({}), // No usage
      ]);
      const usage = getTotalTokenUsage(session);
      expect(usage.inputTokens).toBe(300);
      expect(usage.outputTokens).toBe(150);
    });
  });

  describe('getAllThinkingBlocks', () => {
    it('collects thinking blocks from all entries', () => {
      const session = createSession([
        createEntry({
          contentBlocks: [
            { type: 'thinking', thinking: 'a' } as ThinkingBlock,
          ],
        }),
        createEntry({
          contentBlocks: [
            { type: 'text', text: 'x' } as TextBlock,
            { type: 'thinking', thinking: 'b' } as ThinkingBlock,
          ],
        }),
      ]);
      const blocks = getAllThinkingBlocks(session);
      expect(blocks).toHaveLength(2);
      expect(blocks[0].thinking).toBe('a');
      expect(blocks[1].thinking).toBe('b');
    });
  });

  describe('getAllToolUseBlocks', () => {
    it('collects tool_use blocks from all entries', () => {
      const session = createSession([
        createEntry({
          contentBlocks: [
            { type: 'tool_use', toolUseId: '1', toolName: 'read', toolInput: {} } as ToolUseBlock,
          ],
        }),
        createEntry({
          contentBlocks: [
            { type: 'tool_use', toolUseId: '2', toolName: 'write', toolInput: {} } as ToolUseBlock,
          ],
        }),
      ]);
      const blocks = getAllToolUseBlocks(session);
      expect(blocks).toHaveLength(2);
    });
  });

  describe('countEntriesByRole', () => {
    it('counts entries by role', () => {
      const session = createSession([
        createEntry({ role: 'user' }),
        createEntry({ role: 'user' }),
        createEntry({ role: 'assistant' }),
        createEntry({ role: 'system' }),
      ]);
      const counts = countEntriesByRole(session);
      expect(counts).toEqual({
        user: 2,
        assistant: 1,
        system: 1,
      });
    });
  });

  describe('getUniqueToolNames', () => {
    it('returns sorted unique tool names', () => {
      const session = createSession([
        createEntry({
          contentBlocks: [
            { type: 'tool_use', toolUseId: '1', toolName: 'write', toolInput: {} } as ToolUseBlock,
            { type: 'tool_use', toolUseId: '2', toolName: 'read', toolInput: {} } as ToolUseBlock,
          ],
        }),
        createEntry({
          contentBlocks: [
            { type: 'tool_use', toolUseId: '3', toolName: 'read', toolInput: {} } as ToolUseBlock,
          ],
        }),
      ]);
      expect(getUniqueToolNames(session)).toEqual(['read', 'write']);
    });
  });

  describe('getFirstPrompt', () => {
    it('returns first user prompt text', () => {
      const session = createSession([
        createEntry({ role: 'system', text: 'system message' }),
        createEntry({ role: 'user', text: 'hello world' }),
        createEntry({ role: 'assistant', text: 'hi' }),
      ]);
      expect(getFirstPrompt(session)).toBe('hello world');
    });

    it('returns empty string if no user prompts', () => {
      const session = createSession([
        createEntry({ role: 'assistant', text: 'hi' }),
      ]);
      expect(getFirstPrompt(session)).toBe('');
    });
  });

  describe('getSessionModel', () => {
    it('returns model from first assistant entry', () => {
      const session = createSession([
        createEntry({ role: 'user' }),
        createEntry({ role: 'assistant', model: 'claude-3-opus' }),
        createEntry({ role: 'assistant', model: 'claude-3-sonnet' }),
      ]);
      expect(getSessionModel(session)).toBe('claude-3-opus');
    });

    it('returns undefined if no assistant entries', () => {
      const session = createSession([
        createEntry({ role: 'user' }),
      ]);
      expect(getSessionModel(session)).toBeUndefined();
    });
  });

  describe('hasErrors / getErrorResults', () => {
    it('detects errors in tool results', () => {
      const session = createSession([
        createEntry({
          contentBlocks: [
            { type: 'tool_result', toolUseId: '1', toolResult: 'ok', isError: false } as ToolResultBlock,
          ],
        }),
        createEntry({
          contentBlocks: [
            { type: 'tool_result', toolUseId: '2', toolResult: 'failed', isError: true } as ToolResultBlock,
          ],
        }),
      ]);
      expect(hasErrors(session)).toBe(true);
      expect(getErrorResults(session)).toHaveLength(1);
      expect(getErrorResults(session)[0].toolResult).toBe('failed');
    });

    it('returns false when no errors', () => {
      const session = createSession([
        createEntry({
          contentBlocks: [
            { type: 'tool_result', toolUseId: '1', toolResult: 'ok', isError: false } as ToolResultBlock,
          ],
        }),
      ]);
      expect(hasErrors(session)).toBe(false);
      expect(getErrorResults(session)).toHaveLength(0);
    });
  });

  describe('countTotalTokens', () => {
    it('sums all tokens', () => {
      const session = createSession([
        createEntry({ usage: { inputTokens: 100, outputTokens: 50 } }),
        createEntry({ usage: { inputTokens: 200, outputTokens: 100 } }),
      ]);
      expect(countTotalTokens(session)).toBe(450);
    });
  });

  describe('groupEntriesByTurn', () => {
    it('groups entries into turns', () => {
      const session = createSession([
        createEntry({ uuid: '1', role: 'user', text: 'Q1' }),
        createEntry({ uuid: '2', role: 'assistant', text: 'A1' }),
        createEntry({ uuid: '3', role: 'user', text: 'Q2' }),
        createEntry({ uuid: '4', role: 'assistant', text: 'A2' }),
      ]);
      const turns = groupEntriesByTurn(session);
      expect(turns).toHaveLength(2);
      expect(turns[0].userEntry?.text).toBe('Q1');
      expect(turns[0].assistantEntry?.text).toBe('A1');
      expect(turns[1].userEntry?.text).toBe('Q2');
      expect(turns[1].assistantEntry?.text).toBe('A2');
    });

    it('handles tool entries within turns', () => {
      const session = createSession([
        createEntry({ uuid: '1', role: 'user', text: 'Q1' }),
        createEntry({ uuid: '2', role: 'assistant', text: 'A1' }),
        createEntry({ uuid: '3', role: 'tool', text: 'tool result' }),
        createEntry({ uuid: '4', role: 'assistant', text: 'A1 cont' }),
      ]);
      const turns = groupEntriesByTurn(session);
      expect(turns).toHaveLength(1);
      expect(turns[0].entries).toHaveLength(4);
    });
  });

  describe('getConversationFlow', () => {
    it('extracts user/assistant messages', () => {
      const session = createSession([
        createEntry({ role: 'system', text: 'sys' }),
        createEntry({ role: 'user', text: 'hello' }),
        createEntry({ role: 'assistant', text: 'hi' }),
        createEntry({ role: 'tool', text: 'result' }),
        createEntry({ role: 'assistant', text: 'done' }),
      ]);
      const flow = getConversationFlow(session);
      expect(flow).toHaveLength(3);
      expect(flow[0]).toMatchObject({ role: 'user', content: 'hello' });
      expect(flow[1]).toMatchObject({ role: 'assistant', content: 'hi' });
      expect(flow[2]).toMatchObject({ role: 'assistant', content: 'done' });
    });
  });

  describe('calculateSessionStats', () => {
    it('calculates comprehensive stats', () => {
      const start = new Date('2024-01-01T10:00:00Z');
      const middle = new Date('2024-01-01T10:02:00Z');
      const end = new Date('2024-01-01T10:05:00Z');
      const session = createSession([
        createEntry({
          role: 'user',
          timestamp: start,
          text: 'hello',
        }),
        createEntry({
          role: 'assistant',
          timestamp: middle,
          usage: { inputTokens: 100, outputTokens: 200 },
          contentBlocks: [
            { type: 'text', text: 'hi' } as TextBlock,
            { type: 'thinking', thinking: 'hmm' } as ThinkingBlock,
            { type: 'tool_use', toolUseId: '1', toolName: 'read', toolInput: {} } as ToolUseBlock,
          ],
        }),
        createEntry({
          role: 'tool',
          timestamp: end,
          contentBlocks: [
            { type: 'tool_result', toolUseId: '1', toolResult: 'ok', isError: false } as ToolResultBlock,
          ],
        }),
      ]);

      const stats = calculateSessionStats(session);
      expect(stats.entryCount).toBe(3);
      expect(stats.userPromptCount).toBe(1);
      expect(stats.assistantResponseCount).toBe(1);
      expect(stats.thinkingBlockCount).toBe(1);
      expect(stats.toolUseCount).toBe(1);
      expect(stats.toolResultCount).toBe(1);
      expect(stats.errorCount).toBe(0);
      expect(stats.totalTokens).toBe(300);
      expect(stats.inputTokens).toBe(100);
      expect(stats.outputTokens).toBe(200);
      expect(stats.durationMs).toBe(5 * 60 * 1000);
      expect(stats.uniqueToolNames).toEqual(['read']);
    });
  });
});
