/**
 * THINKT API Module
 *
 * Type-safe API client and bindings for the THINKT server.
 *
 * @example
 * ```typescript
 * import { createClient, type Project } from '@wethinkt/ts-thinkt/api';
 *
 * const client = createClient({ baseUrl: 'http://localhost:7433' });
 *
 * // List all projects
 * const projects = await client.getProjects();
 *
 * // Get sessions for a project
 * const sessions = await client.getSessions(projects[0].id);
 *
 * // Load a session with entries
 * const session = await client.getSession(sessions[0].full_path);
 * ```
 */

// Client and configuration
export {
  ThinktClient,
  ThinktAPIError,
  ThinktNetworkError,
  createClient,
  getDefaultClient,
  configureDefaultClient,
  resetDefaultClient,
} from './client';

// Types
export type {
  ThinktClientConfig,
  SessionResponse,
  Project,
  SessionMeta,
  Entry,
  ContentBlock,
  TokenUsage,
  Role,
  Source,
  APISourceInfo,
  ErrorResponse,
  APIPaths,
  APIComponents,
} from './client';

// Generated types (for advanced use cases)
export type { paths, components } from './generated';
