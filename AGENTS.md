# AGENTS.md - ts-thinkt

This document provides context for AI agents working on the **ts-thinkt** project.

## Project Overview

**ts-thinkt** is a TypeScript library for parsing and working with LLM conversation traces from multiple sources (Claude, Codex, Copilot, Gemini, Kimi, Qwen). It provides:

- **Object Model**: Type-safe representation of conversations, entries, and content blocks
- **Parsers**: Parse JSONL files from Claude Code, Kimi, and Gemini
- **API Client**: Two-layer type-safe HTTP client for the go-thinkt API server (high-level domain types + low-level OpenAPI)
- **Search**: Full-text and semantic (embedding-based) search across indexed sessions
- **Turn Analysis**: Group entries into logical conversation turns for visualization
- **Team Introspection**: Browse teams, member messages, and task boards
- **Session Resume**: Get resume commands and execute them in configured terminals
- **Themes**: List built-in and user-defined themes

## Architecture

```
src/
├── index.ts           # Main entry point - exports everything
├── types.ts           # Core type definitions (Entry, Session, ContentBlock, etc.)
├── entry.ts           # Entry helper functions (content extraction, queries)
├── session.ts         # Session helper functions (entry queries, statistics)
├── turn.ts            # Turn analysis (TurnBuilder, strategies, clustering)
├── parsers/           # Parser implementations
│   ├── index.ts       # Parser registry and exports
│   ├── types.ts       # Parser interface definitions
│   ├── claude.ts      # Claude Code JSONL parser
│   ├── kimi.ts        # Kimi JSONL parser
│   └── gemini.ts      # Gemini JSONL parser
├── api/               # API client (two layers)
│   ├── index.ts         # API module exports
│   ├── thinkt-client.ts # ThinktClient — high-level, returns domain types (camelCase)
│   ├── client.ts        # ThinktApiClient — low-level, returns raw OpenAPI types (snake_case)
│   ├── adapters.ts      # snake_case ↔ camelCase conversion between API and domain types
│   └── generated.ts     # OpenAPI-generated types (auto-generated from swagger.json)
└── __tests__/         # Test files (mirror source structure)
```

### Module Relationships

```
index.ts (public API)
    ├── types.ts (core types, type guards)
    ├── entry.ts (entry helpers)
    ├── session.ts (session helpers)
    ├── turn.ts (turn analysis)
    ├── parsers/ (parser registry + implementations)
    └── api/ (two-layer HTTP client + adapters)
```

## Coding Conventions

### TypeScript Configuration

- **Target**: ES2022
- **Module**: ESNext with bundler resolution
- **Strict mode**: Enabled
- **Declaration files**: Generated with source maps

### Code Style

1. **Use explicit return types** for public API functions
2. **Prefer type guards** over casting (use `isTextBlock()`, `isThinkingBlock()`, etc.)
3. **Use optional chaining** and nullish coalescing
4. **Document with JSDoc**: All public functions should have JSDoc comments
5. **Immutability**: Prefer returning new objects over mutation

### Naming Conventions

- **Files**: kebab-case (e.g., `client.test.ts`)
- **Types/Interfaces**: PascalCase (e.g., `SessionMeta`, `ContentBlock`)
- **Functions**: camelCase (e.g., `getTextContent`, `analyzeTurns`)
- **Constants**: UPPER_SNAKE_CASE for true constants
- **Private methods**: Prefix with underscore or use `private` keyword

## Build & Development Commands

```bash
# Build (lint + compile)
npm run build

# Fast build (skip lint)
npm run build:fast

# Run tests in watch mode
npm test

# Run tests once
npm run test:run

# Run tests with coverage
npm run test:coverage

# Lint
npm run lint
npm run lint:fix

# Type check only
npm run typecheck

# API generation (from Swagger/OpenAPI)
npm run api:convert     # Convert swagger.json to openapi.json
npm run api:generate    # Generate TypeScript types from OpenAPI
```

## Key Design Decisions

### 1. Entry Provenance (Multi-Agent Support)

Entries include agent provenance fields for multi-agent/team sessions:

```typescript
interface Entry {
  // ... other fields ...
  
  /** Resolved agent name (e.g., "researcher") */
  agentId?: string;
  
  /** Raw source identifier (e.g., "ab17e07") for correlation */
  sourceAgentId?: string;
}
```

Helper functions provide type-safe access:
- `hasAgent(entry)` - Check if entry has agent attribution
- `getAgentId(entry)` - Get resolved agent name
- `hasSourceAgent(entry)` - Check if raw source ID exists
- `getSourceAgentId(entry)` - Get raw source identifier
- `isFromAgent(entry)` - Check if from any agent context

These are exported from the main package:
```typescript
import { hasAgent, getAgentId, isFromAgent } from '@wethinkt/ts-thinkt';
```

### 2. Project Path Tracking

Projects track path existence and storage location:

```typescript
interface Project {
  // ... other fields ...
  
  /** Root storage path (e.g., ~/.claude or ~/.kimi) */
  sourceBasePath?: string;
  
  /** Whether the project directory still exists */
  pathExists?: boolean;
}
```

### 3. Content Block Model

All entry content is stored as an array of `ContentBlock` objects:

```typescript
interface ContentBlockBase {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'image' | 'document';
}
```

This unified model supports multiple LLM formats without losing information.

### 4. Parser Registry Pattern

Parsers are registered in a central `ParserRegistry`. Auto-detection selects the appropriate parser based on content format.

```typescript
const session = parse(jsonlContent);  // Auto-detects source
```

### 5. Turn Analysis Strategy Pattern

Different sources have different conversation structures. The `TurnBuildingStrategy` interface allows source-specific turn grouping:

- `DefaultTurnStrategy`: Generic turn detection
- `ClaudeTurnStrategy`: Handles Claude's tool_result-in-user format
- `KimiTurnStrategy`: Handles Kimi's tool role format
- `GeminiTurnStrategy`: Handles Gemini's format

### 6. Two-Layer API Client

The API module provides two client layers:

- **`ThinktClient`** (high-level, recommended) — wraps the low-level client and returns camelCase domain types (`Project`, `SessionMeta`, `Entry`). Exposes `.api` property for raw access.
- **`ThinktApiClient`** (low-level) — thin fetch wrapper returning raw OpenAPI snake_case types. Uses OpenAPI-generated types for type safety.
- **`adapters.ts`** — bidirectional conversion between API wire format (snake_case) and domain types (camelCase). Used internally by `ThinktClient`; also exported for manual use.

Both layers support:
- Fetch-based HTTP with timeout support
- AbortSignal for cancellable requests
- Bearer token authentication
- Streaming generators for paginated data
- Custom error types (`ThinktAPIError`, `ThinktNetworkError`)
- Singleton pattern via `configureDefaultClient()` / `configureDefaultApiClient()`

### API Client Methods

The high-level `ThinktClient` exposes:

| Category | Methods |
|----------|---------|
| Sources | `getSources()` |
| Projects | `getProjects(source?, options?)` |
| Sessions | `getSessions(projectID, source?, signal?)`, `getSession(path, options?)`, `getSessionMetadata(path, options?)`, `streamSessionEntries(path, chunkSize?, signal?)`, `getAllSessionEntries(path, chunkSize?, signal?)` |
| Search | `search(options)`, `semanticSearch(options)` |
| Resume | `getResumeCommand(path)`, `execResumeSession(path)` |
| Indexer | `getIndexerHealth()`, `getIndexerStatus()`, `getStats()` |
| Teams | `getTeams()`, `getTeam(teamName)`, `getTeamMemberMessages(teamName, memberName)`, `getTeamTasks(teamName)` |
| Open-in | `getOpenInApps()`, `openIn(app, path)` |
| Themes | `getThemes()` |

## Extending the Library

### Adding a New Parser

1. Create parser in `src/parsers/{name}.ts`:

```typescript
import type { Parser, ParseResult } from './types';

export const myParser: Parser = {
  source: 'my-source' as const,
  canParse: (content) => { /* detection logic */ },
  parse: (content, filename) => { /* parsing logic */ },
  parseMetadata: (content, filename) => { /* metadata only */ },
};
```

2. Register in `src/parsers/index.ts`:

```typescript
import { myParser } from './my-source';

// In ParserRegistry constructor:
this.register(myParser);
```

### Adding a New Turn Strategy

1. Create strategy class in `src/turn.ts`:

```typescript
export class MySourceTurnStrategy extends DefaultTurnStrategy {
  readonly name = 'my-source';
  readonly source = 'my-source' as const;

  shouldAbsorbIntoPrevious(entry: Entry, currentTurn: Turn): boolean {
    // Source-specific logic
    return super.shouldAbsorbIntoPrevious(entry, currentTurn);
  }
}
```

2. Register in `createTurnBuilder()` factory function.

## Testing

- **Framework**: Vitest
- **Pattern**: Co-located tests (`*.test.ts` next to source)
- **Coverage**: V8 provider, excludes `generated.ts`
- **Globals**: Enabled (can use `describe`, `it`, `expect` without import)

### Writing Tests

```typescript
import { describe, it, expect } from 'vitest';
import { parse } from './parsers';

describe('my feature', () => {
  it('should do something', () => {
    const result = parse(sampleData);
    expect(result.meta.source).toBe('claude');
  });
});
```

## Package Exports

The package uses subpath exports:

```json
{
  ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" },
  "./api": { "import": "./dist/api/index.js", "types": "./dist/api/index.d.ts" },
  "./parsers": { "import": "./dist/parsers/index.js", "types": "./dist/parsers/index.d.ts" }
}
```

Consumers can import:
- `import { parse } from '@wethinkt/ts-thinkt'` - Everything
- `import { createClient, createApiClient } from '@wethinkt/ts-thinkt/api'` - API clients only
- `import { claudeParser } from '@wethinkt/ts-thinkt/parsers'` - Parsers only

## Related Projects

- [go-thinkt](https://github.com/wethinkt/go-thinkt) - Go implementation and API server
- [thinking-trace-viewer](https://github.com/brain-stm-org/thinking-trace-viewer) - 3D visualization

## Common Tasks

### Update README Badges

The README includes status badges that may need updating:

| Badge | URL | Update When |
|-------|-----|-------------|
| CI | `github.com/wethinkt/ts-thinkt/actions/workflows/ci.yml/badge.svg` | Workflow name changes |
| Package | `github.com/v/tag/wethinkt/ts-thinkt?label=package` | Auto-updates on new tags |
| License | `img.shields.io/badge/License-MIT-yellow.svg` | License changes |
| TypeScript | `img.shields.io/badge/TypeScript-5.7-blue.svg` | TypeScript version changes |

### Regenerate API Types

When the go-thinkt API changes:

```bash
# Copy new swagger.json to src/api/swagger.json
npm run api:generate
```

### Add New Content Block Type

1. Add to `ContentBlockType` union in `src/types.ts`
2. Define interface (extends `ContentBlockBase`)
3. Add to `ContentBlock` union
4. Add type guard function
5. Update parsers that may produce this block
6. Update `getBlocksInDisplayOrder()` if needed

### Update Version

Use `npm version` to bump the version, create a commit, and tag automatically:

```bash
# Patch release (bug fixes) - 0.1.3 → 0.1.4
npm version patch

# Minor release (new features) - 0.1.3 → 0.2.0
npm version minor

# Major release (breaking changes) - 0.1.3 → 1.0.0
npm version major

# Push to trigger release
git push --follow-tags
```

The GitHub Actions workflow (`.github/workflows/release.yml`) will automatically publish to GitHub Packages when a version tag is pushed.
