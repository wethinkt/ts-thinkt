/**
 * Kimi Code JSONL Parser
 *
 * Parses Kimi Code conversation files (context.jsonl) into the THINKT format.
 *
 * Kimi format differences from Claude:
 * - Roles: user, assistant, tool, system, _checkpoint, _usage
 * - User content is typically a string
 * - Assistant content is an array of content blocks
 * - Tool calls are in a separate `tool_calls` array
 * - Tool results use role "tool" with `tool_call_id` and `content`
 * - Entries don't have UUIDs - line numbers are used ("L1", "L2", etc.)
 */

import type {
  Session,
  SessionMeta,
  Entry,
  ContentBlock,
  Role,
} from '../types';
import type { Parser, ParseResult, ParserOptions } from './types';
import { ParseError } from './types';

/** Raw Kimi entry from JSONL */
interface KimiRawEntry {
  role: string;
  content?: string | KimiRawContentBlock[];
  tool_calls?: KimiToolCall[];
  tool_call_id?: string;
  timestamp?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  [key: string]: unknown;
}

/** Kimi content block in assistant messages */
interface KimiRawContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  think?: string;
  signature?: string;
  tool_use_id?: string;
  content?: string | KimiRawContentBlock[];
  is_error?: boolean;
}

/** Kimi tool call in assistant messages (OpenAI function-calling format) */
interface KimiToolCall {
  id: string;
  type?: string;
  /** Flat format (legacy) */
  name?: string;
  input?: unknown;
  /** OpenAI function-calling format */
  function?: {
    name: string;
    arguments?: string;
  };
}

/** Options for Kimi parser */
export interface KimiParserOptions extends ParserOptions {
  /** Skip invalid JSON lines instead of throwing (default: true) */
  skipInvalidLines?: boolean;
}

/**
 * Check if content looks like Kimi JSONL format.
 */
export function isKimiJsonl(content: unknown): boolean {
  if (typeof content !== 'string') {
    return false;
  }

  try {
    // Get first non-empty line
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const parsed = JSON.parse(trimmed);
      // Kimi entries have a role field but NOT a uuid field (unlike Claude)
      // They also don't have a "type" field at the top level (unlike Claude)
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        typeof parsed.role === 'string' &&
        !('uuid' in parsed) &&
        !('type' in parsed)
      ) {
        // Additional check: role should be a Kimi role
        const kimiRoles = ['user', 'assistant', 'tool', 'system', '_checkpoint', '_usage'];
        return kimiRoles.includes(parsed.role);
      }
      return false;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Convert Kimi role to THINKT role.
 */
export function convertRole(kimiRole: string): Role {
  switch (kimiRole) {
    case 'user':
      return 'user';
    case 'assistant':
      return 'assistant';
    case 'tool':
      return 'tool';
    case 'system':
      return 'system';
    case '_checkpoint':
      return 'checkpoint';
    case '_usage':
      return 'system'; // Usage entries will be skipped anyway
    default:
      return 'system';
  }
}

/**
 * Parse a single content block from Kimi format.
 */
export function parseContentBlock(raw: unknown): ContentBlock | null {
  if (raw === null || raw === undefined) {
    return null;
  }

  // String content becomes text block
  if (typeof raw === 'string') {
    return { type: 'text', text: raw };
  }

  if (typeof raw !== 'object') {
    return null;
  }

  const block = raw as KimiRawContentBlock;
  const type = block.type;

  switch (type) {
    case 'text':
      return {
        type: 'text',
        text: block.text ?? '',
      };

    case 'thinking':
    case 'think':
      return {
        type: 'thinking',
        thinking: block.thinking ?? block.think ?? '',
        signature: block.signature,
      };

    case 'tool_result': {
      // Tool result content can be string or array
      let resultContent = '';
      if (typeof block.content === 'string') {
        resultContent = block.content;
      } else if (Array.isArray(block.content)) {
        // Extract text from content array
        resultContent = block.content
          .filter((c): c is KimiRawContentBlock => typeof c === 'object' && c !== null)
          .map((c) => c.text ?? '')
          .filter(Boolean)
          .join('');
      }

      return {
        type: 'tool_result',
        toolUseId: block.tool_use_id ?? '',
        toolResult: resultContent,
        isError: block.is_error ?? false,
      };
    }

    default:
      // Unknown type with text field - extract as text
      if ('text' in block && typeof block.text === 'string') {
        return { type: 'text', text: block.text };
      }
      return null;
  }
}

/**
 * Parse a single Kimi entry.
 */
export function parseEntry(raw: KimiRawEntry, lineNumber: number): Entry | null {
  const role = raw.role;

  // Skip empty entries and usage metadata entries
  if (!role || role === '_usage') {
    return null;
  }

  const entry: Entry = {
    uuid: `L${lineNumber}`,
    role: convertRole(role),
    timestamp: raw.timestamp ? new Date(raw.timestamp * 1000) : new Date(),
    source: 'kimi',
    contentBlocks: [],
    metadata: {},
  };

  // Handle checkpoint entries
  if (role === '_checkpoint') {
    entry.isCheckpoint = true;
    return entry;
  }

  // Handle content based on role
  switch (role) {
    case 'user':
      if (typeof raw.content === 'string') {
        entry.text = raw.content;
        entry.contentBlocks = [{ type: 'text', text: raw.content }];
      } else if (Array.isArray(raw.content)) {
        const blocks = raw.content
          .map(parseContentBlock)
          .filter((b): b is ContentBlock => b !== null);
        entry.contentBlocks = blocks;
        entry.text = extractTextFromBlocks(blocks);
      }
      break;

    case 'assistant':
      // Parse content blocks
      if (Array.isArray(raw.content)) {
        const blocks = raw.content
          .map(parseContentBlock)
          .filter((b): b is ContentBlock => b !== null);
        entry.contentBlocks = blocks;
        entry.text = extractTextFromBlocks(blocks);
      }

      // Parse tool calls (OpenAI function-calling format)
      if (Array.isArray(raw.tool_calls)) {
        for (const tc of raw.tool_calls) {
          let toolName = '';
          let toolInput: unknown = {};

          // OpenAI format: {function: {name, arguments}}
          if (tc.function) {
            toolName = tc.function.name;
            if (tc.function.arguments) {
              try {
                toolInput = JSON.parse(tc.function.arguments);
              } catch {
                toolInput = tc.function.arguments; // fallback to raw string
              }
            }
          } else {
            // Flat format fallback: {name, input}
            toolName = tc.name ?? '';
            toolInput = tc.input ?? {};
          }

          entry.contentBlocks.push({
            type: 'tool_use',
            toolUseId: tc.id,
            toolName,
            toolInput,
          });
        }
      }
      break;

    case 'tool': {
      // Tool result entry — content can be string or array
      let toolResult = '';
      if (typeof raw.content === 'string') {
        toolResult = raw.content;
      } else if (Array.isArray(raw.content)) {
        toolResult = (raw.content as KimiRawContentBlock[])
          .filter((c) => typeof c === 'object' && c !== null)
          .map((c) => c.text ?? '')
          .filter(Boolean)
          .join('');
      }
      entry.contentBlocks = [
        {
          type: 'tool_result',
          toolUseId: raw.tool_call_id ?? '',
          toolResult,
          isError: false,
        },
      ];
      break;
    }

    case 'system':
      if (typeof raw.content === 'string') {
        entry.text = raw.content;
        entry.contentBlocks = [{ type: 'text', text: raw.content }];
      }
      break;
  }

  // Extract usage if present
  if (raw.usage) {
    entry.usage = {
      inputTokens: raw.usage.input_tokens ?? 0,
      outputTokens: raw.usage.output_tokens ?? 0,
    };
  }

  return entry;
}

/**
 * Extract text from content blocks.
 */
function extractTextFromBlocks(blocks: ContentBlock[]): string {
  return blocks
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .filter(Boolean)
    .join('\n');
}

/**
 * Parse JSONL content into raw entries.
 */
export function parseJsonl(
  content: string,
  options: KimiParserOptions = {}
): { entries: Entry[]; skipped: number } {
  const { skipInvalidLines = true } = options;

  const lines = content.split('\n');
  const entries: Entry[] = [];
  let skipped = 0;
  let lineNumber = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    lineNumber++;

    try {
      const raw = JSON.parse(trimmed) as KimiRawEntry;
      const entry = parseEntry(raw, lineNumber);
      if (entry) {
        entries.push(entry);
      }
    } catch (err) {
      if (skipInvalidLines) {
        skipped++;
      } else {
        throw new ParseError(
          `Invalid JSON on line ${lineNumber}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  return { entries, skipped };
}

/**
 * Extract session metadata from parsed entries.
 */
function extractSessionMeta(entries: Entry[]): SessionMeta {
  const meta: SessionMeta = {
    id: `kimi-${Date.now()}`,
    title: 'Kimi Session',
    source: 'kimi',
    entryCount: entries.length,
  };

  // Find first user prompt for preview
  const firstUser = entries.find((e) => e.role === 'user');
  if (firstUser?.text) {
    meta.firstPrompt = firstUser.text.length > 50
      ? firstUser.text.slice(0, 50) + '...'
      : firstUser.text;
  }

  // Calculate duration
  const entriesWithTimestamp = entries.filter((e) => e.timestamp);
  if (entriesWithTimestamp.length >= 2) {
    const first = entriesWithTimestamp[0].timestamp!;
    const last = entriesWithTimestamp[entriesWithTimestamp.length - 1].timestamp!;
    meta.durationMs = last.getTime() - first.getTime();
  }

  // Sum token usage
  let inputTokens = 0;
  let outputTokens = 0;
  for (const entry of entries) {
    if (entry.usage) {
      inputTokens += entry.usage.inputTokens;
      outputTokens += entry.usage.outputTokens;
    }
  }
  if (inputTokens > 0 || outputTokens > 0) {
    meta.totalUsage = { inputTokens, outputTokens };
  }

  return meta;
}

/**
 * Create a Kimi parser with options.
 */
export function createKimiParser(options: KimiParserOptions = {}): Parser {
  return {
    source: 'kimi',

    canParse(content: unknown): boolean {
      return isKimiJsonl(content);
    },

    parse(content: unknown): ParseResult {
      if (typeof content !== 'string') {
        throw new ParseError('Kimi parser expects string content');
      }

      const { entries, skipped } = parseJsonl(content, options);
      const meta = extractSessionMeta(entries);

      const session: Session = {
        meta,
        entries,
      };

      const result: ParseResult = {
        session,
        warnings: [],
        skippedCount: skipped,
      };

      if (skipped > 0) {
        result.warnings!.push(`Skipped ${skipped} invalid JSON line(s)`);
      }

      return result;
    },

    parseMetadata(content: unknown): SessionMeta {
      if (typeof content !== 'string') {
        throw new ParseError('Kimi parser expects string content');
      }

      const { entries } = parseJsonl(content, { ...options, skipInvalidLines: true });
      return extractSessionMeta(entries);
    },
  };
}

/**
 * Default Kimi parser instance.
 */
export const kimiParser = createKimiParser();
