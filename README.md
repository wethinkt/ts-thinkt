# ts-thinkt

[![CI](https://github.com/wethinkt/ts-thinkt/actions/workflows/ci.yml/badge.svg)](https://github.com/wethinkt/ts-thinkt/actions/workflows/ci.yml)
[![GitHub Package](https://img.shields.io/github/v/tag/wethinkt/ts-thinkt?label=package&color=blue)](https://github.com/wethinkt/ts-thinkt/pkgs/npm/ts-thinkt)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)

TypeScript library for parsing and working with LLM conversation traces from multiple sources (Claude, Kimi, Gemini).

## Installation

```bash
npm install @wethinkt/ts-thinkt --registry=https://npm.pkg.github.com
```

## Features

- **Object Model**: Type-safe representation of conversations, entries, and content blocks
- **Parsers**: Parse JSONL files from Claude Code, Kimi, and Gemini
- **API Client**: Two-layer type-safe client for the [go-thinkt](https://github.com/wethinkt/go-thinkt) API server (high-level domain types + low-level OpenAPI)
- **Turn Analysis**: Group entries into logical conversation turns for visualization
- **Multi-Agent Support**: Entry provenance with agent IDs for team/swarm sessions
- **Project Metadata**: Track project path existence and source storage locations

## Usage

### Parsing JSONL Files

```typescript
import { parse, Session } from '@wethinkt/ts-thinkt';

// Parse a Claude Code JSONL file
const session = parse(jsonlContent);

// Access session metadata
console.log(session.meta.title);
console.log(session.meta.model);

// Iterate through entries
for (const entry of session.entries) {
  if (entry.role === 'user') {
    console.log('User:', entry.text);
  }
}
```

### API Client

Two layers are available — most consumers should use the high-level client:

```typescript
import { createClient } from '@wethinkt/ts-thinkt/api';

const client = createClient({ baseUrl: 'http://localhost:7433' });

// Returns camelCase domain types
const projects = await client.getProjects();
const sessions = await client.getSessions(projects[0].id);
const { meta, entries, hasMore } = await client.getSession(sessions[0].fullPath!);
```

For raw OpenAPI access (snake_case types):

```typescript
import { createApiClient } from '@wethinkt/ts-thinkt/api';

const apiClient = createApiClient({ baseUrl: 'http://localhost:7433' });
const projects = await apiClient.getProjects(); // returns snake_case types
```

### Turn Analysis

```typescript
import { analyzeTurns, createTurnBuilder } from '@wethinkt/ts-thinkt';

// Quick analysis
const analysis = analyzeTurns(session);
console.log(`${analysis.turns.length} turns, ${analysis.metrics.totalThinkingMs}ms thinking`);

// Custom turn building
const builder = createTurnBuilder(session.meta.source);
const turns = builder.buildTurns(session.entries);
```

### Multi-Agent / Team Support

For sessions with multiple agents (Claude Code teams/swarms):

```typescript
import { hasAgent, getAgentId, isFromAgent } from '@wethinkt/ts-thinkt';

for (const entry of session.entries) {
  if (isFromAgent(entry)) {
    console.log(`Agent: ${getAgentId(entry)}`);
    console.log(`Source ID: ${entry.sourceAgentId}`); // Raw ID for correlation
  }
}
```

### Project Path Tracking

Check if a project directory still exists and get storage location:

```typescript
const project = await client.getProject(projectId);
console.log(`Path exists: ${project.pathExists}`);
console.log(`Storage: ${project.sourceBasePath}`); // e.g., ~/.claude
```

## Package Exports

- `@wethinkt/ts-thinkt` - Main entry point with all exports
- `@wethinkt/ts-thinkt/api` - API clients (high-level + low-level) and adapters
- `@wethinkt/ts-thinkt/parsers` - Parsers only

## Development

### Releasing

This package is published to GitHub Packages. To release a new version:

```bash
# Bump version (patch/minor/major), commit, and tag
npm version patch   # 0.1.3 → 0.1.4
npm version minor   # 0.1.3 → 0.2.0
npm version major   # 0.1.3 → 1.0.0

# Push to trigger release
git push --follow-tags
```

The GitHub Actions workflow will automatically publish to GitHub Packages when a tag is pushed.

## Related

- [go-thinkt](https://github.com/wethinkt/go-thinkt) - Go implementation and API server
- [thinking-trace-viewer](https://github.com/brain-stm-org/thinking-trace-viewer) - 3D visualization

## License

Created with :heart: and :fire: by the team at [Neomantra](https://www.neomantra.net) and [BrainSTM](https://brain-stm.org).

Released under the MIT License - see [LICENSE.txt](./LICENSE.txt)
