/**
 * Tests for Kimi Code parser
 */

import { describe, it, expect } from 'vitest';
import {
  kimiParser,
  createKimiParser,
  parseEntry,
  parseContentBlock,
  parseJsonl,
  isKimiJsonl,
  convertRole,
} from '../parsers/kimi';
import { ParseError } from '../parsers/types';
import type { ToolUseBlock, ToolResultBlock } from '../types';

describe('Kimi Parser', () => {
  describe('isKimiJsonl', () => {
    it('returns true for valid Kimi JSONL with user role', () => {
      const content = '{"role":"user","content":"hello"}';
      expect(isKimiJsonl(content)).toBe(true);
    });

    it('returns true for assistant entries', () => {
      const content = '{"role":"assistant","content":[{"type":"text","text":"hi"}]}';
      expect(isKimiJsonl(content)).toBe(true);
    });

    it('returns true for tool entries', () => {
      const content = '{"role":"tool","tool_call_id":"123","content":"result"}';
      expect(isKimiJsonl(content)).toBe(true);
    });

    it('returns true for checkpoint entries', () => {
      const content = '{"role":"_checkpoint","id":5}';
      expect(isKimiJsonl(content)).toBe(true);
    });

    it('returns false for Claude JSONL (has uuid and type)', () => {
      const content = '{"type":"user","uuid":"123","message":{"role":"user","content":"hello"}}';
      expect(isKimiJsonl(content)).toBe(false);
    });

    it('returns false for non-Kimi JSON', () => {
      const content = '{"messages":[]}';
      expect(isKimiJsonl(content)).toBe(false);
    });

    it('returns false for invalid JSON', () => {
      const content = 'not json';
      expect(isKimiJsonl(content)).toBe(false);
    });

    it('returns false for non-string input', () => {
      expect(isKimiJsonl({ role: 'user' })).toBe(false);
      expect(isKimiJsonl(null)).toBe(false);
    });
  });

  describe('convertRole', () => {
    it('converts Kimi roles to THINKT roles', () => {
      expect(convertRole('user')).toBe('user');
      expect(convertRole('assistant')).toBe('assistant');
      expect(convertRole('tool')).toBe('tool');
      expect(convertRole('system')).toBe('system');
      expect(convertRole('_checkpoint')).toBe('checkpoint');
      expect(convertRole('_usage')).toBe('system');
      expect(convertRole('unknown')).toBe('system');
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

    it('parses tool_result blocks with string content', () => {
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

    it('parses tool_result blocks with array content', () => {
      const block = parseContentBlock({
        type: 'tool_result',
        tool_use_id: 'tool-1',
        content: [
          { type: 'text', text: 'part 1' },
          { type: 'text', text: 'part 2' },
        ],
        is_error: false,
      });
      expect(block?.type).toBe('tool_result');
      expect((block as ToolResultBlock).toolResult).toBe('part 1part 2');
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
        '{"role":"user","content":"hello"}',
        '{"role":"assistant","content":[{"type":"text","text":"hi"}]}',
      ].join('\n');
      const { entries, skipped } = parseJsonl(content);
      expect(entries).toHaveLength(2);
      expect(skipped).toBe(0);
    });

    it('skips empty lines', () => {
      const content = [
        '{"role":"user","content":"hello"}',
        '',
        '   ',
        '{"role":"assistant","content":[]}',
      ].join('\n');
      const { entries } = parseJsonl(content);
      expect(entries).toHaveLength(2);
    });

    it('skips usage entries', () => {
      const content = [
        '{"role":"user","content":"hello"}',
        '{"role":"_usage","token_count":100}',
        '{"role":"assistant","content":[]}',
      ].join('\n');
      const { entries } = parseJsonl(content);
      expect(entries).toHaveLength(2);
    });

    it('skips invalid JSON by default', () => {
      const content = [
        '{"role":"user","content":"hello"}',
        'invalid json',
        '{"role":"assistant","content":[]}',
      ].join('\n');
      const { entries, skipped } = parseJsonl(content);
      expect(entries).toHaveLength(2);
      expect(skipped).toBe(1);
    });

    it('throws on invalid JSON when skipInvalidLines is false', () => {
      const content = [
        '{"role":"user","content":"hello"}',
        'invalid',
      ].join('\n');
      expect(() => parseJsonl(content, { skipInvalidLines: false }))
        .toThrow(ParseError);
    });
  });

  describe('parseEntry', () => {
    it('parses user entry with string content', () => {
      const raw = {
        role: 'user',
        content: 'hello world',
      };
      const entry = parseEntry(raw, 1);
      expect(entry).not.toBeNull();
      expect(entry!.uuid).toBe('L1');
      expect(entry!.role).toBe('user');
      expect(entry!.text).toBe('hello world');
      expect(entry!.source).toBe('kimi');
    });

    it('parses user entry with array content (tool results)', () => {
      const raw = {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'tool-1', content: 'result', is_error: false },
        ],
      };
      const entry = parseEntry(raw, 1);
      expect(entry).not.toBeNull();
      expect(entry!.contentBlocks).toHaveLength(1);
      expect(entry!.contentBlocks[0].type).toBe('tool_result');
    });

    it('parses assistant entry with content blocks', () => {
      const raw = {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me help' },
          { type: 'thinking', thinking: 'reasoning...' },
        ],
      };
      const entry = parseEntry(raw, 2);
      expect(entry).not.toBeNull();
      expect(entry!.role).toBe('assistant');
      expect(entry!.contentBlocks).toHaveLength(2);
      expect(entry!.contentBlocks[0].type).toBe('text');
      expect(entry!.contentBlocks[1].type).toBe('thinking');
    });

    it('parses assistant entry with tool calls', () => {
      const raw = {
        role: 'assistant',
        content: [{ type: 'text', text: "I'll help" }],
        tool_calls: [
          { id: 'call-1', name: 'ReadFile', input: { path: '/tmp/test' } },
        ],
      };
      const entry = parseEntry(raw, 1);
      expect(entry).not.toBeNull();
      expect(entry!.contentBlocks).toHaveLength(2);

      const toolBlock = entry!.contentBlocks.find((b) => b.type === 'tool_use') as ToolUseBlock;
      expect(toolBlock).toBeDefined();
      expect(toolBlock.toolUseId).toBe('call-1');
      expect(toolBlock.toolName).toBe('ReadFile');
      expect(toolBlock.toolInput).toEqual({ path: '/tmp/test' });
    });

    it('parses tool entry', () => {
      const raw = {
        role: 'tool',
        tool_call_id: 'call-1',
        content: 'File contents here',
      };
      const entry = parseEntry(raw, 3);
      expect(entry).not.toBeNull();
      expect(entry!.role).toBe('tool');
      expect(entry!.contentBlocks).toHaveLength(1);

      const toolResult = entry!.contentBlocks[0] as ToolResultBlock;
      expect(toolResult.type).toBe('tool_result');
      expect(toolResult.toolUseId).toBe('call-1');
      expect(toolResult.toolResult).toBe('File contents here');
    });

    it('parses checkpoint entry', () => {
      const raw = {
        role: '_checkpoint',
        id: 5,
      };
      const entry = parseEntry(raw, 1);
      expect(entry).not.toBeNull();
      expect(entry!.role).toBe('checkpoint');
      expect(entry!.isCheckpoint).toBe(true);
    });

    it('returns null for usage entries', () => {
      const raw = {
        role: '_usage',
        token_count: 100,
      };
      const entry = parseEntry(raw, 1);
      expect(entry).toBeNull();
    });

    it('parses entry with usage data', () => {
      const raw = {
        role: 'assistant',
        content: [{ type: 'text', text: 'hi' }],
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      };
      const entry = parseEntry(raw, 1);
      expect(entry).not.toBeNull();
      expect(entry!.usage?.inputTokens).toBe(100);
      expect(entry!.usage?.outputTokens).toBe(50);
    });

    it('parses entry with timestamp', () => {
      const timestamp = 1704067200; // 2024-01-01T00:00:00Z
      const raw = {
        role: 'user',
        content: 'hello',
        timestamp,
      };
      const entry = parseEntry(raw, 1);
      expect(entry).not.toBeNull();
      expect(entry!.timestamp?.getTime()).toBe(timestamp * 1000);
    });

    it('uses line number as UUID', () => {
      const raw = { role: 'user', content: 'hello' };
      expect(parseEntry(raw, 1)!.uuid).toBe('L1');
      expect(parseEntry(raw, 42)!.uuid).toBe('L42');
      expect(parseEntry(raw, 100)!.uuid).toBe('L100');
    });
  });

  describe('kimiParser.canParse', () => {
    it('returns true for Kimi JSONL content', () => {
      const content = '{"role":"user","content":"hi"}';
      expect(kimiParser.canParse(content)).toBe(true);
    });

    it('returns false for Claude content', () => {
      const content = '{"type":"user","uuid":"123","message":{"role":"user","content":"hi"}}';
      expect(kimiParser.canParse(content)).toBe(false);
    });

    it('returns false for non-Kimi content', () => {
      expect(kimiParser.canParse('{"messages":[]}')).toBe(false);
      expect(kimiParser.canParse('not json')).toBe(false);
    });
  });

  describe('kimiParser.parse', () => {
    it('parses complete conversation', () => {
      const content = [
        '{"role":"user","content":"hello"}',
        '{"role":"assistant","content":[{"type":"text","text":"hi there"}]}',
        '{"role":"user","content":"how are you?"}',
        '{"role":"assistant","content":[{"type":"text","text":"I\'m good!"}]}',
      ].join('\n');

      const result = kimiParser.parse(content);
      const { session } = result;

      expect(session.entries).toHaveLength(4);
      expect(session.meta.source).toBe('kimi');
      expect(session.meta.entryCount).toBe(4);
    });

    it('handles entries with tool calls', () => {
      const content = [
        '{"role":"user","content":"read test.txt"}',
        '{"role":"assistant","content":[{"type":"text","text":"I\'ll read it"}],"tool_calls":[{"id":"tool-1","name":"read_file","input":{"path":"test.txt"}}]}',
        '{"role":"tool","tool_call_id":"tool-1","content":"file contents"}',
      ].join('\n');

      const result = kimiParser.parse(content);
      const { session } = result;

      expect(session.entries).toHaveLength(3);

      // Check tool use
      const assistantEntry = session.entries[1];
      const toolUse = assistantEntry.contentBlocks.find((b) => b.type === 'tool_use') as ToolUseBlock;
      expect(toolUse).toBeDefined();
      expect(toolUse.toolName).toBe('read_file');

      // Check tool result
      const toolEntry = session.entries[2];
      expect(toolEntry.contentBlocks[0].type).toBe('tool_result');
      const toolResult = toolEntry.contentBlocks[0] as ToolResultBlock;
      expect(toolResult.toolUseId).toBe('tool-1');
    });

    it('extracts first prompt for preview', () => {
      const content = [
        '{"role":"_checkpoint","id":0}',
        '{"role":"user","content":"Hello, can you help me?"}',
        '{"role":"assistant","content":[{"type":"text","text":"Sure!"}]}',
      ].join('\n');

      const result = kimiParser.parse(content);
      expect(result.session.meta.firstPrompt).toBe('Hello, can you help me?');
    });

    it('truncates long first prompts', () => {
      const longPrompt = 'a'.repeat(100);
      const content = `{"role":"user","content":"${longPrompt}"}`;

      const result = kimiParser.parse(content);
      expect(result.session.meta.firstPrompt?.length).toBeLessThanOrEqual(53); // 50 + "..."
    });

    it('calculates session duration', () => {
      const content = [
        '{"role":"user","content":"start","timestamp":1704067200}',
        '{"role":"assistant","content":[{"type":"text","text":"end"}],"timestamp":1704067500}',
      ].join('\n');

      const result = kimiParser.parse(content);
      expect(result.session.meta.durationMs).toBe(300 * 1000); // 5 minutes
    });

    it('sums token usage', () => {
      const content = [
        '{"role":"assistant","content":[],"usage":{"input_tokens":100,"output_tokens":50}}',
        '{"role":"assistant","content":[],"usage":{"input_tokens":200,"output_tokens":100}}',
      ].join('\n');

      const result = kimiParser.parse(content);
      expect(result.session.meta.totalUsage?.inputTokens).toBe(300);
      expect(result.session.meta.totalUsage?.outputTokens).toBe(150);
    });

    it('reports warnings for skipped lines', () => {
      const content = [
        '{"role":"user","content":"hi"}',
        'invalid json line',
        '{"role":"assistant","content":[]}',
      ].join('\n');

      const result = kimiParser.parse(content);
      expect(result.session.entries).toHaveLength(2);
      expect(result.warnings).toContain('Skipped 1 invalid JSON line(s)');
      expect(result.skippedCount).toBe(1);
    });

    it('throws for non-string content', () => {
      expect(() => kimiParser.parse({ role: 'user' })).toThrow(ParseError);
    });
  });

  describe('kimiParser.parseMetadata', () => {
    it('extracts metadata without full parse', () => {
      const content = [
        '{"role":"user","content":"hello","timestamp":1704067200}',
        '{"role":"assistant","content":[{"type":"text","text":"hi"}],"timestamp":1704067260}',
      ].join('\n');

      const meta = kimiParser.parseMetadata!(content);
      expect(meta.source).toBe('kimi');
      expect(meta.entryCount).toBe(2);
      expect(meta.firstPrompt).toBe('hello');
    });
  });

  describe('createKimiParser', () => {
    it('creates parser with custom options', () => {
      const parser = createKimiParser({ skipInvalidLines: false });
      expect(parser.source).toBe('kimi');

      const validContent = '{"role":"user","content":"hi"}';
      expect(parser.canParse(validContent)).toBe(true);
    });

    it('throws on invalid line when skipInvalidLines is false', () => {
      const parser = createKimiParser({ skipInvalidLines: false });
      const content = [
        '{"role":"user","content":"hi"}',
        'invalid',
      ].join('\n');

      expect(() => parser.parse(content)).toThrow(ParseError);
    });
  });

  describe('integration with registry', () => {
    it('kimi parser is registered by default', async () => {
      const { parserRegistry } = await import('../parsers');
      expect(parserRegistry.getSources()).toContain('kimi');
    });

    it('auto-detects kimi content', async () => {
      const { detectSource } = await import('../parsers');
      const content = '{"role":"user","content":"hello"}';
      expect(detectSource(content)).toBe('kimi');
    });

    it('prefers claude parser for claude content', async () => {
      const { detectSource } = await import('../parsers');
      const content = '{"type":"user","uuid":"123","message":{"role":"user","content":"hello"}}';
      expect(detectSource(content)).toBe('claude');
    });
  });
});
