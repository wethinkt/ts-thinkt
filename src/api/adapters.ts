/**
 * API Adapters
 *
 * Convert between THINKT API types (snake_case, from OpenAPI) and
 * domain types (camelCase, from types.ts).
 */

import type {
  Project as ApiProject,
  SessionMeta as ApiSessionMeta,
  Entry as ApiEntry,
  ContentBlock as ApiContentBlock,
} from './client';

import type {
  Project,
  SessionMeta,
  Entry,
  ContentBlock,
  Source,
  Role,
  Session,
} from '../types';

// ============================================
// Helpers
// ============================================

function convertSource(source: string | undefined): Source {
  if (source === 'thinkt') return 'thinkt';
  if (source === 'codex') return 'codex';
  if (source === 'copilot') return 'copilot';
  if (source === 'kimi') return 'kimi';
  if (source === 'gemini') return 'gemini';
  return 'claude';
}

function convertRole(role: string | undefined): Role {
  switch (role) {
    case 'user': return 'user';
    case 'assistant': return 'assistant';
    case 'tool': return 'tool';
    case 'system': return 'system';
    case 'summary': return 'summary';
    case 'progress': return 'progress';
    case 'checkpoint': return 'checkpoint';
    default: return 'assistant';
  }
}

function convertContentBlock(block: ApiContentBlock): ContentBlock {
  const type = block.type ?? 'text';

  switch (type) {
    case 'text':
      return { type: 'text', text: block.text ?? '' };

    case 'thinking':
      return {
        type: 'thinking',
        thinking: block.thinking ?? '',
        signature: block.signature,
      };

    case 'tool_use':
      return {
        type: 'tool_use',
        toolUseId: block.tool_use_id ?? '',
        toolName: block.tool_name ?? 'unknown',
        toolInput: block.tool_input as Record<string, unknown> ?? {},
      };

    case 'tool_result':
      return {
        type: 'tool_result',
        toolUseId: block.tool_use_id ?? '',
        toolResult: block.tool_result ?? '',
        isError: block.is_error ?? false,
      };

    case 'image':
      return {
        type: 'image',
        mediaType: block.media_type ?? 'image/png',
        mediaData: block.media_data ?? '',
      };

    case 'document':
      return {
        type: 'document',
        mediaType: block.media_type ?? 'application/pdf',
        mediaData: block.media_data ?? '',
        filename: undefined,
      };

    default:
      return { type: 'text', text: block.text ?? '' };
  }
}

function convertToApiContentBlock(block: ContentBlock): ApiContentBlock {
  const base: ApiContentBlock = { type: block.type };

  switch (block.type) {
    case 'text':
      base.text = block.text;
      break;
    case 'thinking':
      base.thinking = block.thinking;
      base.signature = block.signature;
      break;
    case 'tool_use':
      base.tool_use_id = block.toolUseId;
      base.tool_name = block.toolName;
      base.tool_input = block.toolInput;
      break;
    case 'tool_result':
      base.tool_use_id = block.toolUseId;
      base.tool_result = block.toolResult;
      base.is_error = block.isError;
      break;
    case 'image':
      base.media_type = block.mediaType;
      base.media_data = block.mediaData;
      break;
    case 'document':
      base.media_type = block.mediaType;
      base.media_data = block.mediaData;
      break;
  }

  return base;
}

// ============================================
// API → Domain
// ============================================

/** Convert an API Project to a domain Project */
export function convertApiProject(project: ApiProject): Project {
  return {
    id: project.id ?? '',
    name: project.name ?? '',
    path: project.path ?? '',
    displayPath: project.display_path,
    sessionCount: project.session_count ?? 0,
    lastModified: project.last_modified ? new Date(project.last_modified) : undefined,
    source: convertSource(project.source),
    workspaceId: project.workspace_id,
    sourceBasePath: project.source_base_path,
    pathExists: project.path_exists ?? true,
  };
}

/** Convert an API SessionMeta to a domain SessionMeta */
export function convertApiSessionMeta(meta: ApiSessionMeta): SessionMeta {
  return {
    id: meta.id ?? 'unknown',
    projectPath: meta.project_path,
    fullPath: meta.full_path,
    firstPrompt: meta.first_prompt,
    summary: meta.summary,
    entryCount: meta.entry_count ?? 0,
    fileSize: meta.file_size,
    createdAt: meta.created_at ? new Date(meta.created_at) : undefined,
    modifiedAt: meta.modified_at ? new Date(meta.modified_at) : undefined,
    gitBranch: meta.git_branch,
    model: meta.model,
    source: convertSource(meta.source),
    workspaceId: meta.workspace_id,
    chunkCount: meta.chunk_count,
    title: meta.first_prompt
      ? meta.first_prompt.slice(0, 60) + (meta.first_prompt.length > 60 ? '...' : '')
      : meta.id ?? 'Untitled Session',
  };
}

/** Convert an API Entry to a domain Entry */
export function convertApiEntry(entry: ApiEntry): Entry {
  const contentBlocks = entry.content_blocks?.map(convertContentBlock) ?? [];

  const metadata: Record<string, unknown> = {};
  if (entry.metadata) {
    Object.assign(metadata, entry.metadata);
  }
  if (entry.workspace_id) {
    metadata.workspaceId = entry.workspace_id;
  }

  return {
    uuid: entry.uuid ?? `entry-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    parentUuid: entry.parent_uuid ?? undefined,
    role: convertRole(entry.role),
    timestamp: entry.timestamp ? new Date(entry.timestamp) : new Date(),
    source: convertSource(entry.source),
    contentBlocks,
    text: entry.text ?? contentBlocks
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map(b => b.text)
      .join('\n'),
    model: entry.model,
    usage: entry.usage ? {
      inputTokens: entry.usage.input_tokens ?? 0,
      outputTokens: entry.usage.output_tokens ?? 0,
      cacheCreationInputTokens: entry.usage.cache_creation_input_tokens,
      cacheReadInputTokens: entry.usage.cache_read_input_tokens,
    } : undefined,
    gitBranch: entry.git_branch,
    cwd: entry.cwd,
    isCheckpoint: entry.is_checkpoint ?? false,
    isSidechain: entry.is_sidechain ?? false,
    agentId: entry.agent_id,
    sourceAgentId: entry.source_agent_id,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

/** Convert API SessionMeta + Entries to a domain Session */
export function convertApiToSession(meta: ApiSessionMeta, entries: ApiEntry[]): Session {
  return {
    meta: convertApiSessionMeta(meta),
    entries: entries.map(convertApiEntry),
  };
}

// ============================================
// Domain → API
// ============================================

/** Convert a domain Entry to an API Entry */
export function convertToApiEntry(entry: Entry): ApiEntry {
  return {
    uuid: entry.uuid,
    parent_uuid: entry.parentUuid,
    role: entry.role,
    timestamp: entry.timestamp.toISOString(),
    source: entry.source as ApiEntry['source'],
    content_blocks: entry.contentBlocks.map(convertToApiContentBlock),
    text: entry.text,
    model: entry.model,
    usage: entry.usage ? {
      input_tokens: entry.usage.inputTokens,
      output_tokens: entry.usage.outputTokens,
      cache_creation_input_tokens: entry.usage.cacheCreationInputTokens,
      cache_read_input_tokens: entry.usage.cacheReadInputTokens,
    } : undefined,
    git_branch: entry.gitBranch,
    cwd: entry.cwd,
    is_checkpoint: entry.isCheckpoint,
    is_sidechain: entry.isSidechain,
    agent_id: entry.agentId,
    source_agent_id: entry.sourceAgentId,
    workspace_id: entry.metadata?.workspaceId as string | undefined,
    metadata: entry.metadata,
  };
}
