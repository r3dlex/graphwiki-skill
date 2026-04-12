# Hook Integration

GraphWiki integrates with Claude Code and other platforms via three lifecycle hooks managed by oh-my-claudecode (OMC).

## Hook Registration

Hooks are registered in `~/.claude/plugins/marketplaces/omc/hooks/hooks.json` (OMC systems) or equivalent per-platform configuration:

```json
{
  "PreToolUse": [{
    "matcher": "*",
    "hooks": [{
      "type": "command",
      "command": "node \"$GRAPHWIKI_PROJECT_ROOT\"/scripts/graphwiki-pretool.mjs",
      "timeout": 3000
    }]
  }],
  "SessionStart": [{
    "matcher": "*",
    "hooks": [{
      "type": "command",
      "command": "node \"$GRAPHWIKI_PROJECT_ROOT\"/scripts/graphwiki-session-start.mjs",
      "timeout": 3000
    }]
  }],
  "PostToolUse": [{
    "matcher": "*",
    "hooks": [{
      "type": "command",
      "command": "node \"$GRAPHWIKI_PROJECT_ROOT\"/scripts/graphwiki-posttool.mjs",
      "timeout": 3000
    }]
  }]
}
```

## Hook Scripts

### graphwiki-pretool.mjs (PreToolUse)

Runs before every tool invocation (Read, Grep, Glob, Ask, etc.).

**Location:** `scripts/graphwiki-pretool.mjs`

**Behavior:**
1. Extracts entities from tool input (file paths, identifiers, query terms)
2. Routes to appropriate graph query:
   - **Read/Grep/Glob** → `graphwiki path <term1> <term2>` (0 LLM tokens, structural lookup)
   - **Ask/Query** → `graphwiki query "<question>"` (loads relevant wiki pages)
3. Writes context to session state
4. Tracks token budget (warns at 80% of 150K limit)
5. Gracefully degrades if graphwiki CLI unavailable

**Input Event Format (snake_case):**
```json
{
  "tool_name": "Read",
  "tool_input": { "file_path": "/src/Auth.ts" },
  "cwd": "/project",
  "session_id": "abc123",
  "workspace_roots": ["/project"]
}
```

**Output Format (JSON to stdout):**
```json
{ "continue": true, "suppressOutput": false }
```

### graphwiki-session-start.mjs (SessionStart)

Runs when a new session starts in Claude Code.

**Location:** `scripts/graphwiki-session-start.mjs`

**Behavior:**
1. Loads `.graphwiki/config.json` from project root
2. Validates graph state in `graphwiki-out/`
3. Initializes session context with available graph nodes
4. Sets token budget tracking (150K limit)

### graphwiki-posttool.mjs (PostToolUse)

Runs after certain tool invocations (typically after Write/Edit/Bash).

**Location:** `scripts/graphwiki-posttool.mjs`

**Behavior:**
1. Detects file changes via git status
2. Triggers `graphwiki build . --update` if source files changed
3. Optionally commits changes to git (if user has configured it)
4. Updates token spent tracking

## Event Processing

All hooks receive events in **snake_case** from OMC:
- `tool_name` — name of tool being invoked (Read, Write, Grep, etc.)
- `tool_input` — object containing tool parameters
- `cwd` — current working directory
- `session_id` — unique session identifier
- `workspace_roots` — array of project root paths

Hooks must respond with JSON to stdout:
```json
{ "continue": true, "suppressOutput": false }
```

- `continue: true` — proceed with tool execution
- `continue: false` — block the tool (rarely used)
- `suppressOutput: true` — suppress hook output from user view

## Hook Timeout

Hooks must complete within **3 seconds**. If a hook exceeds timeout:
- Tool execution proceeds regardless (non-blocking)
- Hook output is logged but not displayed
- Token tracking may be incomplete for that invocation

## Hook Installation

Install hooks via skill installer:

```bash
graphwiki hook install                    # Install all hooks
graphwiki hook status                     # Check status
graphwiki hook uninstall                  # Remove all hooks
```

For Auggie and other platforms, the skill installer writes hooks to the appropriate configuration file.

## Platform-Specific Hook Configuration

### Claude Code / Codex (OMC)
Hooks written to: `~/.claude/plugins/marketplaces/omc/hooks/hooks.json`

### Auggie
Hooks written to: `~/.augment/settings.json` under `pre_tool_use` section
Event format: snake_case (`tool_name`, `tool_input`, `conversation_id`, `workspace_roots`)
Exit code: 2 = blocking, other codes = non-blocking

### Gemini / Cursor / OpenClaw
Platform-specific hook registration via respective configuration files.
