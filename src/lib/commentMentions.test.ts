import { describe, expect, it } from 'vitest';
import { renderCommentSegments, type MentionLookup } from './commentMentions';

const ALICE = '11111111-2222-3333-4444-555555555555';
const BOB = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const lookup: MentionLookup = {
  byId: new Map([
    [ALICE, 'Alice'],
    [BOB, 'Bob'],
  ]),
};

describe('renderCommentSegments', () => {
  it('returns an empty array for empty body', () => {
    expect(renderCommentSegments('', lookup)).toEqual([]);
  });

  it('returns a single text segment when there is no @uuid', () => {
    expect(renderCommentSegments('hello world', lookup)).toEqual([
      { kind: 'text', text: 'hello world' },
    ]);
  });

  it('replaces a single @uuid with a mention segment', () => {
    expect(renderCommentSegments(`hi @${ALICE}`, lookup)).toEqual([
      { kind: 'text', text: 'hi ' },
      { kind: 'mention', userId: ALICE, label: 'Alice' },
    ]);
  });

  it('handles two mentions with text between them', () => {
    expect(renderCommentSegments(`@${ALICE} please cc @${BOB} on this`, lookup)).toEqual([
      { kind: 'mention', userId: ALICE, label: 'Alice' },
      { kind: 'text', text: ' please cc ' },
      { kind: 'mention', userId: BOB, label: 'Bob' },
      { kind: 'text', text: ' on this' },
    ]);
  });

  it('falls back to text when the uuid is unknown to the lookup', () => {
    const unknown = 'ffffffff-1111-2222-3333-444444444444';
    expect(renderCommentSegments(`ping @${unknown} hi`, lookup)).toEqual([
      { kind: 'text', text: `ping @${unknown} hi` },
    ]);
  });

  it('does not mistake non-uuid @text for a mention', () => {
    expect(renderCommentSegments('email me at @reflect-studio', lookup)).toEqual([
      { kind: 'text', text: 'email me at @reflect-studio' },
    ]);
  });

  it('is regex-state safe across calls (uses local lastIndex reset)', () => {
    // Calling twice in a row must produce identical results — slips on
    // /g state would surface here.
    const body = `@${ALICE}`;
    expect(renderCommentSegments(body, lookup)).toEqual(
      renderCommentSegments(body, lookup),
    );
  });
});
