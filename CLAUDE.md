# GraphWiki

See [AGENTS.md](AGENTS.md) for project context, agent specifications, and conventions.
See [SKILL.md](SKILL.md) for the canonical skill definition (hooks, triggers, commands).

## Quick Reference: Key Commands

```bash
# Build and manage graph
graphwiki build . --update         # Incremental rebuild
graphwiki build . --watch          # Watch mode
graphwiki build . --directed       # Build directed graphs
graphwiki build . --mode deep      # Deep mode extraction

# Query and explore
graphwiki add <url>                # Add URL source to graph
graphwiki query "question"         # Ask the knowledge base
graphwiki path <nodeA> <nodeB>     # Find structural relationships

# Hooks and skill management
graphwiki hook install             # Install hooks for Claude Code
graphwiki hook uninstall           # Uninstall hooks
graphwiki hook status              # Check hook status
graphwiki skill uninstall --all    # Remove all skill installations
```