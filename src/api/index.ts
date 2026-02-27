/**
 * THINKT API Module
 *
 * Type-safe API client and bindings for the THINKT server.
 *
 * @example
 * ```typescript
 * import { createClient, type Project } from '@wethinkt/ts-thinkt/api';
 *
 * const client = createClient({ baseUrl: 'http://localhost:8784' });
 *
 * // List all projects (returns domain types with camelCase fields)
 * const projects = await client.getProjects();
 *
 * // Get sessions for a project
 * const sessions = await client.getSessions(projects[0].id);
 *
 * // Load a session with entries
 * const { meta, entries, hasMore } = await client.getSession(sessions[0].fullPath!);
 *
 * // List available apps and open a path in one
 * const apps = await client.getOpenInApps();
 * await client.openIn('vscode', '/path/to/project');
 *
 * // For raw OpenAPI access, use the low-level client:
 * const rawProjects = await client.api.getProjects();
 * ```
 */

// High-level client (domain types — recommended)
export {
  ThinktClient,
  createClient,
  getDefaultClient,
  configureDefaultClient,
  resetDefaultClient,
} from './thinkt-client';

export type { SessionResponse } from './thinkt-client';

// Low-level API client (raw OpenAPI types)
export {
  ThinktApiClient,
  ThinktAPIError,
  ThinktNetworkError,
  createApiClient,
  getDefaultApiClient,
  configureDefaultApiClient,
  resetDefaultApiClient,
} from './client';

export type {
  ThinktClientConfig,
  ApiSessionResponse,
  SourceInfo,
  AppInfo,
  ErrorResponse,
  SearchResponse,
  SearchSessionResult,
  SearchMatch,
  SearchOptions,
  SemanticSearchResult,
  SemanticSearchResponse,
  SemanticSearchOptions,
  IndexerStatusResponse,
  IndexerStatusProgressInfo,
  ResumeResponse,
  StatsResponse,
  ServerInfoResponse,
  Team,
  TeamMember,
  TeamMessage,
  TeamStatus,
  TeamTask,
  TeamsResponse,
  TeamMessagesResponse,
  TeamTasksResponse,
  ThemeInfo,
  ThemeColors,
  ThemeStyle,
  ThemesResponse,
} from './client';

// Raw API types (for consumers who need OpenAPI-level access)
export type {
  Project as ApiProject,
  SessionMeta as ApiSessionMeta,
  Entry as ApiEntry,
  ContentBlock as ApiContentBlock,
  TokenUsage as ApiTokenUsage,
  Role as ApiRole,
  Source as ApiSource,
} from './client';

// Adapters (for manual conversion)
export {
  convertApiProject,
  convertApiSessionMeta,
  convertApiEntry,
  convertApiToSession,
  convertToApiEntry,
} from './adapters';

// Generated types (for advanced use cases)
export type { paths, components } from './generated';
