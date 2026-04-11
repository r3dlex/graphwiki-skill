# PreToolUse Hook Architecture

GraphWiki integrates with Claude Code via oh-my-claude's hook system. Three hook scripts provide automatic context enrichment across the agent lifecycle.

## Hook Types

| Hook | Trigger | Purpose |
|------|---------|---------|
| **SessionStart** | Agent session begins | Warm up graph, load project overview |
| **PreToolUse** | Before each tool call | Inject relevant wiki context based on tool + input |
| **PostToolUse** | After each tool call | Track knowledge changes, trigger git-aware updates |

## Event Format

Hooks receive events as JSON via stdin (snake_case from OMC):

```json
{
  "tool_name": "Read",
  "tool_input": { "file_path": "/src/Auth.ts" },
  "cwd": "/project",
  "session_id": "abc123"
}
```

### SessionStart Event

```json
{
  "event": "SessionStart",
  "cwd": "/project",
  "session_id": "abc123",
  "timestamp": "2026-04-11T10:30:00Z"
}
```

### PostToolUse Event

```json
{
  "tool_name": "Read",
  "tool_input": { "file_path": "/src/Auth.ts" },
  "tool_result": { "success": true },
  "cwd": "/project",
  "session_id": "abc123",
  "timestamp": "2026-04-11T10:30:05Z"
}
```

## Hook Scripts Location

All hook scripts live in `scripts/`:

```
scripts/
  graphwiki-pretool.mjs              # OMC PreToolUse hook
  graphwiki-session-start.mjs        # OMC SessionStart hook
  graphwiki-posttool.mjs             # OMC PostToolUse hook
  graphwiki-auggie-pretool.mjs       # Auggie PreToolUse hook
  graphwiki-auggie-session-start.mjs  # Auggie SessionStart hook
  graphwiki-auggie-posttool.mjs      # Auggie PostToolUse hook
```

### OMC vs Auggie Differences

| Aspect | OMC (Claude Code) | Auggie |
|--------|------------------|--------|
| Registration | `~/.claude/plugins/marketplaces/omc/hooks/hooks.json` | `~/.augment/settings.json` |
| Event field | `session_id` | `conversation_id` |
| PreToolUse blocking | Never blocks | Exit code 2 = blocking |
| Event format | snake_case | snake_case |

## PreToolUse Behavior

Before every tool use, `graphwiki-pretool.mjs`:

1. **Entity extraction** — Parse `tool_input` for file paths, CamelCase identifiers, query terms
2. **Routing** — Choose query strategy:
   - `Read / Grep / Glob` → `graphwiki path <term1> <term2>` (0 LLM tokens)
   - `Ask / Query` → `graphwiki query "<question>"` (loads wiki pages)
3. **Context write** — Write enriched context to session state file
4. **Token tracking** — Warn at 80% of 150K token budget
5. **Return** — Write JSON to stdout: `{ "continue": true, "suppressOutput": true }`

The hook **never blocks** tool execution. Tool calls proceed regardless of hook outcome.

## Hook Response Format

Hook scripts write responses to stdout:

```json
{
  "continue": true,
  "suppressOutput": true,
  "context": {
    "wiki_pages": ["auth-service.md", "database-pool.md"],
    "token_budget_pct": 45
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `continue` | boolean | Always `true` — hooks do not block |
| `suppressOutput` | boolean | Hide hook output from user |
| `context` | object | Optional context to inject into session |

## Graceful Degradation

If graphwiki CLI is unavailable or times out:

1. Hook logs a warning to stderr
2. Hook returns `{ "continue": true }` with no context
3. Tool execution proceeds normally
4. No error is surfaced to the user

```javascript
// Example: graceful degradation pattern
try {
  const result = await runGraphwikiCommand(args, { timeout: 3000 });
  return { continue: true, context: parseResult(result) };
} catch (err) {
  console.error('[GraphWiki] Hook warning:', err.message);
  return { continue: true }; // always continue
}
```

## Hook Installer Registration

The skill installer (`graphwiki skill install --platform claude`) registers hooks via `~/.claude/plugins/marketplaces/omc/hooks/hooks.json`:

```json
{
  "PreToolUse": [{
    "matcher": "*",
    "hooks": [{
      "type": "command",
      "command": "node \"$GRAPHWIKI_PROJECT_ROOT\"/scripts/graphwiki-pretool.mjs",
      "timeout": 3
    }]
  }],
  "SessionStart": [{
    "matcher": "*",
    "hooks": [{
      "type": "command",
      "command": "node \"$GRAPHWIKI_PROJECT_ROOT\"/scripts/graphwiki-session-start.mjs",
      "timeout": 3
    }]
  }],
  "PostToolUse": [{
    "matcher": "*",
    "hooks": [{
      "type": "command",
      "command": "node \"$GRAPHWIKI_PROJECT_ROOT\"/scripts/graphwiki-posttool.mjs",
      "timeout": 3
    }]
  }]
}
```

The `generateHooksJsonEntries()` function in `skill-generator.ts` produces this JSON.

## Timeout Strategy

- **3 second timeout** — balances context quality vs. agent responsiveness
- Context is pre-fetched and cached; timeout only affects first access
- If timeout is exceeded, hook returns `{ "continue": true }` and tool proceeds

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│ Claude Code / Agent Session                         │
│                                                     │
│  SessionStart ──► graphwiki-session-start.mjs      │
│       │              (warm up graph, load overview) │
│       ▼                                             │
│  Tool Call ────► PreToolUse ──► graphwiki-pretool.mjs │
│       │              (inject wiki context)           │
│       ▼                                             │
│  Tool Executes                                       │
│       │                                             │
│  PostToolUse ──► graphwiki-posttool.mjs             │
│       │              (track changes, git-aware)     │
│       ▼                                             │
│  Session End                                         │
└─────────────────────────────────────────────────────┘
```

## Auggie Hook Architecture

Auggie uses a different registration path and event format. Hooks are registered via `~/.augment/settings.json` rather than OMC's hooks.json.

### Auggie Event Format

```json
{
  "tool_name": "Read",
  "tool_input": { "file_path": "/src/Auth.ts" },
  "conversation_id": "abc123",
  "workspace_roots": ["/project"]
}
```

Key differences from OMC:
- Uses `conversation_id` instead of `session_id`
- Adds `workspace_roots` array
- `matcher` uses `launch-process` instead of `*`

### Auggie Hook Registration

```json
{
  "pre_tool_use": [{
    "matcher": "launch-process",
    "hooks": [{
      "type": "command",
      "command": "node \"$GRAPHWIKI_PROJECT_ROOT\"/scripts/graphwiki-auggie-pretool.mjs"
    }]
  }],
  "session_start": [{
    "matcher": "launch-process",
    "hooks": [{
      "type": "command",
      "command": "node \"$GRAPHWIKI_PROJECT_ROOT\"/scripts/graphwiki-auggie-session-start.mjs"
    }]
  }],
  "post_tool_use": [{
    "matcher": "launch-process",
    "hooks": [{
      "type": "command",
      "command": "node \"$GRAPHWIKI_PROJECT_ROOT\"/scripts/graphwiki-auggie-posttool.mjs"
    }]
  }]
}
```

### Blocking Behavior

- **Exit code 0-1**: Non-blocking, tool proceeds
- **Exit code 2**: Blocking, tool is blocked
- **Exit code 3+**: Non-blocking

GraphWiki hooks always exit 0 (non-blocking) to maintain compatibility.

## Testing Hooks

Hooks can be tested in isolation:

```bash
# Test PreToolUse hook
echo '{"tool_name":"Read","tool_input":{"file_path":"/src/Auth.ts"},"cwd":"'$PWD'","session_id":"test"}' \
  | node scripts/graphwiki-pretool.mjs

# Expected: JSON response with continue:true
```
