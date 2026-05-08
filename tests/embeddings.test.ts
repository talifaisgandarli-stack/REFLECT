/**
 * Unit smoke for the chunkText helper (api/_lib/embeddings.ts). Locks the
 * paragraph-aware chunker shape that ingestion depends on.
 */
import { describe, expect, it } from 'vitest';
import { chunkText } from '../api/_lib/embeddings';

describe('chunkText', () => {
  it('returns the input unchanged when below target', () => {
    const out = chunkText('short text', 1000);
    expect(out).toEqual(['short text']);
  });

  it('splits on paragraph boundaries when possible', () => {
    const para = 'Lorem ipsum dolor sit amet. '.repeat(20).trim();
    const text = `${para}\n\n${para}\n\n${para}`;
    const chunks = chunkText(text, 600, 50);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeGreaterThan(0);
      expect(c.length).toBeLessThanOrEqual(700); // target + overlap headroom
    }
  });

  it('produces chunks with overlap for context preservation', () => {
    const text = 'A'.repeat(2500);
    const chunks = chunkText(text, 1000, 150);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // Reconstructing strictly is not required, but the union must cover the
    // full input length once de-duplicated.
    const total = chunks.reduce((a, c) => a + c.length, 0);
    expect(total).toBeGreaterThanOrEqual(text.length);
  });

  it('drops empty chunks', () => {
    const chunks = chunkText('   \n\n   \n\n   ');
    for (const c of chunks) expect(c.trim().length).toBeGreaterThan(0);
  });
});
