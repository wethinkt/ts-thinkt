# ts-thinkt

TypeScript library for parsing and working with LLM conversation traces from multiple sources (Claude, Kimi, Gemini).

## Installation

```bash
npm install @wethinkt/ts-thinkt
```

## Features

- **Object Model**: Type-safe representation of conversations, entries, and content blocks
- **Parsers**: Parse JSONL files from Claude Code, Kimi, and Gemini
- **API Client**: Two-layer type-safe client for the [go-thinkt](https://github.com/wethinkt/go-thinkt) API server (high-level domain types + low-level OpenAPI)
- **Turn Analysis**: Group entries into logical conversation turns for visualization

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

## Package Exports

- `@wethinkt/ts-thinkt` - Main entry point with all exports
- `@wethinkt/ts-thinkt/api` - API clients (high-level + low-level) and adapters
- `@wethinkt/ts-thinkt/parsers` - Parsers only

## Related

- [go-thinkt](https://github.com/wethinkt/go-thinkt) - Go implementation and API server
- [thinking-trace-viewer](https://github.com/brain-stm-org/thinking-trace-viewer) - 3D visualization

## License

Created with :heart: and :fire: by the team at [Neomantra](https://www.neomantra.net) and [BrainSTM](https://brain-stm.org).

Released under the MIT License - see [LICENSE.txt](./LICENSE.txt)
