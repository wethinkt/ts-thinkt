/**
 * Turn Analysis Module
 *
 * Provides turn-based analysis of conversation sessions.
 * A "turn" represents a user message and its corresponding assistant response.
 *
 * This module is designed for:
 * - 3D visualization (cluster positioning)
 * - Search indexing
 * - Metrics calculation
 * - Conversation navigation
 *
 * @example
 * ```typescript
 * import { analyzeTurns, createTurnBuilder } from './thinkt/turn';
 *
 * const analysis = analyzeTurns(session);
 * console.log(`Found ${analysis.turns.length} turns`);
 *
 * // Build turns with custom strategy
 * const builder = createTurnBuilder('claude');
 * const turns = builder.build(session);
 * ```
 */

import type {
  Session,
  Entry,
  ContentBlock,
  TextBlock,
  Source,
} from './types';
import {
  isTextBlock,
} from './types';
import {
  getTextContent,
  getThinkingBlocks,
  getToolUseBlocks,
  getToolResultBlocks,
} from './entry';

// ============================================
// Core Turn Types
// ============================================

/**
 * A turn represents a user message and its assistant response.
 *
 * In a typical conversation:
 * - User sends a message
 * - Assistant responds (possibly with thinking, tool calls, etc.)
 *
 * This forms one "turn" in the conversation.
 */
export interface Turn {
  /** Zero-based index of this turn in the conversation */
  index: number;

  /** The user's message that initiated this turn */
  userEntry?: Entry;

  /** The assistant's response */
  assistantEntry?: Entry;

  /** All entries that belong to this turn (including tool results, etc.) */
  entries: Entry[];

  /** Whether this turn is expanded in the UI */
  expanded?: boolean;
}

/**
 * Enriched turn with computed metadata.
 * This is the primary interface for visualization and analysis.
 */
export interface TurnCluster extends Turn {
  /** Index in the session's turn array */
  index: number;

  /** Computed metrics for this turn */
  metrics: TurnMetrics;

  /** Whether this turn is from a sidechain (sub-agent) */
  isSidechain?: boolean;

  /** Agent ID if from a sub-agent */
  agentId?: string;

  /** Whether this turn has any errors */
  hasError?: boolean;

  /** Stop reason from the assistant (e.g., 'end_turn', 'max_tokens') */
  stopReason?: string;

  /** Document/media attachments in this turn */
  documentCount: number;
}

/**
 * Metrics computed from a turn's content
 */
export interface TurnMetrics {
  /** Total tokens (input + output) */
  totalTokens: number;

  /** Input tokens (from user message) */
  inputTokens: number;

  /** Output tokens (from assistant message) */
  outputTokens: number;

  /** Number of thinking blocks */
  thinkingCount: number;

  /** Number of tool calls made */
  toolUseCount: number;

  /** Number of tool results */
  toolResultCount: number;

  /** Total characters of text content */
  contentLength: number;

  /** Duration in milliseconds (if available) */
  durationMs?: number;
}

/**
 * Searchable content extracted from a turn.
 * Used for full-text search indexing.
 */
export interface SearchableTurn {
  /** Turn index */
  turnIndex: number;

  /** User message text */
  userText: string;

  /** Assistant response text */
  assistantText: string;

  /** Thinking content blocks */
  thinkingBlocks: Array<{
    text: string;
    durationMs?: number;
  }>;

  /** Tool calls made in this turn */
  toolUses: Array<{
    name: string;
    input: string;
    id: string;
  }>;

  /** Tool results received */
  toolResults: Array<{
    content: string;
    isError: boolean;
    durationMs?: number;
  }>;

  /** Document/media attachments */
  documents: Array<{
    mediaType: string;
    title?: string;
  }>;

  /** Whether from a sidechain */
  isSidechain?: boolean;

  /** Agent ID if from sub-agent */
  agentId?: string;

  /** Whether has errors */
  hasError?: boolean;

  /** Stop reason */
  stopReason?: string;
}

// ============================================
// Turn Building Strategy
// ============================================

/**
 * Strategy for building turns from session entries.
 *
 * Different sources may have different rules for:
 * - What constitutes a "turn"
 * - Which entries should be merged
 * - How to handle tool results
 */
export interface TurnBuildingStrategy {
  /** Strategy name */
  readonly name: string;

  /** Source this strategy applies to */
  readonly source: Source;

  /**
   * Determine if an entry should start a new turn.
   * @param entry The entry to check
   * @param previousEntry The previous entry in the sequence
   * @param hasCurrentTurn Whether there's already a current turn being built
   */
  isTurnBoundary(entry: Entry, previousEntry?: Entry, hasCurrentTurn?: boolean): boolean;

  /**
   * Determine if an entry should be absorbed into the previous turn
   * rather than starting a new one.
   *
   * This is used for:
   * - Tool result entries that belong to the previous assistant message
   * - System entries that are part of a turn
   *
   * @param entry The entry to check
   * @param currentTurn The turn being built
   */
  shouldAbsorbIntoPrevious(entry: Entry, currentTurn: Turn): boolean;

  /**
   * Determine if an entry should be skipped entirely.
   * @param entry The entry to check
   */
  shouldSkip(entry: Entry): boolean;

  /**
   * Merge entries when consecutive entries have the same role.
   * This combines their content blocks.
   *
   * @param entries Entries to potentially merge
   * @returns Merged entries
   */
  mergeConsecutiveEntries(entries: Entry[]): Entry[];
}

/**
 * Default turn building strategy.
 * Works for most conversation formats.
 */
export class DefaultTurnStrategy implements TurnBuildingStrategy {
  readonly name: string = 'default';
  readonly source: Source;

  constructor(source: Source = 'claude') {
    this.source = source;
  }

  isTurnBoundary(entry: Entry, previousEntry?: Entry, hasCurrentTurn = false): boolean {
    // User entries always start a new turn
    if (entry.role === 'user') {
      return true;
    }

    // If no previous entry, this starts a turn
    if (!previousEntry) {
      return true;
    }

    // Assistant following user: only starts new turn if we don't already have
    // a current turn with a user entry (handles orphan assistants)
    if (entry.role === 'assistant' && previousEntry.role === 'user') {
      return !hasCurrentTurn;
    }

    return false;
  }

  shouldAbsorbIntoPrevious(entry: Entry, _currentTurn: Turn): boolean {
    // Skip system entries, checkpoints
    if (entry.role === 'system' || entry.role === 'checkpoint' || entry.role === 'progress') {
      return true;
    }

    // Tool entries absorb into current turn
    if (entry.role === 'tool') {
      return true;
    }

    return false;
  }

  shouldSkip(entry: Entry): boolean {
    // Skip entries with no content at all
    const hasContent = entry.contentBlocks.length > 0 ||
                       (entry.text && entry.text.trim().length > 0) ||
                       Object.keys(entry.metadata || {}).length > 0;
    if (!hasContent) {
      return true;
    }

    return false;
  }

  mergeConsecutiveEntries(entries: Entry[]): Entry[] {
    if (entries.length === 0) return entries;

    const merged: Entry[] = [entries[0]];

    for (let i = 1; i < entries.length; i++) {
      const current = entries[i];
      const previous = merged[merged.length - 1];

      // Merge if same role and both are user or both are assistant
      if (current.role === previous.role && (current.role === 'user' || current.role === 'assistant')) {
        // Merge content blocks
        previous.contentBlocks = [...previous.contentBlocks, ...current.contentBlocks];

        // Merge text
        if (current.text) {
          previous.text = previous.text ? `${previous.text}\n${current.text}` : current.text;
        }

        // Merge usage (take the later one for assistant)
        if (current.usage) {
          previous.usage = current.usage;
        }
      } else {
        merged.push(current);
      }
    }

    return merged;
  }
}

/**
 * Claude Code specific strategy.
 * Handles tool_result-only user entries that should absorb into previous assistant.
 */
export class ClaudeTurnStrategy extends DefaultTurnStrategy {
  readonly name: string = 'claude';
  readonly source = 'claude' as const;

  shouldAbsorbIntoPrevious(entry: Entry, currentTurn: Turn): boolean {
    // First check parent class logic
    if (super.shouldAbsorbIntoPrevious(entry, currentTurn)) {
      return true;
    }

    // Claude-specific: tool_result-only user entries absorb into previous
    if (entry.role === 'user' && currentTurn.assistantEntry) {
      // Inline type guards to avoid import issues
      const isToolResult = (b: ContentBlock): boolean => b.type === 'tool_result';
      const isText = (b: ContentBlock): boolean => b.type === 'text';

      const hasOnlyToolResults = entry.contentBlocks.every(
        (b) => isToolResult(b) || (isText(b) && (b as TextBlock).text.trim() === '')
      );
      if (hasOnlyToolResults && entry.contentBlocks.some(isToolResult)) {
        return true;
      }
    }

    return false;
  }
}

/**
 * Kimi Code specific strategy.
 * Handles Kimi's tool call format.
 */
export class KimiTurnStrategy extends DefaultTurnStrategy {
  readonly name: string = 'kimi';
  readonly source = 'kimi' as const;

  shouldAbsorbIntoPrevious(entry: Entry, currentTurn: Turn): boolean {
    // Kimi uses 'tool' role for tool results
    if (entry.role === 'tool') {
      return true;
    }

    return super.shouldAbsorbIntoPrevious(entry, currentTurn);
  }
}

/**
 * Gemini specific strategy.
 */
export class GeminiTurnStrategy extends DefaultTurnStrategy {
  readonly name: string = 'gemini';
  readonly source = 'gemini' as const;

  shouldAbsorbIntoPrevious(entry: Entry, currentTurn: Turn): boolean {
    // Gemini uses 'tool' role for tool results
    if (entry.role === 'tool') {
      return true;
    }

    return super.shouldAbsorbIntoPrevious(entry, currentTurn);
  }
}

// ============================================
// Turn Builder
// ============================================

/**
 * Builder for constructing turns from session entries.
 */
export class TurnBuilder {
  private strategy: TurnBuildingStrategy;

  constructor(strategy?: TurnBuildingStrategy) {
    this.strategy = strategy ?? new DefaultTurnStrategy();
  }

  /**
   * Set the strategy to use for building turns.
   */
  setStrategy(strategy: TurnBuildingStrategy): this {
    this.strategy = strategy;
    return this;
  }

  /**
   * Build turns from a session.
   */
  build(session: Session): Turn[] {
    // Filter out skipped entries
    const entries = session.entries.filter((e) => !this.strategy.shouldSkip(e));

    // Merge consecutive entries of same role
    const mergedEntries = this.strategy.mergeConsecutiveEntries(entries);

    const turns: Turn[] = [];
    let currentTurn: Turn | null = null;

    for (let i = 0; i < mergedEntries.length; i++) {
      const entry = mergedEntries[i];

      // First, check if this should absorb into current turn
      if (currentTurn && this.strategy.shouldAbsorbIntoPrevious(entry, currentTurn)) {
        currentTurn.entries.push(entry);
        continue;
      }

      // Get previous entry that was NOT absorbed (for boundary detection)
      // This ensures we look at the actual turn structure, not the raw entry list
      const previousEntry = currentTurn && currentTurn.entries.length > 0
        ? currentTurn.entries[currentTurn.entries.length - 1]
        : undefined;

      // Check if this starts a new turn
      const hasCurrentTurn = currentTurn !== null && currentTurn.userEntry !== undefined;
      if (this.strategy.isTurnBoundary(entry, previousEntry, hasCurrentTurn)) {
        // Save previous turn
        if (currentTurn && currentTurn.entries.length > 0) {
          turns.push(currentTurn);
        }

        // Start new turn
        currentTurn = {
          index: turns.length,
          entries: [entry],
        };

        // Assign user/assistant
        if (entry.role === 'user') {
          currentTurn.userEntry = entry;
        } else if (entry.role === 'assistant') {
          currentTurn.assistantEntry = entry;
        }
      } else if (currentTurn) {
        // Add to current turn
        currentTurn.entries.push(entry);

        // Update user/assistant if not already set
        if (entry.role === 'assistant' && !currentTurn.assistantEntry) {
          currentTurn.assistantEntry = entry;
        }
      } else {
        // No current turn and not a boundary - create orphan turn
        currentTurn = {
          index: turns.length,
          entries: [entry],
        };
        if (entry.role === 'assistant') {
          currentTurn.assistantEntry = entry;
        }
      }
    }

    // Don't forget the last turn
    if (currentTurn && currentTurn.entries.length > 0) {
      turns.push(currentTurn);
    }

    return turns;
  }

  /**
   * Build enriched turn clusters with metadata.
   */
  buildClusters(session: Session): TurnCluster[] {
    const turns = this.build(session);

    return turns.map((turn, index) => {
      const metrics = this.computeMetrics(turn);

      return {
        ...turn,
        index,
        metrics,
        documentCount: this.countDocuments(turn),
        isSidechain: this.isSidechain(turn),
        agentId: this.getAgentId(turn),
        hasError: this.hasError(turn),
        stopReason: this.getStopReason(turn),
      };
    });
  }

  private computeMetrics(turn: Turn): TurnMetrics {
    const metrics: TurnMetrics = {
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      thinkingCount: 0,
      toolUseCount: 0,
      toolResultCount: 0,
      contentLength: 0,
    };

    // User entry metrics
    if (turn.userEntry) {
      if (turn.userEntry.usage) {
        metrics.inputTokens = turn.userEntry.usage.inputTokens;
      }
      metrics.contentLength += this.countContentLength(turn.userEntry);
    }

    // Assistant entry metrics
    if (turn.assistantEntry) {
      if (turn.assistantEntry.usage) {
        metrics.outputTokens = turn.assistantEntry.usage.outputTokens;
      }

      metrics.thinkingCount = getThinkingBlocks(turn.assistantEntry).length;
      metrics.toolUseCount = getToolUseBlocks(turn.assistantEntry).length;
      metrics.contentLength += this.countContentLength(turn.assistantEntry);
    }

    // Tool results from all entries
    for (const entry of turn.entries) {
      metrics.toolResultCount += getToolResultBlocks(entry).length;
    }

    metrics.totalTokens = metrics.inputTokens + metrics.outputTokens;

    return metrics;
  }

  private countContentLength(entry: Entry): number {
    return entry.contentBlocks
      .filter(isTextBlock)
      .reduce((sum, b) => sum + b.text.length, 0);
  }

  private countDocuments(turn: Turn): number {
    let count = 0;
    for (const entry of turn.entries) {
      for (const block of entry.contentBlocks) {
        if (block.type === 'image' || block.type === 'document') {
          count++;
        }
      }
    }
    return count;
  }

  private isSidechain(turn: Turn): boolean {
    return turn.entries.some((e) => e.isSidechain);
  }

  private getAgentId(turn: Turn): string | undefined {
    // Prefer assistant's agentId
    return turn.assistantEntry?.metadata?.agentId as string | undefined ??
           turn.userEntry?.metadata?.agentId as string | undefined;
  }

  private hasError(turn: Turn): boolean {
    // Check assistant entry for API errors
    if (turn.assistantEntry?.metadata?.error ||
        turn.assistantEntry?.metadata?.isApiErrorMessage) {
      return true;
    }

    // Check for tool result errors
    for (const entry of turn.entries) {
      if (getToolResultBlocks(entry).some((r) => r.isError)) {
        return true;
      }
    }

    return false;
  }

  private getStopReason(turn: Turn): string | undefined {
    return turn.assistantEntry?.metadata?.stopReason as string | undefined;
  }
}

// ============================================
// Searchable Content Extraction
// ============================================

/**
 * Extract searchable content from turns.
 */
export function extractSearchableContent(turns: Turn[]): SearchableTurn[] {
  return turns.map((turn, index) => {
    const searchable: SearchableTurn = {
      turnIndex: index,
      userText: '',
      assistantText: '',
      thinkingBlocks: [],
      toolUses: [],
      toolResults: [],
      documents: [],
      isSidechain: turn.entries.some((e) => e.isSidechain),
      agentId: turn.assistantEntry?.metadata?.agentId as string | undefined ??
               turn.userEntry?.metadata?.agentId as string | undefined,
      hasError: false,
      stopReason: turn.assistantEntry?.metadata?.stopReason as string | undefined,
    };

    // Extract user text
    if (turn.userEntry) {
      searchable.userText = getTextContent(turn.userEntry);
    }

    // Extract assistant content
    if (turn.assistantEntry) {
      searchable.assistantText = getTextContent(turn.assistantEntry);

      // Extract thinking blocks
      searchable.thinkingBlocks = getThinkingBlocks(turn.assistantEntry).map((b) => ({
        text: b.thinking,
        durationMs: b.durationMs,
      }));

      // Extract tool uses
      searchable.toolUses = getToolUseBlocks(turn.assistantEntry).map((b) => ({
        name: b.toolName,
        input: JSON.stringify(b.toolInput),
        id: b.toolUseId,
      }));
    }

    // Extract tool results from all entries
    for (const entry of turn.entries) {
      const results = getToolResultBlocks(entry);
      searchable.toolResults.push(...results.map((r) => ({
        content: r.toolResult,
        isError: r.isError,
        durationMs: r.durationMs,
      })));

      // Check for errors
      if (results.some((r) => r.isError)) {
        searchable.hasError = true;
      }
    }

    // Extract documents
    for (const entry of turn.entries) {
      for (const block of entry.contentBlocks) {
        if (block.type === 'image') {
          searchable.documents.push({
            mediaType: block.mediaType,
          });
        } else if (block.type === 'document') {
          searchable.documents.push({
            mediaType: block.mediaType,
            title: block.filename,
          });
        }
      }
    }

    return searchable;
  });
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a turn builder with the appropriate strategy for a source.
 */
export function createTurnBuilder(source: Source): TurnBuilder {
  switch (source) {
    case 'claude':
      return new TurnBuilder(new ClaudeTurnStrategy());
    case 'kimi':
      return new TurnBuilder(new KimiTurnStrategy());
    case 'gemini':
      return new TurnBuilder(new GeminiTurnStrategy());
    default:
      return new TurnBuilder(new DefaultTurnStrategy(source));
  }
}

/**
 * Analyze a session and return complete turn analysis.
 */
export interface TurnAnalysis {
  /** The turns in the session */
  turns: TurnCluster[];

  /** Searchable content for each turn */
  searchable: SearchableTurn[];

  /** Aggregate metrics */
  aggregateMetrics: {
    totalTurns: number;
    totalTokens: number;
    totalThinkingBlocks: number;
    totalToolUses: number;
    totalToolResults: number;
    userPromptCount: number;
    assistantResponseCount: number;
  };
}

/**
 * Perform complete turn analysis on a session.
 */
export function analyzeTurns(session: Session, source?: Source): TurnAnalysis {
  const detectedSource = source ?? session.meta.source;
  const builder = createTurnBuilder(detectedSource);

  const turns = builder.buildClusters(session);
  const searchable = extractSearchableContent(turns);

  // Calculate aggregate metrics
  const aggregateMetrics = {
    totalTurns: turns.length,
    totalTokens: turns.reduce((sum, t) => sum + t.metrics.totalTokens, 0),
    totalThinkingBlocks: turns.reduce((sum, t) => sum + t.metrics.thinkingCount, 0),
    totalToolUses: turns.reduce((sum, t) => sum + t.metrics.toolUseCount, 0),
    totalToolResults: turns.reduce((sum, t) => sum + t.metrics.toolResultCount, 0),
    userPromptCount: turns.filter((t) => t.userEntry).length,
    assistantResponseCount: turns.filter((t) => t.assistantEntry).length,
  };

  return {
    turns,
    searchable,
    aggregateMetrics,
  };
}

// ============================================
// Legacy Compatibility
// ============================================

/**
 * @deprecated Use TurnBuilder.build() instead
 */
export function groupEntriesByTurn(session: Session): Turn[] {
  const builder = createTurnBuilder(session.meta.source);
  return builder.build(session);
}
