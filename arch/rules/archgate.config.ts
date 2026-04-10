// archgate CLI configuration — merges all 4 rules files
import { defineConfig } from 'archgate';
import { graphRules } from './graph.rules.js';
import { wikiRules } from './wiki.rules.js';
import { serveRules } from './serve.rules.js';
import { dedupRules } from './dedup.rules.js';

export default defineConfig({
  version: '1.0.0',
  description: 'GraphWiki architecture rules',
  rules: [graphRules, wikiRules, serveRules, dedupRules],
  failOnViolations: true,
  format: 'github-annotation',
});