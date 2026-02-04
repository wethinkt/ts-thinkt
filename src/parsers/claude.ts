/**
 * Claude Code Parser
 *
 * Parses Claude Code JSONL conversation files into THINKT format
 */

import type {
  Source,
  SessionMeta,
  Entry,
  Role,
  ContentBlock,
  TextBlock,
  ThinkingBlock,
  ToolUseBlock,
  ToolResultBlock,
  ImageBlock,
  DocumentBlock,
  TokenUsage,
} from '../types';
import type { Parser, ParseResult, ParserOptions } from './types';
import { ParseError } from './types';

// ============================================
// Raw Claude Types (Internal)
// ============================================

/** Claude entry types */
type ClaudeEntryType =
  | 'user'
  | 'assistant'
  | 'system'
  | 'progress'
  | 'file-history-snapshot'
  | 'summary'
  | 'queue-operation';

/** Raw Claude JSONL entry */
interface RawClaudeEntry {
  type: ClaudeEntryType;
  uuid?: string;
  parentUuid?: string | null;
  sessionId?: string;
  timestamp?: string;
  version?: string;
  cwd?: string;
  gitBranch?: string;
  isSidechain?: boolean;
  agentId?: string;
  error?: string;
  isApiErrorMessage?: boolean;
  stopReason?: string;
  requestId?: string;
  summary?: string;
  status?: string;
  permissionMode?: string;
  thinkingMetadata?: {
    level?: string;
    disabled?: boolean;
    triggers?: string[];
  };
  message?: {
    role?: string;
    content?: unknown[] | string;
    model?: string;
    stop_reason?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
}

/** Raw Claude content block */
interface RawClaudeContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  signature?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
  source?: {
    type?: string;
    media_type?: string;
    data?: string;
  };
}

// ============================================
// Conversion Functions
// ============================================

/**
 * Convert Claude entry type to THINKT role
 */
function convertRole(entryType: ClaudeEntryType): Role {
  switch (entryType) {
    case 'user':
      return 'user';
    case 'assistant':
      return 'assistant';
    case 'system':
      return 'system';
    case 'progress':
      return 'progress';
    case 'summary':
      return 'summary';
    case 'file-history-snapshot':
      return 'checkpoint';
    case 'queue-operation':
      return 'system';
    default:
      return 'system';
  }
}

/**
 * Parse a raw content block into THINKT format
 */
function parseContentBlock(raw: unknown): ContentBlock | null {
  // Handle string content
  if (typeof raw === 'string') {
    return { type: 'text', text: raw } as TextBlock;
  }

  if (typeof raw !== 'object' || raw === null) {
    return null;
  }

  const block = raw as RawClaudeContentBlock;

  switch (block.type) {
    case 'text':
      return {
        type: 'text',
        text: block.text ?? '',
      } as TextBlock;

    case 'thinking':
      return {
        type: 'thinking',
        thinking: block.thinking ?? '',
        signature: block.signature,
      } as ThinkingBlock;

    case 'tool_use':
      return {
        type: 'tool_use',
        toolUseId: block.id ?? '',
        toolName: block.name ?? '',
        toolInput: block.input ?? {},
      } as ToolUseBlock;

    case 'tool_result':
      return {
        type: 'tool_result',
        toolUseId: block.tool_use_id ?? '',
        toolResult: typeof block.content === 'string' ? block.content : JSON.stringify(block.content ?? ''),
        isError: block.is_error === true,
      } as ToolResultBlock;

    case 'image':
      if (block.source) {
        return {
          type: 'image',
          mediaType: block.source.media_type ?? 'image/png',
          mediaData: block.source.data ?? '',
        } as ImageBlock;
      }
      return null;

    case 'document':
      if (block.source) {
        return {
          type: 'document',
          mediaType: block.source.media_type ?? 'application/pdf',
          mediaData: block.source.data ?? '',
        } as DocumentBlock;
      }
      return null;

    default:
      // Unknown block type, try to extract as text
      if ('text' in block && typeof block.text === 'string') {
        return { type: 'text', text: block.text } as TextBlock;
      }
      return null;
  }
}

/**
 * Parse token usage from raw Claude format
 */
function parseUsage(raw: RawClaudeEntry['message']): TokenUsage | undefined {
  if (!raw?.usage) return undefined;

  const usage = raw.usage;
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheCreationInputTokens: usage.cache_creation_input_tokens,
    cacheReadInputTokens: usage.cache_read_input_tokens,
  };
}

/**
 * Parse a raw Claude entry into THINKT Entry format
 */
function parseEntry(raw: RawClaudeEntry, source: Source = 'claude'): Entry {
  const role = convertRole(raw.type);
  const contentBlocks: ContentBlock[] = [];
  let text: string | undefined;

  // Parse message content
  if (raw.message) {
    const content = raw.message.content;

    if (typeof content === 'string') {
      text = content;
      contentBlocks.push({ type: 'text', text: content } as TextBlock);
    } else if (Array.isArray(content)) {
      for (const rawBlock of content) {
        const block = parseContentBlock(rawBlock);
        if (block) contentBlocks.push(block);
      }
      // Extract text for convenience field
      const textBlocks = contentBlocks.filter((b): b is TextBlock => b.type === 'text');
      if (textBlocks.length > 0) {
        text = textBlocks.map(b => b.text).join('\n');
      }
    }
  }

  // Handle summary entries
  if (raw.type === 'summary' && raw.summary) {
    text = raw.summary;
    if (contentBlocks.length === 0) {
      contentBlocks.push({ type: 'text', text: raw.summary } as TextBlock);
    }
  }

  // Parse timestamp
  let timestamp: Date;
  if (raw.timestamp) {
    timestamp = new Date(raw.timestamp);
  } else {
    timestamp = new Date();
  }

  const entry: Entry = {
    uuid: raw.uuid ?? `entry-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    parentUuid: raw.parentUuid ?? undefined,
    role,
    timestamp,
    source,
    contentBlocks,
    text,
    model: raw.message?.model,
    usage: parseUsage(raw.message),
    gitBranch: raw.gitBranch,
    cwd: raw.cwd,
    isCheckpoint: raw.type === 'file-history-snapshot',
    isSidechain: raw.isSidechain,
    metadata: {},
  };

  // Store Claude-specific fields in metadata
  if (raw.sessionId) entry.metadata!.sessionId = raw.sessionId;
  if (raw.version) entry.metadata!.version = raw.version;
  if (raw.agentId) entry.metadata!.agentId = raw.agentId;
  if (raw.error) entry.metadata!.error = raw.error;
  if (raw.isApiErrorMessage) entry.metadata!.isApiErrorMessage = raw.isApiErrorMessage;
  if (raw.stopReason) entry.metadata!.stopReason = raw.stopReason;
  if (raw.requestId) entry.metadata!.requestId = raw.requestId;
  if (raw.permissionMode) entry.metadata!.permissionMode = raw.permissionMode;
  if (raw.thinkingMetadata) entry.metadata!.thinkingMetadata = raw.thinkingMetadata;
  if (raw.status) entry.metadata!.progressStatus = raw.status;

  // Clean up empty metadata
  if (Object.keys(entry.metadata!).length === 0) {
    delete entry.metadata;
  }

  return entry;
}

/**
 * Parse JSONL string into array of raw objects
 */
function parseJsonl(text: string, options?: ParserOptions): { entries: RawClaudeEntry[]; skipped: number } {
  const entries: RawClaudeEntry[] = [];
  let skipped = 0;
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      const parsed = JSON.parse(line) as RawClaudeEntry;
      entries.push(parsed);
    } catch {
      if (options?.skipInvalidLines !== false) {
        skipped++;
        continue;
      }
      throw new ParseError(`Invalid JSON at line ${i + 1}`, i + 1, 'claude', line);
    }
  }

  return { entries, skipped };
}

/**
 * Check if content is Claude JSONL format
 */
function isClaudeJsonl(content: string | unknown): boolean {
  if (typeof content !== 'string') return false;

  const firstLine = content.trim().split('\n')[0];
  if (!firstLine) return false;

  try {
    const parsed = JSON.parse(firstLine);
    // Claude JSONL has type field with known values
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      'type' in parsed &&
      ['user', 'assistant', 'system', 'progress', 'file-history-snapshot', 'summary', 'queue-operation'].includes(parsed.type)
    );
  } catch {
    return false;
  }
}

/**
 * Extract session metadata from entries
 */
function extractSessionMeta(entries: Entry[], filename?: string): SessionMeta {
  const messageEntries = entries.filter(e => e.role === 'user' || e.role === 'assistant');
  const firstEntry = messageEntries[0] ?? entries[0];
  const lastEntry = messageEntries[messageEntries.length - 1] ?? entries[entries.length - 1];

  // Calculate duration
  let durationMs: number | undefined;
  if (firstEntry && lastEntry) {
    const start = firstEntry.timestamp.getTime();
    const end = lastEntry.timestamp.getTime();
    if (!isNaN(start) && !isNaN(end) && end > start) {
      durationMs = end - start;
    }
  }

  // Find model
  const modelEntry = entries.find(e => e.role === 'assistant' && e.model);
  const model = modelEntry?.model;

  // Calculate total usage
  const totalUsage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  };
  for (const entry of entries) {
    if (entry.usage) {
      totalUsage.inputTokens += entry.usage.inputTokens ?? 0;
      totalUsage.outputTokens += entry.usage.outputTokens ?? 0;
      totalUsage.cacheCreationInputTokens! += entry.usage.cacheCreationInputTokens ?? 0;
      totalUsage.cacheReadInputTokens! += entry.usage.cacheReadInputTokens ?? 0;
    }
  }

  // Get session ID from metadata
  const sessionId = firstEntry?.metadata?.sessionId as string | undefined;

  // Get first prompt
  const firstUserEntry = entries.find(e => e.role === 'user');
  const firstPrompt = firstUserEntry?.text?.slice(0, 200);

  // Find summaries
  const summaryEntries = entries.filter(e => e.role === 'summary' && e.text);
  const summary = summaryEntries.length > 0 ? summaryEntries[summaryEntries.length - 1].text : undefined;

  // Generate title
  let title = filename ?? 'Claude Code Session';
  if (sessionId) {
    title = `Session ${sessionId.slice(0, 8)}...`;
  } else if (firstPrompt) {
    title = firstPrompt.slice(0, 50) + (firstPrompt.length > 50 ? '...' : '');
  }

  return {
    id: sessionId ?? `session-${Date.now()}`,
    title,
    source: 'claude',
    entryCount: entries.length,
    createdAt: firstEntry?.timestamp,
    modifiedAt: lastEntry?.timestamp,
    model,
    gitBranch: firstEntry?.gitBranch,
    projectPath: firstEntry?.cwd,
    durationMs,
    totalUsage,
    firstPrompt,
    summary,
  };
}

// ============================================
// Parser Implementation
// ============================================

/**
 * Create a Claude Code parser
 */
export function createClaudeParser(options?: ParserOptions): Parser {
  return {
    source: 'claude',

    canParse(content: string | unknown): boolean {
      return isClaudeJsonl(content);
    },

    parse(content: string | unknown, filename?: string): ParseResult {
      if (typeof content !== 'string') {
        throw new ParseError('Claude parser expects string content', undefined, 'claude');
      }

      const { entries: rawEntries, skipped } = parseJsonl(content, options);
      const entries = rawEntries.map(raw => parseEntry(raw, 'claude'));
      const meta = extractSessionMeta(entries, filename);

      const warnings: string[] = [];
      if (skipped > 0) {
        warnings.push(`Skipped ${skipped} invalid JSON line(s)`);
      }

      return {
        session: { meta, entries },
        warnings: warnings.length > 0 ? warnings : undefined,
        skippedCount: skipped > 0 ? skipped : undefined,
      };
    },

    parseMetadata(content: string | unknown, filename?: string): SessionMeta {
      if (typeof content !== 'string') {
        throw new ParseError('Claude parser expects string content', undefined, 'claude');
      }

      // For metadata, we only need to parse a subset of entries
      // Parse first 50 lines and last 10 lines for efficiency
      const lines = content.split('\n').filter(l => l.trim());
      const sampleLines = [
        ...lines.slice(0, 50),
        ...lines.slice(-10),
      ];

      const entries: Entry[] = [];
      for (const line of sampleLines) {
        try {
          const raw = JSON.parse(line) as RawClaudeEntry;
          entries.push(parseEntry(raw, 'claude'));
        } catch {
          // Skip invalid lines
        }
      }

      const meta = extractSessionMeta(entries, filename);
      // Update entry count to reflect actual file
      meta.entryCount = lines.length;

      return meta;
    },
  };
}

/**
 * Default Claude parser instance
 */
export const claudeParser = createClaudeParser();

// Export for testing
export {
  parseEntry,
  parseContentBlock,
  parseJsonl,
  isClaudeJsonl,
  extractSessionMeta,
  convertRole,
};
export type { RawClaudeEntry, RawClaudeContentBlock, ClaudeEntryType };
