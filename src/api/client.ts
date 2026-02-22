/**
 * THINKT API Client
 *
 * A type-safe HTTP client for the THINKT API.
 * Uses fetch with proper typing from OpenAPI generated types.
 */

import type { paths, components } from './generated';

// ============================================
// Type Exports
// ============================================

export type Project = components['schemas']['thinkt.Project'];
export type SessionMeta = components['schemas']['thinkt.SessionMeta'];
export type Entry = components['schemas']['thinkt.Entry'];
export type ContentBlock = components['schemas']['thinkt.ContentBlock'];
export type TokenUsage = components['schemas']['thinkt.TokenUsage'];
export type Role = components['schemas']['thinkt.Role'];
export type Source = components['schemas']['thinkt.Source'];
export type SourceInfo = components['schemas']['server.SourceInfo'];
export type AppInfo = components['schemas']['config.AppInfo'];
export type ErrorResponse = components['schemas']['server.ErrorResponse'];
export type SessionMetadataResponse = components['schemas']['server.SessionMetadataResponse'];

export interface ApiSessionResponse {
  meta: SessionMeta;
  entries: Entry[];
  total: number;
  has_more: boolean;
}

export interface SessionMetadataOptions {
  /** Maximum summaries/previews to return */
  limit?: number;
  /** Number of summaries/previews to skip */
  offset?: number;
  /** Roles to exclude from summaries */
  excludeRoles?: string[];
  /** Return lightweight user-message previews only */
  summaryOnly?: boolean;
  /** Summary ordering: index (default) or length */
  sortBy?: 'index' | 'length';
}

// ============================================
// Search Types
// ============================================

export type SearchMatch = components['schemas']['server.SearchMatch'];
export type SearchSessionResult = components['schemas']['server.SearchSessionResult'];
export type SearchResponse = components['schemas']['server.SearchResponse'];

// ============================================
// Resume Types
// ============================================

export type ResumeResponse = components['schemas']['server.ResumeResponse'];

// ============================================
// Stats Types
// ============================================

export type StatsResponse = components['schemas']['server.StatsResponse'];

// ============================================
// Team Types
// ============================================

export type Team = components['schemas']['thinkt.Team'];
export type TeamMember = components['schemas']['thinkt.TeamMember'];
export type TeamMessage = components['schemas']['thinkt.TeamMessage'];
export type TeamStatus = components['schemas']['thinkt.TeamStatus'];
export type TeamTask = components['schemas']['thinkt.TeamTask'];
export type TeamsResponse = components['schemas']['server.TeamsResponse'];
export type TeamMessagesResponse = components['schemas']['server.TeamMessagesResponse'];
export type TeamTasksResponse = components['schemas']['server.TeamTasksResponse'];

// ============================================
// Theme Types
// ============================================

export type ThemeInfo = components['schemas']['server.ThemeInfo'];
export type ThemeColors = components['schemas']['server.ThemeColors'];
export type ThemeStyle = components['schemas']['server.ThemeStyle'];
export type ThemesResponse = components['schemas']['server.ThemesResponse'];

/** Options for searching sessions */
export interface SearchOptions {
  /** Search query text */
  query: string;
  /** Filter by project name (substring match) */
  project?: string;
  /** Filter by source (claude, kimi) */
  source?: string;
  /** Maximum total matches (default 50) */
  limit?: number;
  /** Maximum matches per session (default 2, 0 for no limit) */
  limitPerSession?: number;
  /** Enable case-sensitive matching (default false) */
  caseSensitive?: boolean;
  /** Treat query as a regular expression (default false) */
  regex?: boolean;
}

// ============================================
// Error Types
// ============================================

export class ThinktAPIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public response?: ErrorResponse
  ) {
    super(message);
    this.name = 'ThinktAPIError';
  }
}

export class ThinktNetworkError extends Error {
  constructor(message: string, public originalError: unknown) {
    super(message);
    this.name = 'ThinktNetworkError';
  }
}

// ============================================
// Client Configuration
// ============================================

export interface ThinktClientConfig {
  /** Base URL of the THINKT API server (default: http://localhost:7433) */
  baseUrl: string;
  /** API version path (default: /api/v1) */
  apiVersion: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout: number;
  /** Optional bearer token for API authentication */
  token?: string;
  /** Optional custom fetch implementation */
  fetch?: typeof fetch;
}

const DEFAULT_CONFIG: ThinktClientConfig = {
  baseUrl: 'http://localhost:7433',
  apiVersion: '/api/v1',
  timeout: 30000,
};

// ============================================
// URL Builder
// ============================================

function buildUrl(
  baseUrl: string,
  apiVersion: string,
  path: string,
  params?: Record<string, string | number | undefined>
): string {
  let url = `${baseUrl}${apiVersion}${path}`;

  if (params && Object.keys(params).length > 0) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  return url;
}

// ============================================
// API Client
// ============================================

export class ThinktApiClient {
  private config: ThinktClientConfig;

  constructor(config?: Partial<ThinktClientConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update client configuration
   */
  setConfig(config: Partial<ThinktClientConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<ThinktClientConfig> {
    return { ...this.config };
  }

  // ============================================
  // Private Helpers
  // ============================================

  private async fetchWithTimeout<T>(
    url: string,
    options: RequestInit = {}
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    const fetchImpl = this.config.fetch ?? fetch;

    try {
      const authHeaders: Record<string, string> = {};
      if (this.config.token) {
        authHeaders['Authorization'] = `Bearer ${this.config.token}`;
      }

      const response = await fetchImpl(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          ...authHeaders,
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorResponse: ErrorResponse | undefined;
        try {
          errorResponse = await response.json() as ErrorResponse;
        } catch {
          // Ignore parsing errors
        }
        throw new ThinktAPIError(
          errorResponse?.message || `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          errorResponse
        );
      }

      return await response.json() as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof ThinktAPIError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new ThinktNetworkError(`Request timeout after ${this.config.timeout}ms`, error);
      }

      throw new ThinktNetworkError(
        error instanceof Error ? error.message : 'Network error',
        error
      );
    }
  }

  // ============================================
  // API Methods: Sources
  // ============================================

  /**
   * List all available trace sources (e.g., Claude Code, Kimi Code)
   *
   * GET /sources
   */
  async getSources(): Promise<SourceInfo[]> {
    type Response = paths['/sources']['get']['responses'][200]['content']['application/json'];
    const url = buildUrl(this.config.baseUrl, this.config.apiVersion, '/sources');
    const response = await this.fetchWithTimeout<Response>(url);
    return response.sources ?? [];
  }

  // ============================================
  // API Methods: Projects
  // ============================================

  /**
   * List all projects, optionally filtered by source
   *
   * GET /projects?source={source}
   */
  async getProjects(source?: string, options?: { includeDeleted?: boolean }): Promise<Project[]> {
    type Response = paths['/projects']['get']['responses'][200]['content']['application/json'];
    const url = buildUrl(this.config.baseUrl, this.config.apiVersion, '/projects', {
      source,
      include_deleted: options?.includeDeleted ? 'true' : undefined,
    });
    const response = await this.fetchWithTimeout<Response>(url);
    return response.projects ?? [];
  }

  // ============================================
  // API Methods: Sessions
  // ============================================

  /**
   * List all sessions for a specific project
   *
   * GET /projects/{source}/{projectID}/sessions
   */
  async getSessions(projectID: string, source?: string): Promise<SessionMeta[]> {
    type Response = { sessions?: SessionMeta[] };
    const encodedProjectID = encodeURIComponent(projectID);
    const normalizedSource = source?.trim().toLowerCase();
    const path = normalizedSource
      ? `/projects/${encodeURIComponent(normalizedSource)}/${encodedProjectID}/sessions`
      : `/projects/${encodedProjectID}/sessions`;
    const url = buildUrl(
      this.config.baseUrl,
      this.config.apiVersion,
      path,
    );
    const response = await this.fetchWithTimeout<Response>(url);
    return response.sessions ?? [];
  }

  /**
   * Get session content with entries
   *
   * GET /sessions/{path}?limit={limit}&offset={offset}
   */
  async getSession(
    path: string,
    options?: { limit?: number; offset?: number }
  ): Promise<ApiSessionResponse> {
    type Response = paths['/sessions/{path}']['get']['responses'][200]['content']['application/json'];
    const encodedPath = encodeURIComponent(path);
    const url = buildUrl(
      this.config.baseUrl,
      this.config.apiVersion,
      `/sessions/${encodedPath}`,
      { limit: options?.limit, offset: options?.offset }
    );
    const response = await this.fetchWithTimeout<Response>(url);

    return {
      meta: response.meta!,
      entries: response.entries ?? [],
      total: response.total ?? 0,
      has_more: response.has_more ?? false,
    };
  }

  /**
   * Get session metadata and previews (without full entry payloads)
   *
   * GET /sessions/{path}/metadata
   */
  async getSessionMetadata(
    path: string,
    options?: SessionMetadataOptions
  ): Promise<SessionMetadataResponse> {
    type Response = paths['/sessions/{path}/metadata']['get']['responses'][200]['content']['application/json'];
    const encodedPath = encodeURIComponent(path);
    const params: Record<string, string | number | undefined> = {
      limit: options?.limit,
      offset: options?.offset,
      sort_by: options?.sortBy,
    };
    if (options?.excludeRoles && options.excludeRoles.length > 0) {
      params.exclude_roles = options.excludeRoles.join(',');
    }
    if (options?.summaryOnly !== undefined) {
      params.summary_only = options.summaryOnly ? 'true' : 'false';
    }

    const url = buildUrl(
      this.config.baseUrl,
      this.config.apiVersion,
      `/sessions/${encodedPath}/metadata`,
      params
    );
    return await this.fetchWithTimeout<Response>(url);
  }

  /**
   * Open a path in an external application
   *
   * POST /api/open-in
   * Body: { app: string, path: string }
   */
  async openIn(app: string, path: string): Promise<void> {
    const url = buildUrl(this.config.baseUrl, this.config.apiVersion, '/open-in');
    
    const response = await this.fetchWithTimeout<{ success?: boolean; error?: string }>(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ app, path }),
    });

    if (response.error) {
      throw new Error(response.error);
    }
  }

  /**
   * List allowed apps for the open-in feature
   *
   * GET /open-in/apps
   */
  async getOpenInApps(): Promise<AppInfo[]> {
    type Response = paths['/open-in/apps']['get']['responses'][200]['content']['application/json'];
    const url = buildUrl(this.config.baseUrl, this.config.apiVersion, '/open-in/apps');
    const response = await this.fetchWithTimeout<Response>(url);
    return response.apps ?? [];
  }

  /**
   * Search across indexed sessions
   *
   * GET /search?q={query}&project={project}&source={source}&limit={limit}&limit_per_session={limit_per_session}&case_sensitive={case_sensitive}&regex={regex}
   */
  async search(options: SearchOptions): Promise<SearchResponse> {
    const params: Record<string, string | number | undefined> = {
      q: options.query,
      project: options.project,
      source: options.source,
      limit: options.limit,
      limit_per_session: options.limitPerSession,
    };
    // Add boolean params only when true
    if (options.caseSensitive) {
      params.case_sensitive = 'true';
    }
    if (options.regex) {
      params.regex = 'true';
    }
    const url = buildUrl(
      this.config.baseUrl,
      this.config.apiVersion,
      '/search',
      params
    );
    return await this.fetchWithTimeout<SearchResponse>(url);
  }

  /**
   * Get the resume command for a session
   *
   * GET /sessions/{path}/resume
   */
  async getResumeCommand(path: string): Promise<ResumeResponse> {
    const encodedPath = encodeURIComponent(path);
    const url = buildUrl(
      this.config.baseUrl,
      this.config.apiVersion,
      `/sessions/${encodedPath}/resume`
    );
    return await this.fetchWithTimeout<ResumeResponse>(url);
  }

  /**
   * Execute the resume command for a session in a terminal
   *
   * GET /sessions/{path}/resume?action=exec
   */
  async execResumeSession(path: string): Promise<{ success: boolean; message?: string }> {
    const encodedPath = encodeURIComponent(path);
    const url = buildUrl(
      this.config.baseUrl,
      this.config.apiVersion,
      `/sessions/${encodedPath}/resume?action=exec`
    );
    return await this.fetchWithTimeout<{ success: boolean; message?: string }>(url);
  }

  /**
   * Get indexer health status
   *
   * GET /indexer/health
   */
  async getIndexerHealth(): Promise<Record<string, unknown>> {
    const url = buildUrl(this.config.baseUrl, this.config.apiVersion, '/indexer/health');
    return await this.fetchWithTimeout<Record<string, unknown>>(url);
  }

  /**
   * Get index usage statistics
   *
   * GET /stats
   */
  async getStats(): Promise<StatsResponse> {
    const url = buildUrl(this.config.baseUrl, this.config.apiVersion, '/stats');
    return await this.fetchWithTimeout<StatsResponse>(url);
  }

  // ============================================
  // API Methods: Teams
  // ============================================

  /**
   * List all teams
   *
   * GET /teams
   */
  async getTeams(): Promise<Team[]> {
    type Response = paths['/teams']['get']['responses'][200]['content']['application/json'];
    const url = buildUrl(this.config.baseUrl, this.config.apiVersion, '/teams');
    const response = await this.fetchWithTimeout<Response>(url);
    return response.teams ?? [];
  }

  /**
   * Get team details including resolved member-to-session mappings
   *
   * GET /teams/{teamName}
   */
  async getTeam(teamName: string): Promise<Team> {
    type Response = paths['/teams/{teamName}']['get']['responses'][200]['content']['application/json'];
    const encodedName = encodeURIComponent(teamName);
    const url = buildUrl(this.config.baseUrl, this.config.apiVersion, `/teams/${encodedName}`);
    return await this.fetchWithTimeout<Response>(url);
  }

  /**
   * List inbox messages for a specific team member
   *
   * GET /teams/{teamName}/members/{memberName}/messages
   */
  async getTeamMemberMessages(teamName: string, memberName: string): Promise<TeamMessage[]> {
    type Response = paths['/teams/{teamName}/members/{memberName}/messages']['get']['responses'][200]['content']['application/json'];
    const encodedTeam = encodeURIComponent(teamName);
    const encodedMember = encodeURIComponent(memberName);
    const url = buildUrl(
      this.config.baseUrl,
      this.config.apiVersion,
      `/teams/${encodedTeam}/members/${encodedMember}/messages`
    );
    const response = await this.fetchWithTimeout<Response>(url);
    return response.messages ?? [];
  }

  /**
   * List the shared task board for a team
   *
   * GET /teams/{teamName}/tasks
   */
  async getTeamTasks(teamName: string): Promise<TeamTask[]> {
    type Response = paths['/teams/{teamName}/tasks']['get']['responses'][200]['content']['application/json'];
    const encodedName = encodeURIComponent(teamName);
    const url = buildUrl(this.config.baseUrl, this.config.apiVersion, `/teams/${encodedName}/tasks`);
    const response = await this.fetchWithTimeout<Response>(url);
    return response.tasks ?? [];
  }

  // ============================================
  // API Methods: Themes
  // ============================================

  /**
   * List available themes (built-in and user themes)
   *
   * GET /themes
   */
  async getThemes(): Promise<ThemesResponse> {
    type Response = paths['/themes']['get']['responses'][200]['content']['application/json'];
    const url = buildUrl(this.config.baseUrl, this.config.apiVersion, '/themes');
    return await this.fetchWithTimeout<Response>(url);
  }

  /**
   * Stream all entries from a session (handles pagination automatically)
   */
  async *streamSessionEntries(path: string, chunkSize = 100): AsyncGenerator<Entry, void, unknown> {
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const response = await this.getSession(path, { limit: chunkSize, offset });

      for (const entry of response.entries) {
        yield entry;
      }

      hasMore = response.has_more;
      offset += response.entries.length;

      // Safety check to prevent infinite loops
      if (response.entries.length === 0) {
        break;
      }
    }
  }

  /**
   * Get all entries from a session (loads all pages)
   *
   * Note: For large sessions, consider using streamSessionEntries instead
   */
  async getAllSessionEntries(path: string, chunkSize = 100): Promise<Entry[]> {
    const entries: Entry[] = [];
    for await (const entry of this.streamSessionEntries(path, chunkSize)) {
      entries.push(entry);
    }
    return entries;
  }
}

// ============================================
// Singleton Instance
// ============================================

let defaultApiClient: ThinktApiClient | null = null;

/**
 * Get or create the default low-level API client instance
 */
export function getDefaultApiClient(): ThinktApiClient {
  if (!defaultApiClient) {
    defaultApiClient = new ThinktApiClient();
  }
  return defaultApiClient;
}

/**
 * Configure the default low-level API client
 */
export function configureDefaultApiClient(config: Partial<ThinktClientConfig>): void {
  if (!defaultApiClient) {
    defaultApiClient = new ThinktApiClient(config);
  } else {
    defaultApiClient.setConfig(config);
  }
}

/**
 * Reset the default low-level client (useful for testing)
 */
export function resetDefaultApiClient(): void {
  defaultApiClient = null;
}

/**
 * Create a new low-level API client with the given configuration
 */
export function createApiClient(config?: Partial<ThinktClientConfig>): ThinktApiClient {
  return new ThinktApiClient(config);
}

// Re-export types for convenience
export type { paths as APIPaths, components as APIComponents } from './generated';
