# Changelog

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

## [Unreleased]

## [3.0.0] - 2026-04-12

### Added
- v3 complete rewrite: directed graphs, watch mode, SVG export, Neo4j push
- Whisper audio transcription support
- Wiki format config (obsidian/plain) with canvas generation
- Ignore resolver with glob-based file discovery (.graphwikiignore)
- Continuous release pipeline: alpha on every main push; stable requires CHANGELOG section
- MCP server for graph querying
- Refine module with LLM-based prompt improvement

### Changed
- CLI now respects config.paths.graph in all commands
- postinstall prompts before installing skills (opt-in per platform)
- Platform shortcut uninstall commands fully wired

### Fixed
- Directed traversal in getNeighbors() respects metadata.directed
- TypeScript intersection type collapse in FileWatcher integration test
