# Context Loading Protocol

GraphWiki uses a tiered context loading approach to minimize token usage while maximizing relevant information.

## Automatic Loading via PreToolUse Hook

When you use tools like Read, Grep, or Glob, the PreToolUse hook automatically:

1. **Entity Extraction** — Parses tool input to extract keywords:
   - File paths → `src/Auth.ts` → extract `Auth`
   - Query terms → `"How does auth work"` → extract `auth`
   - Identifiers → `AuthService` → extract `AuthService`

2. **Graph Routing**:
   - **Structural queries (Read/Grep/Glob)** → `graphwiki path <term1> <term2>` (0 LLM tokens)
   - **Knowledge queries (Ask)** → `graphwiki query "<question>"` (loads wiki pages)

3. **Context Injection** — Writes graph context to session state for agent consumption

4. **Token Tracking** — Monitors cumulative token spend (warns at 80% of 150K limit)

5. **Graceful Degradation** — If graphwiki CLI unavailable, tools proceed normally without context

## Manual Protocol (When Hook Insufficient)

Follow these steps in order. Do not skip steps. Do not read `raw/` unless Step 5 applies.

### Step 1: Load Graph Overview (~1-2K tokens)

Read `graphwiki-out/GRAPH_REPORT.md`:
- Provides high-level view of entire graph
- Lists top nodes and communities
- Shows graph statistics (node count, edge density, drift)
- Identifies hotspots (most-connected areas)

```bash
cat graphwiki-out/GRAPH_REPORT.md
```

### Step 2: Structural Queries (0 LLM tokens)

Use `graphwiki path` for structural relationships:

```bash
# Find path between two concepts
graphwiki path Authentication Database

# Find all edges from a node
graphwiki path Auth "*"

# Find shortest connection
graphwiki path API Gateway Metrics
```

These queries return graph node IDs, edge relationships, and distance—zero LLM tokens consumed.

### Step 3: Load Wiki Index (~1-3K tokens)

Read `wiki/index.md`:
- Lists all compiled wiki pages
- Shows page titles and brief descriptions
- Indicates page confidence levels (high/medium/low)
- Maps pages to graph communities

```bash
cat wiki/index.md
```

### Step 4: Read Targeted Wiki Pages (~2-5K each, max 3 pages)

Based on Step 3 results, read relevant pages:

```bash
# Example: Authentication page
cat wiki/authentication.md

# Example: Database architecture
cat wiki/database-architecture.md

# Example: API design
cat wiki/api-design.md
```

Each wiki page has YAML frontmatter:
```yaml
---
title: Page Title
type: concept | entity | source-summary | comparison
graph_nodes: [list of node IDs]
graph_community: community number
sources: [list of raw/ files]
related: [[wiki-links]]
confidence: high | medium | low
content_hash: hash for diff detection
---
```

Confidence levels guide whether to proceed to Step 5:
- **high** — Confident in page content, no need to verify
- **medium** — Generally accurate but may need source verification
- **low** — Preliminary; verify against raw/ files if possible

### Step 5: Read Raw Source Files (Only if needed)

Read `raw/` files **only** if:
- Step 4 page has **low confidence** and you need certainty
- The wiki page does **not exist** for this topic
- You need to **verify a specific claim** made in a wiki page
- The user **explicitly requested** reading source files

Do not skip to raw files. The protocol exists to minimize token usage—reading raw when wiki suffices wastes tokens.

```bash
# Example: verify auth mechanism in source
cat raw/src/auth/service.ts

# Example: understand config format
cat raw/docs/configuration.md
```

## Token Budget Tracking

The hook tracks cumulative token spend:

- **Step 1** (GRAPH_REPORT.md): ~1-2K tokens
- **Step 2** (graphwiki path): 0 tokens
- **Step 3** (wiki/index.md): ~1-3K tokens
- **Step 4** (wiki pages, 3 max): ~6-15K tokens
- **Step 5** (raw files, if needed): variable

**Total budget: 150K tokens per session**

The hook warns when approaching 80% (120K spent).

## Query Examples

### "How does authentication work?"

1. Read GRAPH_REPORT.md
2. `graphwiki path Auth "Credential*"` (structural lookup)
3. Read wiki/index.md, find auth-related pages
4. Read wiki/authentication.md, wiki/session-management.md
5. Done (unless low confidence → read raw/src/auth/)

### "What's the database schema?"

1. Read GRAPH_REPORT.md
2. `graphwiki path Database Schema Migration` (find connections)
3. Read wiki/index.md, find database pages
4. Read wiki/database-schema.md, wiki/models.md
5. Done (or verify with raw/schema.sql if uncertain)

### "How do we deploy?"

1. Read GRAPH_REPORT.md
2. `graphwiki path Deployment CI Release` (find deployment flow)
3. Read wiki/index.md, find deployment pages
4. Read wiki/deployment.md, wiki/ci-pipeline.md
5. Optional: verify with raw/Dockerfile, raw/.github/workflows/

## Rules

1. **Always load through graph first** — Never skip to raw files
2. **Query back to wiki** — If you find new knowledge, create or update a wiki page
3. **Update content_hash** — When modifying wiki pages, update the hash
4. **Never modify raw/** — Immutable sources only
5. **Run lint after changes** — `graphwiki lint` catches contradictions

## Integration with Agent Systems

Platform-specific agents (Claude Code, Codex, Auggie) receive context injected by the hook:

```javascript
// Example: hook injects into session state
session_state.graphwiki_context = {
  relevant_paths: [
    { nodeA: "Auth", nodeB: "Session", distance: 2 },
    { nodeA: "Auth", nodeB: "Credential", distance: 1 }
  ],
  wiki_pages: [
    { title: "Authentication", confidence: "high", file: "wiki/authentication.md" }
  ],
  token_spent: 8500,
  token_budget: 150000
}
```

Agents can consume this context for smarter tool routing and more efficient queries.
