/**
 * Low-Level API Client Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ThinktApiClient,
  ThinktAPIError,
  ThinktNetworkError,
  createApiClient,
  getDefaultApiClient,
  resetDefaultApiClient,
  configureDefaultApiClient,
  type Entry,
} from '../api/client';

describe('ThinktApiClient', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    resetDefaultApiClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Configuration', () => {
    it('should create client with default config', () => {
      const client = new ThinktApiClient();
      const config = client.getConfig();

      expect(config.baseUrl).toBe('http://localhost:8784');
      expect(config.apiVersion).toBe('/api/v1');
      expect(config.timeout).toBe(30000);
    });

    it('should create client with custom config', () => {
      const client = new ThinktApiClient({
        baseUrl: 'http://example.com',
        apiVersion: '/api/v2',
        timeout: 5000,
      });
      const config = client.getConfig();

      expect(config.baseUrl).toBe('http://example.com');
      expect(config.apiVersion).toBe('/api/v2');
      expect(config.timeout).toBe(5000);
    });

    it('should update config with setConfig', () => {
      const client = new ThinktApiClient();
      client.setConfig({ baseUrl: 'http://updated.com' });

      expect(client.getConfig().baseUrl).toBe('http://updated.com');
    });
  });

  describe('getSources', () => {
    it('should fetch sources successfully', async () => {
      const mockSources = {
        sources: [
          { name: 'claude', base_path: '/path/to/claude', available: true },
          { name: 'kimi', base_path: '/path/to/kimi', available: true },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSources,
      });

      const client = new ThinktApiClient({ fetch: mockFetch });
      const sources = await client.getSources();

      expect(sources).toHaveLength(2);
      expect(sources[0].name).toBe('claude');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8784/api/v1/sources',
        expect.any(Object)
      );
    });

    it('should return empty array when no sources', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const client = new ThinktApiClient({ fetch: mockFetch });
      const sources = await client.getSources();

      expect(sources).toEqual([]);
    });
  });

  describe('getProjects', () => {
    it('should fetch all projects', async () => {
      const mockProjects = {
        projects: [
          { id: 'proj1', name: 'Project 1', path: '/path/1', session_count: 5 },
          { id: 'proj2', name: 'Project 2', path: '/path/2', session_count: 3 },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockProjects,
      });

      const client = new ThinktApiClient({ fetch: mockFetch });
      const projects = await client.getProjects();

      expect(projects).toHaveLength(2);
      expect(projects[0].id).toBe('proj1');
    });

    it('should fetch projects with source filter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ projects: [] }),
      });

      const client = new ThinktApiClient({ fetch: mockFetch });
      await client.getProjects('claude');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8784/api/v1/projects?source=claude',
        expect.any(Object)
      );
    });
  });

  describe('getSessions', () => {
    it('should fetch sessions for a project', async () => {
      const mockSessions = {
        sessions: [
          { id: 'sess1', first_prompt: 'Hello', entry_count: 10 },
          { id: 'sess2', first_prompt: 'World', entry_count: 5 },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSessions,
      });

      const client = new ThinktApiClient({ fetch: mockFetch });
      const sessions = await client.getSessions('my-project', 'claude');

      expect(sessions).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8784/api/v1/projects/claude/my-project/sessions',
        expect.any(Object)
      );
    });

    it('should URL-encode project ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessions: [] }),
      });

      const client = new ThinktApiClient({ fetch: mockFetch });
      await client.getSessions('path with spaces', 'kimi');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/projects/kimi/path%20with%20spaces/sessions'),
        expect.any(Object)
      );
    });
  });

  describe('getSession', () => {
    it('should fetch session with entries', async () => {
      const mockSession = {
        meta: { id: 'sess1', first_prompt: 'Test' },
        entries: [{ uuid: 'entry1', role: 'user' }],
        total: 1,
        has_more: false,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSession,
      });

      const client = new ThinktApiClient({ fetch: mockFetch });
      const session = await client.getSession('/path/to/session.json');

      expect(session.meta.id).toBe('sess1');
      expect(session.entries).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('path%2Fto%2Fsession.json'),
        expect.any(Object)
      );
    });

    it('should support pagination', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          meta: { id: 'sess1' },
          entries: [],
          total: 100,
          has_more: true,
        }),
      });

      const client = new ThinktApiClient({ fetch: mockFetch });
      await client.getSession('/path/to/session.json', { limit: 50, offset: 10 });

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain('limit=50');
      expect(callUrl).toContain('offset=10');
    });
  });

  describe('streamSessionEntries', () => {
    it('should stream all entries', async () => {
      const entry1 = { uuid: 'entry1', role: 'user' };
      const entry2 = { uuid: 'entry2', role: 'assistant' };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            meta: { id: 'sess1' },
            entries: [entry1],
            total: 2,
            has_more: true,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            meta: { id: 'sess1' },
            entries: [entry2],
            total: 2,
            has_more: false,
          }),
        });

      const client = new ThinktApiClient({ fetch: mockFetch });
      const entries: Entry[] = [];

      for await (const entry of client.streamSessionEntries('/path/to/session.json', 1)) {
        entries.push(entry);
      }

      expect(entries).toHaveLength(2);
      expect(entries[0].uuid).toBe('entry1');
      expect(entries[1].uuid).toBe('entry2');
    });
  });

  describe('getAllSessionEntries', () => {
    it('should return all entries as array', async () => {
      const entry1 = { uuid: 'entry1', role: 'user' };
      const entry2 = { uuid: 'entry2', role: 'assistant' };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            meta: { id: 'sess1' },
            entries: [entry1, entry2],
            total: 2,
            has_more: false,
          }),
        });

      const client = new ThinktApiClient({ fetch: mockFetch });
      const entries = await client.getAllSessionEntries('/path/to/session.json');

      expect(entries).toHaveLength(2);
    });
  });

  describe('getInfo', () => {
    it('should fetch server info successfully', async () => {
      const mockInfo = {
        authenticated: true,
        fingerprint: 'abc123',
        pid: 12345,
        revision: 'v1.0.0-deadbeef',
        started_at: '2026-02-27T00:00:00Z',
        uptime_seconds: 3600,
        version: '1.0.0',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockInfo,
      });

      const client = new ThinktApiClient({ fetch: mockFetch });
      const info = await client.getInfo();

      expect(info).toEqual(mockInfo);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8784/api/v1/info',
        expect.any(Object)
      );
    });
  });

  describe('semanticSearch', () => {
    it('should perform semantic search with all options', async () => {
      const mockResults = {
        results: [
          {
            session_id: 'sess1',
            entry_uuid: 'uuid1',
            chunk_index: 0,
            total_chunks: 1,
            distance: 0.15,
            role: 'assistant',
            project_name: 'my-project',
            source: 'claude',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResults,
      });

      const client = new ThinktApiClient({ fetch: mockFetch });
      const response = await client.semanticSearch({
        query: 'how to handle errors',
        project: 'my-project',
        source: 'claude',
        limit: 10,
        maxDistance: 0.5,
        diversity: true,
      });

      expect(response.results).toHaveLength(1);
      expect(response.results![0].session_id).toBe('sess1');

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain('/semantic-search');
      expect(callUrl).toContain('q=how+to+handle+errors');
      expect(callUrl).toContain('project=my-project');
      expect(callUrl).toContain('source=claude');
      expect(callUrl).toContain('limit=10');
      expect(callUrl).toContain('max_distance=0.5');
      expect(callUrl).toContain('diversity=true');
    });

    it('should perform semantic search with minimal options', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });

      const client = new ThinktApiClient({ fetch: mockFetch });
      const response = await client.semanticSearch({ query: 'test' });

      expect(response.results).toEqual([]);

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain('q=test');
      expect(callUrl).not.toContain('diversity');
    });
  });

  describe('Error Handling', () => {
    it('should throw ThinktAPIError on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Server Error', message: 'Something went wrong' }),
      });

      const client = new ThinktApiClient({ fetch: mockFetch });

      await expect(client.getSources()).rejects.toThrow(ThinktAPIError);

      // Reset mock for message check
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Server Error', message: 'Something went wrong' }),
      });

      await expect(client.getSources()).rejects.toThrow('Something went wrong');
    });

    it('should throw ThinktNetworkError on fetch failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      const client = new ThinktApiClient({ fetch: mockFetch });

      await expect(client.getSources()).rejects.toThrow(ThinktNetworkError);
    });

    it('should throw ThinktNetworkError on timeout', async () => {
      mockFetch.mockRejectedValueOnce((() => {
        const error = new Error('Timeout');
        error.name = 'AbortError';
        return error;
      })());

      const client = new ThinktApiClient({ fetch: mockFetch, timeout: 5 });

      await expect(client.getSources()).rejects.toThrow(ThinktNetworkError);
    });
  });
});

describe('createApiClient', () => {
  it('should create a new client instance', () => {
    const client = createApiClient({ baseUrl: 'http://custom' });
    expect(client.getConfig().baseUrl).toBe('http://custom');
  });
});

describe('getDefaultApiClient', () => {
  beforeEach(() => {
    resetDefaultApiClient();
  });

  it('should return same instance on multiple calls', () => {
    const client1 = getDefaultApiClient();
    const client2 = getDefaultApiClient();
    expect(client1).toBe(client2);
  });
});

describe('configureDefaultApiClient', () => {
  beforeEach(() => {
    resetDefaultApiClient();
  });

  it('should configure default client', () => {
    configureDefaultApiClient({ baseUrl: 'http://configured' });
    const client = getDefaultApiClient();
    expect(client.getConfig().baseUrl).toBe('http://configured');
  });
});
