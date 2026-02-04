/**
 * Parser Registry
 *
 * Central registry for trace file parsers
 */

import type { Source, Session, SessionMeta } from '../types';
import type { Parser, ParseResult } from './types';
import { ParseError } from './types';
import { claudeParser } from './claude';
import { kimiParser } from './kimi';
import { geminiParser } from './gemini';

// Re-export types
export type { Parser, ParseResult, ParserFactory, ParserOptions } from './types';
export { ParseError } from './types';

// Re-export Claude parser
export { claudeParser, createClaudeParser } from './claude';

// Re-export Kimi parser
export { kimiParser, createKimiParser } from './kimi';

// Re-export Gemini parser
export { geminiParser, createGeminiParser } from './gemini';

/**
 * Parser Registry manages available parsers and provides auto-detection
 */
export class ParserRegistry {
  private parsers: Map<Source, Parser> = new Map();

  constructor() {
    // Register default parsers
    this.register(claudeParser);
    this.register(kimiParser);
    this.register(geminiParser);
  }

  /**
   * Register a parser for a source
   */
  register(parser: Parser): void {
    this.parsers.set(parser.source, parser);
  }

  /**
   * Unregister a parser
   */
  unregister(source: Source): void {
    this.parsers.delete(source);
  }

  /**
   * Get a parser by source
   */
  get(source: Source): Parser | undefined {
    return this.parsers.get(source);
  }

  /**
   * Get all registered sources
   */
  getSources(): Source[] {
    return [...this.parsers.keys()];
  }

  /**
   * Check if any parser can handle the content
   */
  canParse(content: string | unknown): boolean {
    for (const parser of this.parsers.values()) {
      if (parser.canParse(content)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Detect which parser can handle the content
   */
  detect(content: string | unknown): Parser | undefined {
    for (const parser of this.parsers.values()) {
      if (parser.canParse(content)) {
        return parser;
      }
    }
    return undefined;
  }

  /**
   * Auto-detect and parse content
   */
  parse(content: string | unknown, filename?: string): ParseResult {
    const parser = this.detect(content);
    if (!parser) {
      throw new ParseError('No parser found for content format');
    }
    return parser.parse(content, filename);
  }

  /**
   * Auto-detect and parse metadata only
   */
  parseMetadata(content: string | unknown, filename?: string): SessionMeta {
    const parser = this.detect(content);
    if (!parser) {
      throw new ParseError('No parser found for content format');
    }
    if (parser.parseMetadata) {
      return parser.parseMetadata(content, filename);
    }
    // Fallback: full parse
    return parser.parse(content, filename).session.meta;
  }
}

/**
 * Default parser registry instance
 */
export const parserRegistry = new ParserRegistry();

/**
 * Convenience function: parse content with auto-detection
 */
export function parse(content: string | unknown, filename?: string): Session {
  return parserRegistry.parse(content, filename).session;
}

/**
 * Convenience function: check if content can be parsed
 */
export function canParse(content: string | unknown): boolean {
  return parserRegistry.canParse(content);
}

/**
 * Convenience function: detect source from content
 */
export function detectSource(content: string | unknown): Source | undefined {
  const parser = parserRegistry.detect(content);
  return parser?.source;
}
