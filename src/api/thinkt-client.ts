/**
 * High-Level THINKT Client
 *
 * Wraps the low-level ThinktApiClient and returns domain types (camelCase).
 * This is the recommended client for most consumers.
 *
 * For raw OpenAPI access, use ThinktApiClient directly or the `.api` property.
 */

import type {
  ThinktClientConfig,
  SourceInfo,
  AllowedAppsResponse,
  SearchResponse,
  SearchOptions,
  SemanticSearchResponse,
  SemanticSearchOptions,
  IndexerStatusResponse,
  ResumeResponse,
  StatsResponse,
  ServerInfoResponse,
  Team,
  TeamMessage,
  TeamTask,
  ThemesResponse,
  SessionMetadataOptions,
  SessionMetadataResponse,
} from './client';
import { ThinktApiClient } from './client';
import type { Project, SessionMeta, Entry, Source } from '../types';
import {
  convertApiProject,
  convertApiSessionMeta,
  convertApiEntry,
} from './adapters';

// ============================================
// Types
// ============================================

/** Session response with domain types */
export interface SessionResponse {
  meta: SessionMeta;
  entries: Entry[];
  total: number;
  hasMore: boolean;
}

/** Metadata summary response with domain session meta and lightweight previews */
export interface SessionMetadataSummary {
  index?: number;
  role?: string;
  timestamp?: string;
  contentLength?: number;
  hasThinking?: boolean;
  hasToolUse?: boolean;
  hasToolResult?: boolean;
  preview?: string;
}

export interface SessionMetadataDomainResponse {
  meta: SessionMeta;
  description?: string;
  roleCounts: Record<string, number>;
  entrySummary: SessionMetadataSummary[];
  totalEntries: number;
  totalContentBytes: number;
  returnedSummaries: number;
}

function toDomainSource(source?: string): Source {
  if (source === 'thinkt') return 'thinkt';
  if (source === 'codex') return 'codex';
  if (source === 'copilot') return 'copilot';
  if (source === 'kimi') return 'kimi';
  if (source === 'gemini') return 'gemini';
  if (source === 'qwen') return 'qwen';
  return 'claude';
}

// ============================================
// Client
// ============================================

export class ThinktClient {
  private _api: ThinktApiClient;

  constructor(config?: Partial<ThinktClientConfig>) {
    this._api = new ThinktApiClient(config);
  }

  /** Access the low-level API client for raw OpenAPI responses */
  get api(): ThinktApiClient {
    return this._api;
  }

  setConfig(config: Partial<ThinktClientConfig>): void {
    this._api.setConfig(config);
  }

  getConfig(): Readonly<ThinktClientConfig> {
    return this._api.getConfig();
  }

  /** List available trace sources (Claude Code, Kimi Code, etc.) */
  async getSources(): Promise<SourceInfo[]> {
    return this._api.getSources();
  }

  /** List all projects, optionally filtered by source */
  async getProjects(source?: string, options?: { includeDeleted?: boolean; signal?: AbortSignal }): Promise<Project[]> {
    const raw = await this._api.getProjects(source, options);
    return raw.map(convertApiProject);
  }

  /** List all sessions for a project */
  async getSessions(projectID: string, source?: string, signal?: AbortSignal): Promise<SessionMeta[]> {
    const raw = await this._api.getSessions(projectID, source, signal);
    return raw.map(convertApiSessionMeta);
  }

  /** Get session content with entries (paginated) */
  async getSession(
    path: string,
    options?: { limit?: number; offset?: number; signal?: AbortSignal },
  ): Promise<SessionResponse> {
    const raw = await this._api.getSession(path, options);
    return {
      meta: convertApiSessionMeta(raw.meta),
      entries: raw.entries.map(convertApiEntry),
      total: raw.total,
      hasMore: raw.has_more,
    };
  }

  /** Get session metadata and lightweight previews */
  async getSessionMetadata(
    path: string,
    options?: SessionMetadataOptions,
  ): Promise<SessionMetadataDomainResponse> {
    const raw: SessionMetadataResponse = await this._api.getSessionMetadata(path, options);
    const rawMeta = raw.meta;
    const meta: SessionMeta = {
      id: rawMeta?.id ?? 'unknown',
      fullPath: rawMeta?.path,
      entryCount: raw.total_entries ?? 0,
      createdAt: rawMeta?.created_at ? new Date(rawMeta.created_at) : undefined,
      modifiedAt: rawMeta?.modified_at ? new Date(rawMeta.modified_at) : undefined,
      gitBranch: rawMeta?.git_branch,
      model: rawMeta?.model,
      source: toDomainSource(rawMeta?.source),
      title: rawMeta?.id ?? 'Session Metadata',
    };
    return {
      meta,
      description: raw.description,
      roleCounts: raw.role_counts ?? {},
      entrySummary: (raw.entry_summary ?? []).map((entry) => ({
        index: entry.index,
        role: entry.role,
        timestamp: entry.timestamp,
        contentLength: entry.content_length,
        hasThinking: entry.has_thinking,
        hasToolUse: entry.has_tool_use,
        hasToolResult: entry.has_tool_result,
        preview: entry.preview,
      })),
      totalEntries: raw.total_entries ?? 0,
      totalContentBytes: raw.total_content_bytes ?? 0,
      returnedSummaries: raw.returned_summaries ?? 0,
    };
  }

  /** Open a path in an external application */
  async openIn(app: string, path: string): Promise<void> {
    return this._api.openIn(app, path);
  }

  /** List allowed apps for the open-in feature */
  async getOpenInApps(): Promise<AllowedAppsResponse> {
    return this._api.getOpenInApps();
  }

  /** Search across indexed sessions */
  async search(options: SearchOptions): Promise<SearchResponse> {
    return this._api.search(options);
  }

  /** Semantic search across indexed sessions using embeddings */
  async semanticSearch(options: SemanticSearchOptions): Promise<SemanticSearchResponse> {
    return this._api.semanticSearch(options);
  }

  /** Get the resume command for a session */
  async getResumeCommand(path: string): Promise<ResumeResponse> {
    return this._api.getResumeCommand(path);
  }

  /** Execute the resume command for a session in the configured terminal */
  async execResumeSession(path: string): Promise<{ success: boolean; message?: string }> {
    return this._api.execResumeSession(path);
  }

  /** Get indexer health status */
  async getIndexerHealth(): Promise<Record<string, unknown>> {
    return this._api.getIndexerHealth();
  }

  /** Get indexer server status (sync/embedding progress, uptime, model info) */
  async getIndexerStatus(): Promise<IndexerStatusResponse> {
    return this._api.getIndexerStatus();
  }

  /** Get server info (fingerprint, version, uptime, auth status) */
  async getInfo(): Promise<ServerInfoResponse> {
    return this._api.getInfo();
  }

  /** Get index usage statistics */
  async getStats(): Promise<StatsResponse> {
    return this._api.getStats();
  }

  /** List all teams */
  async getTeams(): Promise<Team[]> {
    return this._api.getTeams();
  }

  /** Get team details including resolved member-to-session mappings */
  async getTeam(teamName: string): Promise<Team> {
    return this._api.getTeam(teamName);
  }

  /** List inbox messages for a specific team member */
  async getTeamMemberMessages(teamName: string, memberName: string): Promise<TeamMessage[]> {
    return this._api.getTeamMemberMessages(teamName, memberName);
  }

  /** List the shared task board for a team */
  async getTeamTasks(teamName: string): Promise<TeamTask[]> {
    return this._api.getTeamTasks(teamName);
  }

  /** List available themes (built-in and user themes) */
  async getThemes(): Promise<ThemesResponse> {
    return this._api.getThemes();
  }

  /** Stream all entries from a session (handles pagination) */
  async *streamSessionEntries(
    path: string,
    chunkSize?: number,
    signal?: AbortSignal,
  ): AsyncGenerator<Entry, void, unknown> {
    for await (const rawEntry of this._api.streamSessionEntries(path, chunkSize, signal)) {
      yield convertApiEntry(rawEntry);
    }
  }

  /** Get all entries from a session (loads all pages) */
  async getAllSessionEntries(path: string, chunkSize?: number, signal?: AbortSignal): Promise<Entry[]> {
    const entries: Entry[] = [];
    for await (const entry of this.streamSessionEntries(path, chunkSize, signal)) {
      entries.push(entry);
    }
    return entries;
  }

}

// ============================================
// Singleton Instance
// ============================================

let defaultClient: ThinktClient | null = null;

/** Get or create the default client instance */
export function getDefaultClient(): ThinktClient {
  if (!defaultClient) {
    defaultClient = new ThinktClient();
  }
  return defaultClient;
}

/** Configure the default client */
export function configureDefaultClient(config: Partial<ThinktClientConfig>): void {
  if (!defaultClient) {
    defaultClient = new ThinktClient(config);
  } else {
    defaultClient.setConfig(config);
  }
}

/** Reset the default client (useful for testing) */
export function resetDefaultClient(): void {
  defaultClient = null;
}

/** Create a new client with the given configuration */
export function createClient(config?: Partial<ThinktClientConfig>): ThinktClient {
  return new ThinktClient(config);
}
