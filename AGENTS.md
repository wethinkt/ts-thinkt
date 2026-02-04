# AGENTS.md - ts-thinkt

This document provides context for AI agents working on the **ts-thinkt** project.

## Project Overview

**ts-thinkt** is a TypeScript library for parsing and working with LLM conversation traces from multiple sources (Claude Code, Kimi, Gemini). It provides:

- **Object Model**: Type-safe representation of conversations, entries, and content blocks
- **Parsers**: Parse JSONL files from Claude Code, Kimi, and Gemini
- **API Client**: Type-safe HTTP client for the go-thinkt API server
- **Turn Analysis**: Group entries into logical conversation turns for visualization

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
├── api/               # API client
│   ├── client.ts      # ThinktClient implementation
│   └── generated.ts   # OpenAPI-generated types (auto-generated)
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
    └── api/ (HTTP client)
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

### 1. Content Block Model

All entry content is stored as an array of `ContentBlock` objects:

```typescript
interface ContentBlockBase {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'image' | 'document';
}
```

This unified model supports multiple LLM formats without losing information.

### 2. Parser Registry Pattern

Parsers are registered in a central `ParserRegistry`. Auto-detection selects the appropriate parser based on content format.

```typescript
const session = parse(jsonlContent);  // Auto-detects source
```

### 3. Turn Analysis Strategy Pattern

Different sources have different conversation structures. The `TurnBuildingStrategy` interface allows source-specific turn grouping:

- `DefaultTurnStrategy`: Generic turn detection
- `ClaudeTurnStrategy`: Handles Claude's tool_result-in-user format
- `KimiTurnStrategy`: Handles Kimi's tool role format
- `GeminiTurnStrategy`: Handles Gemini's format

### 4. API Client Design

The `ThinktClient` uses:
- OpenAPI-generated types for type safety
- Fetch-based HTTP with timeout support
- Streaming generators for paginated data
- Custom error types (`ThinktAPIError`, `ThinktNetworkError`)

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
- `import { createClient } from '@wethinkt/ts-thinkt/api'` - API client only
- `import { claudeParser } from '@wethinkt/ts-thinkt/parsers'` - Parsers only

## Related Projects

- [go-thinkt](https://github.com/wethinkt/go-thinkt) - Go implementation and API server
- [thinking-trace-viewer](https://github.com/brain-stm-org/thinking-trace-viewer) - 3D visualization

## Common Tasks

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

1. Edit `version` in `package.json`
2. Run `npm run build` to verify
3. Tag release: `git tag v$(jq -r .version package.json)`
