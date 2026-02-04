/**
 * Parser Types and Interfaces
 *
 * Defines the contract for source-specific parsers
 */

import type { Source, Session, SessionMeta, Entry } from '../types';

/**
 * Result of parsing a trace file
 */
export interface ParseResult {
  /** Parsed session with all entries */
  session: Session;
  /** Any warnings encountered during parsing */
  warnings?: string[];
  /** Number of lines/entries that were skipped */
  skippedCount?: number;
}

/**
 * Parser interface for trace file formats
 */
export interface Parser {
  /** Source identifier for this parser */
  readonly source: Source;

  /**
   * Check if this parser can handle the given content
   * @param content Raw file content (string or object)
   */
  canParse(content: string | unknown): boolean;

  /**
   * Parse the content into a Session
   * @param content Raw file content
   * @param filename Optional filename for metadata
   */
  parse(content: string | unknown, filename?: string): ParseResult;

  /**
   * Parse only the metadata without loading all entries
   * Useful for listing sessions without full content
   * @param content Raw file content
   * @param filename Optional filename for metadata
   */
  parseMetadata?(content: string | unknown, filename?: string): SessionMeta;
}

/**
 * Streaming parser interface for large files
 */
export interface StreamingParser {
  /** Source identifier for this parser */
  readonly source: Source;

  /**
   * Create an iterator for entries
   * Useful for processing large files without loading all into memory
   */
  parseStream(content: string): IterableIterator<Entry>;
}

/**
 * Parser factory function type
 */
export type ParserFactory = () => Parser;

/**
 * Options for parser configuration
 */
export interface ParserOptions {
  /** Maximum line size in bytes (for JSONL) */
  maxLineSize?: number;
  /** Whether to skip invalid lines instead of throwing */
  skipInvalidLines?: boolean;
  /** Whether to preserve raw JSON in metadata */
  preserveRawJson?: boolean;
}

/**
 * Error thrown during parsing
 */
export class ParseError extends Error {
  constructor(
    message: string,
    public readonly line?: number,
    public readonly source?: Source,
    public readonly rawContent?: string
  ) {
    super(message);
    this.name = 'ParseError';
  }
}
