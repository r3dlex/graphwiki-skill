import { describe, it, expect } from 'vitest';
import { classifyFile } from './classify-file.js';

describe('classifyFile', () => {
  it('classifies .ts as code', () => {
    expect(classifyFile('src/index.ts')).toBe('code');
  });

  it('classifies .py as code', () => {
    expect(classifyFile('main.py')).toBe('code');
  });

  it('classifies .zig as code', () => {
    expect(classifyFile('app.zig')).toBe('code');
  });

  it('classifies .md as doc', () => {
    expect(classifyFile('README.md')).toBe('doc');
  });

  it('classifies .pdf as doc', () => {
    expect(classifyFile('report.pdf')).toBe('doc');
  });

  it('classifies .mp4 as media', () => {
    expect(classifyFile('video.mp4')).toBe('media');
  });

  it('classifies .mp3 as media', () => {
    expect(classifyFile('audio.mp3')).toBe('media');
  });

  it('classifies unknown extension as code (default)', () => {
    expect(classifyFile('file.xyz')).toBe('code');
  });

  it('classifies no-extension file as code', () => {
    expect(classifyFile('Makefile')).toBe('code');
  });
});
