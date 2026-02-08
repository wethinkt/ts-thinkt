/**
 * High-Level THINKT Client
 *
 * Wraps the low-level ThinktApiClient and returns domain types (camelCase).
 * This is the recommended client for most consumers.
 *
 * For raw OpenAPI access, use ThinktApiClient directly or the `.api` property.
 */

import type { ThinktClientConfig, APISourceInfo, AppInfo } from './client';
import { ThinktApiClient } from './client';
import type { Project, SessionMeta, Entry } from '../types';
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
  async getSources(): Promise<APISourceInfo[]> {
    return this._api.getSources();
  }

  /** List all projects, optionally filtered by source */
  async getProjects(source?: string): Promise<Project[]> {
    const raw = await this._api.getProjects(source);
    return raw.map(convertApiProject);
  }

  /** List all sessions for a project */
  async getSessions(projectID: string): Promise<SessionMeta[]> {
    const raw = await this._api.getSessions(projectID);
    return raw.map(convertApiSessionMeta);
  }

  /** Get session content with entries (paginated) */
  async getSession(
    path: string,
    options?: { limit?: number; offset?: number },
  ): Promise<SessionResponse> {
    const raw = await this._api.getSession(path, options);
    return {
      meta: convertApiSessionMeta(raw.meta),
      entries: raw.entries.map(convertApiEntry),
      total: raw.total,
      hasMore: raw.has_more,
    };
  }

  /** Open a path in an external application */
  async openIn(app: string, path: string): Promise<void> {
    return this._api.openIn(app, path);
  }

  /** List allowed apps for the open-in feature */
  async getOpenInApps(): Promise<AppInfo[]> {
    return this._api.getOpenInApps();
  }

  /** Stream all entries from a session (handles pagination) */
  async *streamSessionEntries(
    path: string,
    chunkSize?: number,
  ): AsyncGenerator<Entry, void, unknown> {
    for await (const rawEntry of this._api.streamSessionEntries(path, chunkSize)) {
      yield convertApiEntry(rawEntry);
    }
  }

  /** Get all entries from a session (loads all pages) */
  async getAllSessionEntries(path: string, chunkSize?: number): Promise<Entry[]> {
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
