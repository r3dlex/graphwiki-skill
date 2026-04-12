# Watch Mode

Watch mode incrementally rebuilds the graph on file changes with debouncing.

## Usage

```bash
graphwiki build --watch
# or
graphwiki build --update --watch
```

Watches:
- Source code files (based on config)
- `.graphwiki/config.json`
- `.graphwikiignore`
- Ignore resolver patterns

## File Watcher

Uses `chokidar` for robust cross-platform watching:

```typescript
import chokidar from 'chokidar';

const watcher = chokidar.watch(sourcePatterns, {
  ignored: /(^|[\/\\])\.|node_modules/,
  persistent: true,
  awaitWriteFinish: true
});

watcher.on('change', (filePath) => {
  debouncer.schedule(() => rebuild(filePath));
});
```

## Debouncing

Debounce timer prevents thrashing on rapid saves:

```typescript
const DEBOUNCE_MS = 500;  // Wait 500ms for file activity

class Debouncer {
  private timer: NodeJS.Timeout | null = null;
  
  schedule(fn: () => void) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(fn, DEBOUNCE_MS);
  }
}
```

Workflow:
1. File changes at t=0
2. Debouncer starts 500ms timer
3. If file changes again before 500ms, restart timer
4. After 500ms silence, trigger rebuild

## Incremental Rebuild

Changes trigger incremental update:

1. Detect changed file
2. Extract only changed file
3. Merge with existing graph (via delta logic)
4. Update wiki output
5. Report status

```typescript
async function handleFileChange(filePath: string) {
  const delta = await computeDelta(filePath);
  await persistDelta(delta);
  console.log(`Updated: ${delta.added.nodes.length} nodes added`);
}
```

Updates typically 100-500ms per change. Press Ctrl+C to stop watch mode.
