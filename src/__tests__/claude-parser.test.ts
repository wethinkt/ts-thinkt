/**
 * Tests for Claude Code parser
 */

import { describe, it, expect } from 'vitest';
import {
  claudeParser,
  createClaudeParser,
  parseEntry,
  parseContentBlock,
  parseJsonl,
  isClaudeJsonl,
  convertRole,
} from '../parsers/claude';
import { ParseError } from '../parsers/types';
import type { ToolUseBlock, ToolResultBlock } from '../types';

describe('Claude Parser', () => {
  describe('isClaudeJsonl', () => {
    it('returns true for valid Claude JSONL', () => {
      const content = '{"type":"user","uuid":"123","message":{"role":"user","content":"hello"}}';
      expect(isClaudeJsonl(content)).toBe(true);
    });

    it('returns true for assistant entries', () => {
      const content = '{"type":"assistant","uuid":"456","message":{"role":"assistant","content":[]}}';
      expect(isClaudeJsonl(content)).toBe(true);
    });

    it('returns false for non-Claude JSON', () => {
      const content = '{"messages":[]}';
      expect(isClaudeJsonl(content)).toBe(false);
    });

    it('returns false for invalid JSON', () => {
      const content = 'not json';
      expect(isClaudeJsonl(content)).toBe(false);
    });

    it('returns false for non-string input', () => {
      expect(isClaudeJsonl({ type: 'user' })).toBe(false);
      expect(isClaudeJsonl(null)).toBe(false);
    });
  });

  describe('convertRole', () => {
    it('converts Claude entry types to THINKT roles', () => {
      expect(convertRole('user')).toBe('user');
      expect(convertRole('assistant')).toBe('assistant');
      expect(convertRole('system')).toBe('system');
      expect(convertRole('progress')).toBe('progress');
      expect(convertRole('summary')).toBe('summary');
      expect(convertRole('file-history-snapshot')).toBe('checkpoint');
      expect(convertRole('queue-operation')).toBe('system');
    });
  });

  describe('parseContentBlock', () => {
    it('parses text blocks', () => {
      const block = parseContentBlock({ type: 'text', text: 'hello' });
      expect(block).toEqual({ type: 'text', text: 'hello' });
    });

    it('parses string as text block', () => {
      const block = parseContentBlock('hello world');
      expect(block).toEqual({ type: 'text', text: 'hello world' });
    });

    it('parses thinking blocks', () => {
      const block = parseContentBlock({
        type: 'thinking',
        thinking: 'reasoning...',
        signature: 'abc123',
      });
      expect(block).toEqual({
        type: 'thinking',
        thinking: 'reasoning...',
        signature: 'abc123',
      });
    });

    it('parses tool_use blocks', () => {
      const block = parseContentBlock({
        type: 'tool_use',
        id: 'tool-1',
        name: 'read_file',
        input: { path: '/test.txt' },
      });
      expect(block).toEqual({
        type: 'tool_use',
        toolUseId: 'tool-1',
        toolName: 'read_file',
        toolInput: { path: '/test.txt' },
      });
    });

    it('parses tool_result blocks', () => {
      const block = parseContentBlock({
        type: 'tool_result',
        tool_use_id: 'tool-1',
        content: 'file contents',
        is_error: false,
      });
      expect(block).toEqual({
        type: 'tool_result',
        toolUseId: 'tool-1',
        toolResult: 'file contents',
        isError: false,
      });
    });

    it('parses error tool_result blocks', () => {
      const block = parseContentBlock({
        type: 'tool_result',
        tool_use_id: 'tool-1',
        content: 'file not found',
        is_error: true,
      });
      expect(block?.type).toBe('tool_result');
      expect((block as ToolResultBlock).isError).toBe(true);
    });

    it('parses image blocks', () => {
      const block = parseContentBlock({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: 'base64data',
        },
      });
      expect(block).toEqual({
        type: 'image',
        mediaType: 'image/png',
        mediaData: 'base64data',
      });
    });

    it('returns null for invalid blocks', () => {
      expect(parseContentBlock(null)).toBeNull();
      expect(parseContentBlock(undefined)).toBeNull();
      expect(parseContentBlock(123)).toBeNull();
    });

    it('extracts text from unknown block types', () => {
      const block = parseContentBlock({ type: 'unknown', text: 'fallback' });
      expect(block).toEqual({ type: 'text', text: 'fallback' });
    });
  });

  describe('parseJsonl', () => {
    it('parses multiple lines', () => {
      const content = [
        '{"type":"user","uuid":"1"}',
        '{"type":"assistant","uuid":"2"}',
      ].join('\n');
      const { entries, skipped } = parseJsonl(content);
      expect(entries).toHaveLength(2);
      expect(skipped).toBe(0);
    });

    it('skips empty lines', () => {
      const content = [
        '{"type":"user","uuid":"1"}',
        '',
        '   ',
        '{"type":"assistant","uuid":"2"}',
      ].join('\n');
      const { entries } = parseJsonl(content);
      expect(entries).toHaveLength(2);
    });

    it('skips invalid JSON by default', () => {
      const content = [
        '{"type":"user","uuid":"1"}',
        'invalid json',
        '{"type":"assistant","uuid":"2"}',
      ].join('\n');
      const { entries, skipped } = parseJsonl(content);
      expect(entries).toHaveLength(2);
      expect(skipped).toBe(1);
    });

    it('throws on invalid JSON when skipInvalidLines is false', () => {
      const content = [
        '{"type":"user"}',
        'invalid',
      ].join('\n');
      expect(() => parseJsonl(content, { skipInvalidLines: false }))
        .toThrow(ParseError);
    });
  });

  describe('parseEntry', () => {
    it('parses user entry', () => {
      const raw = {
        type: 'user' as const,
        uuid: 'uuid-1',
        timestamp: '2024-01-01T10:00:00Z',
        sessionId: 'session-1',
        cwd: '/home/user',
        gitBranch: 'main',
        message: {
          role: 'user',
          content: 'hello world',
        },
      };
      const entry = parseEntry(raw);
      expect(entry.uuid).toBe('uuid-1');
      expect(entry.role).toBe('user');
      expect(entry.text).toBe('hello world');
      expect(entry.cwd).toBe('/home/user');
      expect(entry.gitBranch).toBe('main');
      expect(entry.metadata?.sessionId).toBe('session-1');
    });

    it('parses assistant entry with content blocks', () => {
      const raw = {
        type: 'assistant' as const,
        uuid: 'uuid-2',
        timestamp: '2024-01-01T10:01:00Z',
        message: {
          role: 'assistant',
          model: 'claude-3-opus',
          content: [
            { type: 'text', text: 'Let me help' },
            { type: 'thinking', thinking: 'reasoning...' },
          ],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
          },
        },
      };
      const entry = parseEntry(raw);
      expect(entry.role).toBe('assistant');
      expect(entry.model).toBe('claude-3-opus');
      expect(entry.contentBlocks).toHaveLength(2);
      expect(entry.contentBlocks[0].type).toBe('text');
      expect(entry.contentBlocks[1].type).toBe('thinking');
      expect(entry.usage?.inputTokens).toBe(100);
      expect(entry.usage?.outputTokens).toBe(50);
    });

    it('parses file-history-snapshot as checkpoint', () => {
      const raw = {
        type: 'file-history-snapshot' as const,
        uuid: 'uuid-3',
        timestamp: '2024-01-01T10:02:00Z',
      };
      const entry = parseEntry(raw);
      expect(entry.role).toBe('checkpoint');
      expect(entry.isCheckpoint).toBe(true);
    });

    it('parses summary entry', () => {
      const raw = {
        type: 'summary' as const,
        uuid: 'uuid-4',
        timestamp: '2024-01-01T10:03:00Z',
        summary: 'This session covered...',
      };
      const entry = parseEntry(raw);
      expect(entry.role).toBe('summary');
      expect(entry.text).toBe('This session covered...');
    });

    it('handles sidechain entries', () => {
      const raw = {
        type: 'assistant' as const,
        uuid: 'uuid-5',
        isSidechain: true,
        message: { role: 'assistant', content: [] },
      };
      const entry = parseEntry(raw);
      expect(entry.isSidechain).toBe(true);
    });

    it('preserves metadata fields', () => {
      const raw = {
        type: 'assistant' as const,
        uuid: 'uuid-6',
        agentId: 'agent-1',
        requestId: 'req-1',
        permissionMode: 'auto',
        message: { role: 'assistant', content: [] },
      };
      const entry = parseEntry(raw);
      expect(entry.metadata?.agentId).toBe('agent-1');
      expect(entry.metadata?.requestId).toBe('req-1');
      expect(entry.metadata?.permissionMode).toBe('auto');
    });
  });

  describe('claudeParser.canParse', () => {
    it('returns true for Claude JSONL content', () => {
      const content = '{"type":"user","uuid":"123","message":{"role":"user","content":"hi"}}';
      expect(claudeParser.canParse(content)).toBe(true);
    });

    it('returns false for non-Claude content', () => {
      expect(claudeParser.canParse('{"messages":[]}')).toBe(false);
      expect(claudeParser.canParse('not json')).toBe(false);
    });
  });

  describe('claudeParser.parse', () => {
    it('parses complete conversation', () => {
      const content = [
        '{"type":"user","uuid":"1","timestamp":"2024-01-01T10:00:00Z","sessionId":"sess-1","message":{"role":"user","content":"hello"}}',
        '{"type":"assistant","uuid":"2","timestamp":"2024-01-01T10:00:05Z","message":{"role":"assistant","model":"claude-3-opus","content":[{"type":"text","text":"hi there"}],"usage":{"input_tokens":10,"output_tokens":5}}}',
        '{"type":"user","uuid":"3","timestamp":"2024-01-01T10:00:10Z","message":{"role":"user","content":"how are you?"}}',
        '{"type":"assistant","uuid":"4","timestamp":"2024-01-01T10:00:15Z","message":{"role":"assistant","content":[{"type":"text","text":"I\'m good!"}],"usage":{"input_tokens":20,"output_tokens":10}}}',
      ].join('\n');

      const result = claudeParser.parse(content);
      const { session } = result;

      expect(session.entries).toHaveLength(4);
      expect(session.meta.source).toBe('claude');
      expect(session.meta.model).toBe('claude-3-opus');
      expect(session.meta.totalUsage?.inputTokens).toBe(30);
      expect(session.meta.totalUsage?.outputTokens).toBe(15);
    });

    it('handles entries with tool calls', () => {
      const content = [
        '{"type":"user","uuid":"1","message":{"role":"user","content":"read test.txt"}}',
        '{"type":"assistant","uuid":"2","message":{"role":"assistant","content":[{"type":"tool_use","id":"tool-1","name":"read_file","input":{"path":"test.txt"}}]}}',
        '{"type":"user","uuid":"3","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tool-1","content":"file contents"}]}}',
      ].join('\n');

      const result = claudeParser.parse(content);
      const { session } = result;

      expect(session.entries).toHaveLength(3);

      // Check tool use
      const assistantEntry = session.entries[1];
      expect(assistantEntry.contentBlocks[0].type).toBe('tool_use');
      const toolUse = assistantEntry.contentBlocks[0] as ToolUseBlock;
      expect(toolUse.toolName).toBe('read_file');

      // Check tool result
      const toolResultEntry = session.entries[2];
      expect(toolResultEntry.contentBlocks[0].type).toBe('tool_result');
      const toolResult = toolResultEntry.contentBlocks[0] as ToolResultBlock;
      expect(toolResult.toolUseId).toBe('tool-1');
    });

    it('calculates session duration', () => {
      const content = [
        '{"type":"user","uuid":"1","timestamp":"2024-01-01T10:00:00Z","message":{"role":"user","content":"start"}}',
        '{"type":"assistant","uuid":"2","timestamp":"2024-01-01T10:05:00Z","message":{"role":"assistant","content":[{"type":"text","text":"end"}]}}',
      ].join('\n');

      const result = claudeParser.parse(content);
      expect(result.session.meta.durationMs).toBe(5 * 60 * 1000); // 5 minutes
    });

    it('extracts first prompt for preview', () => {
      const content = [
        '{"type":"user","uuid":"1","message":{"role":"user","content":"Hello, can you help me?"}}',
        '{"type":"assistant","uuid":"2","message":{"role":"assistant","content":[{"type":"text","text":"Sure!"}]}}',
      ].join('\n');

      const result = claudeParser.parse(content);
      expect(result.session.meta.firstPrompt).toBe('Hello, can you help me?');
    });

    it('reports warnings for skipped lines', () => {
      const content = [
        '{"type":"user","uuid":"1","message":{"role":"user","content":"hi"}}',
        'invalid json line',
        '{"type":"assistant","uuid":"2","message":{"role":"assistant","content":[]}}',
      ].join('\n');

      const result = claudeParser.parse(content);
      expect(result.session.entries).toHaveLength(2);
      expect(result.warnings).toContain('Skipped 1 invalid JSON line(s)');
      expect(result.skippedCount).toBe(1);
    });

    it('throws for non-string content', () => {
      expect(() => claudeParser.parse({ type: 'user' })).toThrow(ParseError);
    });
  });

  describe('claudeParser.parseMetadata', () => {
    it('extracts metadata without full parse', () => {
      const content = [
        '{"type":"user","uuid":"1","timestamp":"2024-01-01T10:00:00Z","sessionId":"sess-1","gitBranch":"main","cwd":"/home/user","message":{"role":"user","content":"hello"}}',
        '{"type":"assistant","uuid":"2","timestamp":"2024-01-01T10:00:05Z","message":{"role":"assistant","model":"claude-3-opus","content":[{"type":"text","text":"hi"}]}}',
      ].join('\n');

      const meta = claudeParser.parseMetadata!(content);
      expect(meta.source).toBe('claude');
      expect(meta.model).toBe('claude-3-opus');
      expect(meta.gitBranch).toBe('main');
      expect(meta.projectPath).toBe('/home/user');
      expect(meta.entryCount).toBe(2);
    });
  });

  describe('createClaudeParser', () => {
    it('creates parser with custom options', () => {
      const parser = createClaudeParser({ skipInvalidLines: false });
      expect(parser.source).toBe('claude');

      const validContent = '{"type":"user","uuid":"1","message":{"role":"user","content":"hi"}}';
      expect(parser.canParse(validContent)).toBe(true);
    });
  });
});
