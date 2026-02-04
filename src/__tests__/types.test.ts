/**
 * Tests for THINKT types and type guards
 */

import { describe, it, expect } from 'vitest';
import {
  isTextBlock,
  isThinkingBlock,
  isToolUseBlock,
  isToolResultBlock,
  isImageBlock,
  isDocumentBlock,
} from '../types';
import type {
  ContentBlock,
  TextBlock,
  ThinkingBlock,
  ToolUseBlock,
  ToolResultBlock,
  ImageBlock,
  DocumentBlock,
} from '../types';

describe('Type Guards', () => {
  describe('isTextBlock', () => {
    it('returns true for text blocks', () => {
      const block: TextBlock = { type: 'text', text: 'hello' };
      expect(isTextBlock(block)).toBe(true);
    });

    it('returns false for non-text blocks', () => {
      const block: ThinkingBlock = { type: 'thinking', thinking: 'hmm' };
      expect(isTextBlock(block)).toBe(false);
    });
  });

  describe('isThinkingBlock', () => {
    it('returns true for thinking blocks', () => {
      const block: ThinkingBlock = { type: 'thinking', thinking: 'reasoning...' };
      expect(isThinkingBlock(block)).toBe(true);
    });

    it('returns true for thinking blocks with signature', () => {
      const block: ThinkingBlock = {
        type: 'thinking',
        thinking: 'reasoning...',
        signature: 'abc123',
      };
      expect(isThinkingBlock(block)).toBe(true);
    });

    it('returns false for non-thinking blocks', () => {
      const block: TextBlock = { type: 'text', text: 'hello' };
      expect(isThinkingBlock(block)).toBe(false);
    });
  });

  describe('isToolUseBlock', () => {
    it('returns true for tool_use blocks', () => {
      const block: ToolUseBlock = {
        type: 'tool_use',
        toolUseId: 'id-123',
        toolName: 'read_file',
        toolInput: { path: '/test.txt' },
      };
      expect(isToolUseBlock(block)).toBe(true);
    });

    it('returns false for non-tool_use blocks', () => {
      const block: TextBlock = { type: 'text', text: 'hello' };
      expect(isToolUseBlock(block)).toBe(false);
    });
  });

  describe('isToolResultBlock', () => {
    it('returns true for tool_result blocks', () => {
      const block: ToolResultBlock = {
        type: 'tool_result',
        toolUseId: 'id-123',
        toolResult: 'file contents',
        isError: false,
      };
      expect(isToolResultBlock(block)).toBe(true);
    });

    it('returns true for error tool_result blocks', () => {
      const block: ToolResultBlock = {
        type: 'tool_result',
        toolUseId: 'id-123',
        toolResult: 'file not found',
        isError: true,
      };
      expect(isToolResultBlock(block)).toBe(true);
    });

    it('returns false for non-tool_result blocks', () => {
      const block: ToolUseBlock = {
        type: 'tool_use',
        toolUseId: 'id-123',
        toolName: 'read_file',
        toolInput: {},
      };
      expect(isToolResultBlock(block)).toBe(false);
    });
  });

  describe('isImageBlock', () => {
    it('returns true for image blocks', () => {
      const block: ImageBlock = {
        type: 'image',
        mediaType: 'image/png',
        mediaData: 'base64data',
      };
      expect(isImageBlock(block)).toBe(true);
    });

    it('returns false for non-image blocks', () => {
      const block: DocumentBlock = {
        type: 'document',
        mediaType: 'application/pdf',
        mediaData: 'base64data',
      };
      expect(isImageBlock(block)).toBe(false);
    });
  });

  describe('isDocumentBlock', () => {
    it('returns true for document blocks', () => {
      const block: DocumentBlock = {
        type: 'document',
        mediaType: 'application/pdf',
        mediaData: 'base64data',
        filename: 'test.pdf',
      };
      expect(isDocumentBlock(block)).toBe(true);
    });

    it('returns false for non-document blocks', () => {
      const block: ImageBlock = {
        type: 'image',
        mediaType: 'image/png',
        mediaData: 'base64data',
      };
      expect(isDocumentBlock(block)).toBe(false);
    });
  });

  describe('Type discrimination', () => {
    it('can discriminate block types in array', () => {
      const blocks: ContentBlock[] = [
        { type: 'text', text: 'hello' },
        { type: 'thinking', thinking: 'hmm' },
        { type: 'tool_use', toolUseId: '1', toolName: 'test', toolInput: {} },
        { type: 'tool_result', toolUseId: '1', toolResult: 'result', isError: false },
      ];

      const textBlocks = blocks.filter(isTextBlock);
      const thinkingBlocks = blocks.filter(isThinkingBlock);
      const toolUseBlocks = blocks.filter(isToolUseBlock);
      const toolResultBlocks = blocks.filter(isToolResultBlock);

      expect(textBlocks).toHaveLength(1);
      expect(thinkingBlocks).toHaveLength(1);
      expect(toolUseBlocks).toHaveLength(1);
      expect(toolResultBlocks).toHaveLength(1);

      // Type narrowing works
      expect(textBlocks[0].text).toBe('hello');
      expect(thinkingBlocks[0].thinking).toBe('hmm');
      expect(toolUseBlocks[0].toolName).toBe('test');
      expect(toolResultBlocks[0].toolResult).toBe('result');
    });
  });
});
