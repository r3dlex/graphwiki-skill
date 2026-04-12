# Contributing to GraphWiki

Thank you for your interest in contributing to GraphWiki!

## Prerequisites

- `node` >= 18
- `pnpm` >= 9.0
- `git`
- TypeScript familiarity

## Development Workflow

### 1. Fork and Clone

```bash
git clone https://github.com/<your-fork>/graphwiki-skill.git
cd graphwiki-skill
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Build and Test

```bash
pnpm run build      # Build the project
pnpm test           # Run all tests
pnpm run lint       # Lint code
```

### 4. Verify Quality

```bash
pnpm run typecheck  # Type check
pnpm run test:unit  # Unit tests with coverage
pnpm run test:watch # Watch mode for development
pnpm run fmt        # Format code
```

### 5. Make Changes

All tests must pass before submitting a pull request. Run `pnpm test` to verify.

### 6. Sync from Upstream

```bash
git fetch upstream
git rebase upstream/main
```

Use `--force-with-lease` over `--force` when pushing rebased branches.

### 7. Submit a Pull Request

Push your branch to your fork and open a PR on GitHub. Reference any related issues.

## Project Structure

```
graphwiki-skill/
├── src/
│   ├── benchmark/       # Token measurement
│   ├── detect/          # Language detection
│   ├── dedup/           # Deduplication
│   ├── extract/         # LLM extraction
│   ├── graph/           # Graph operations
│   ├── providers/       # AI providers
│   ├── query/           # Routing and cache
│   ├── refine/          # Prompt refinement
│   ├── report/          # Reporting
│   ├── serve/           # MCP servers
│   ├── util/            # Utilities
│   └── wiki/            # Wiki compilation
├── graphwiki-out/       # Built knowledge graph
├── wiki/                # Compiled wiki pages
└── raw/                 # Immutable source files
```

## Coverage Requirements

Unit tests must maintain:
- **90%+ line coverage**
- **85%+ branch coverage**

Run `pnpm run test:unit` to check coverage thresholds.

## Wiki Page Format

If you add or modify wiki pages, include proper YAML frontmatter:

```yaml
---
title: Page title
type: concept | entity | source-summary | comparison
graph_nodes: [list of node IDs]
graph_community: community ID
sources: [raw files referenced]
related: [[wiki-links]]
confidence: high | medium | low
content_hash: for diff-based updates
---
```

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
