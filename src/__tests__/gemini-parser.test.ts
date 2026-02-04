/**
 * Tests for Gemini parser
 */

import { describe, it, expect } from 'vitest';
import {
  geminiParser,
  createGeminiParser,
  isGeminiJson,
  parseGeminiJson,
} from '../parsers/gemini';
import { ParseError } from '../parsers/types';
import type { ToolUseBlock, ToolResultBlock, ThinkingBlock } from '../types';

describe('Gemini Parser', () => {
  const sampleGeminiJson = JSON.stringify({
    sessionId: 'session-123',
    projectHash: 'hash-abc',
    startTime: '2024-01-01T10:00:00Z',
    lastUpdated: '2024-01-01T10:05:00Z',
    messages: [
      {
        id: 'msg-1',
        type: 'user',
        content: 'Hello Gemini',
        timestamp: '2024-01-01T10:00:00Z',
      },
      {
        id: 'msg-2',
        type: 'gemini',
        content: 'Hello User',
        timestamp: '2024-01-01T10:00:05Z',
        model: 'gemini-pro',
        thoughts: [
          {
            subject: 'Planning',
            description: 'I should greet the user.',
            timestamp: '2024-01-01T10:00:04Z',
          },
        ],
        tokens: {
          input: 10,
          output: 20,
          thoughts: 5,
        },
      },
      {
        id: 'msg-3',
        type: 'user',
        content: 'List files',
        timestamp: '2024-01-01T10:01:00Z',
      },
      {
        id: 'msg-4',
        type: 'gemini',
        timestamp: '2024-01-01T10:01:05Z',
        toolCalls: [
          {
            id: 'call-1',
            name: 'list_files',
            args: { path: '.' },
            result: [
              {
                functionResponse: {
                  id: 'res-1',
                  name: 'list_files',
                  response: { output: 'file1.txt\nfile2.txt' },
                },
              },
            ],
          },
        ],
      },
    ],
  });

  describe('isGeminiJson', () => {
    it('returns true for valid Gemini JSON', () => {
      expect(isGeminiJson(sampleGeminiJson)).toBe(true);
    });

    it('returns false for non-Gemini JSON', () => {
      expect(isGeminiJson('{"messages":[]}')).toBe(false); // Missing sessionId
      expect(isGeminiJson('{"sessionId":"123"}')).toBe(false); // Missing messages
    });

    it('returns false for invalid JSON', () => {
      expect(isGeminiJson('not json')).toBe(false);
    });

    it('returns false for non-string input', () => {
      expect(isGeminiJson(null)).toBe(false);
      expect(isGeminiJson({ sessionId: '1' })).toBe(false);
    });
  });

  describe('parseGeminiJson', () => {
    it('parses complete conversation', () => {
      const { session } = parseGeminiJson(sampleGeminiJson);

      expect(session.entries).toHaveLength(5); // 2 User + 1 Asst + 1 Asst (Tool Call) + 1 Tool Result
      expect(session.meta.source).toBe('gemini');
      expect(session.meta.id).toBe('session-123');
      expect(session.meta.durationMs).toBe(5 * 60 * 1000);
    });

    it('parses user messages', () => {
      const { session } = parseGeminiJson(sampleGeminiJson);
      const userEntry = session.entries[0];

      expect(userEntry.role).toBe('user');
      expect(userEntry.text).toBe('Hello Gemini');
      expect(userEntry.uuid).toBe('msg-1');
    });

    it('parses assistant messages with thoughts', () => {
      const { session } = parseGeminiJson(sampleGeminiJson);
      const asstEntry = session.entries[1];

      expect(asstEntry.role).toBe('assistant');
      expect(asstEntry.model).toBe('gemini-pro');
      expect(asstEntry.contentBlocks).toHaveLength(2); // 1 Thought + 1 Text

      const thinking = asstEntry.contentBlocks[0] as ThinkingBlock;
      expect(thinking.type).toBe('thinking');
      expect(thinking.thinking).toContain('[Planning] I should greet');

      expect(asstEntry.usage?.inputTokens).toBe(10);
      expect(asstEntry.usage?.outputTokens).toBe(20);
      expect(asstEntry.usage?.thinkingTokens).toBe(5);
    });

    it('parses tool calls', () => {
      const { session } = parseGeminiJson(sampleGeminiJson);
      const toolCallEntry = session.entries[3];

      expect(toolCallEntry.role).toBe('assistant');
      const toolUse = toolCallEntry.contentBlocks[0] as ToolUseBlock;
      expect(toolUse.type).toBe('tool_use');
      expect(toolUse.toolName).toBe('list_files');
      expect(toolUse.toolUseId).toBe('call-1');
    });

    it('parses tool results as separate entries', () => {
      const { session } = parseGeminiJson(sampleGeminiJson);
      const toolResultEntry = session.entries[4];

      expect(toolResultEntry.role).toBe('tool');
      expect(toolResultEntry.uuid).toBe('res-1');
      
      const toolResult = toolResultEntry.contentBlocks[0] as ToolResultBlock;
      expect(toolResult.type).toBe('tool_result');
      expect(toolResult.toolUseId).toBe('call-1');
      expect(toolResult.toolResult).toBe('file1.txt\nfile2.txt');
    });

    it('throws on invalid JSON', () => {
      expect(() => parseGeminiJson('invalid')).toThrow(ParseError);
    });
  });

  describe('geminiParser interface', () => {
    it('implements canParse correctly', () => {
      expect(geminiParser.canParse(sampleGeminiJson)).toBe(true);
      expect(geminiParser.canParse('{}')).toBe(false);
    });

    it('implements parse correctly', () => {
      const result = geminiParser.parse(sampleGeminiJson);
      expect(result.session.meta.source).toBe('gemini');
    });

    it('implements parseMetadata correctly', () => {
      const meta = geminiParser.parseMetadata!(sampleGeminiJson);
      expect(meta.entryCount).toBe(5);
      expect(meta.totalUsage?.inputTokens).toBe(10);
    });
  });
});
