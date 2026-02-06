/**
 * Gemini Parser
 *
 * Parses Gemini CLI JSON session files into THINKT format.
 * Note: Gemini uses a single JSON object file, not JSONL.
 */

import type {
  SessionMeta,
  Entry,
  ContentBlock,
  TokenUsage,
} from '../types';
import type { Parser, ParseResult, ParserOptions } from './types';
import { ParseError } from './types';

// ============================================
// Raw Gemini Types
// ============================================

interface RawGeminiSession {
  sessionId: string;
  projectHash?: string;
  startTime?: string;
  lastUpdated?: string;
  messages: RawGeminiMessage[];
}

interface RawGeminiMessage {
  id?: string;
  timestamp?: string;
  type: 'user' | 'gemini';
  content?: string;
  toolCalls?: RawGeminiToolCall[];
  thoughts?: RawGeminiThought[];
  tokens?: RawGeminiTokens;
  model?: string;
}

interface RawGeminiToolCall {
  id: string;
  name: string;
  args: unknown;
  result?: RawGeminiToolResult[];
}

interface RawGeminiToolResult {
  functionResponse: {
    id: string;
    name: string;
    response: Record<string, unknown>;
  };
}

interface RawGeminiThought {
  subject: string;
  description: string;
  timestamp?: string;
}

interface RawGeminiTokens {
  input: number;
  output: number;
  cached?: number;
  thoughts?: number;
  tool?: number;
  total?: number;
}

// ============================================
// Conversion Functions
// ============================================

/**
 * Check if content is a Gemini JSON session
 */
export function isGeminiJson(content: unknown): boolean {
  if (typeof content !== 'string') return false;

  try {
    const parsed = JSON.parse(content);
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      'sessionId' in parsed &&
      Array.isArray(parsed.messages)
    );
  } catch {
    return false;
  }
}

/**
 * Parse a Gemini JSON string into a THINKT Session
 */
export function parseGeminiJson(content: string): ParseResult {
  try {
    const raw = JSON.parse(content) as RawGeminiSession;
    const entries: Entry[] = [];
    
    // Process each message
    for (const msg of raw.messages) {
      const timestamp = msg.timestamp ? new Date(msg.timestamp) : new Date();
      
      if (msg.type === 'user') {
        // User Message
        entries.push({
          uuid: msg.id ?? `msg-${Date.now()}-${Math.random()}`,
          role: 'user',
          source: 'gemini',
          timestamp,
          text: msg.content,
          contentBlocks: msg.content ? [{ type: 'text', text: msg.content }] : [],
        });
      } else if (msg.type === 'gemini') {
        // Assistant Message
        const contentBlocks: ContentBlock[] = [];
        
        // 1. Thoughts (Thinking Blocks)
        if (msg.thoughts) {
          for (const t of msg.thoughts) {
            contentBlocks.push({
              type: 'thinking',
              thinking: `[${t.subject}] ${t.description}`,
              // approximate duration if timestamps available?
            });
          }
        }
        
        // 2. Text Content
        if (msg.content) {
          contentBlocks.push({
            type: 'text',
            text: msg.content,
          });
        }
        
        // 3. Tool Calls
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            contentBlocks.push({
              type: 'tool_use',
              toolUseId: tc.id,
              toolName: tc.name,
              toolInput: tc.args,
            });
          }
        }

        const usage: TokenUsage | undefined = msg.tokens ? {
          inputTokens: msg.tokens.input,
          outputTokens: msg.tokens.output,
          thinkingTokens: msg.tokens.thoughts,
          serverToolUse: msg.tokens.tool,
        } : undefined;

        // Add Assistant Entry
        entries.push({
          uuid: msg.id ?? `msg-${Date.now()}-${Math.random()}`,
          role: 'assistant',
          source: 'gemini',
          timestamp,
          model: msg.model,
          usage,
          contentBlocks,
          text: msg.content, // Convenience field
        });

        // 4. Tool Results (Separate Entries)
        // Gemini nests results inside toolCalls, but THINKT expects separate entries
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            if (tc.result) {
              for (const res of tc.result) {
                // Extract output string
                let output = '';
                const responseMap = res.functionResponse.response;
                if (responseMap && 'output' in responseMap) {
                   const o = responseMap.output;
                   output = typeof o === 'string' ? o : JSON.stringify(o);
                } else {
                   output = JSON.stringify(responseMap);
                }

                entries.push({
                  uuid: res.functionResponse.id ?? `res-${Date.now()}-${Math.random()}`,
                  role: 'tool', // Maps to tool result
                  source: 'gemini',
                  timestamp, // Same timestamp as parent message for now
                  contentBlocks: [{
                    type: 'tool_result',
                    toolUseId: tc.id,
                    toolResult: output,
                    isError: false, // Gemini doesn't seem to explicitly flag errors in this struct
                  }],
                });
              }
            }
          }
        }
      }
    }

    const meta = extractSessionMeta(raw, entries);

    return {
      session: {
        meta,
        entries,
      },
    };

  } catch (err) {
    throw new ParseError(
      `Failed to parse Gemini JSON: ${err instanceof Error ? err.message : String(err)}`,
      undefined,
      'gemini'
    );
  }
}

/**
 * Extract metadata from session
 */
function extractSessionMeta(raw: RawGeminiSession, entries: Entry[]): SessionMeta {
  // Find first user prompt
  const firstUser = entries.find(e => e.role === 'user');
  const firstPrompt = firstUser?.text;

  // Calculate stats
  let totalInput = 0;
  let totalOutput = 0;
  
  for (const entry of entries) {
    if (entry.usage) {
      totalInput += entry.usage.inputTokens;
      totalOutput += entry.usage.outputTokens;
    }
  }

  const durationMs = raw.startTime && raw.lastUpdated 
    ? new Date(raw.lastUpdated).getTime() - new Date(raw.startTime).getTime()
    : undefined;

  return {
    id: raw.sessionId,
    source: 'gemini',
    title: firstPrompt ? (firstPrompt.slice(0, 50) + (firstPrompt.length > 50 ? '...' : '')) : 'Gemini Session',
    entryCount: entries.length,
    createdAt: raw.startTime ? new Date(raw.startTime) : undefined,
    modifiedAt: raw.lastUpdated ? new Date(raw.lastUpdated) : undefined,
    durationMs,
    totalUsage: {
      inputTokens: totalInput,
      outputTokens: totalOutput,
    },
    firstPrompt: firstPrompt?.slice(0, 200),
  };
}

// ============================================
// Parser Implementation
// ============================================

export function createGeminiParser(_options?: ParserOptions): Parser {
  return {
    source: 'gemini',

    canParse(content: unknown): boolean {
      return isGeminiJson(content);
    },

    parse(content: unknown): ParseResult {
      if (typeof content !== 'string') {
        throw new ParseError('Gemini parser expects string content');
      }
      return parseGeminiJson(content);
    },

    parseMetadata(content: unknown): SessionMeta {
      if (typeof content !== 'string') {
        throw new ParseError('Gemini parser expects string content');
      }
      // Since it's a single JSON object, we have to parse the whole thing anyway
      // Optimization: we could use a streaming JSON parser if files get huge
      const result = parseGeminiJson(content);
      return result.session.meta;
    },
  };
}

export const geminiParser = createGeminiParser();
