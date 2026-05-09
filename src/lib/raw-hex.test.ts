/**
 * Raw-hex budget guard (slice 127, designstyle4 §A).
 *
 * After slice 97 collapsed 60 raw hex literals onto var(--state-error)
 * and var(--state-warn), the remaining occurrences fall into two
 * categories:
 *
 *   1. recharts SVG paint attributes (fill="#xxx", stroke="#xxx") —
 *      can't dereference CSS custom properties; must stay literal.
 *      File-by-file allowlist below.
 *
 *   2. Color-tone tables in src/lib/labels.ts — used as a single
 *      source of truth that the rest of the app reads through
 *      TASK_STATUS_TONE/etc., so mirrored hex is intentional.
 *
 * Anything else is a regression. This test scans the codebase, groups
 * hex literals per file, and fails if a file we don't allowlist has
 * ANY raw hex, or if an allowlisted file exceeds its budget. New
 * components default to budget=0 — which is the point.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..');
const HEX_RE = /#[0-9a-fA-F]{6}\b/g;

/**
 * Files where raw hex is expected and budgeted. Numbers reflect the
 * baseline at the time of slice 127 — adding to a file requires either
 * a real reduction (lower the number) or a justified bump (with a
 * comment in the PR explaining the new recharts paint or tone scale).
 */
const ALLOWLIST: Record<string, number> = {
  // status / pipeline / outsource / leave tone tables (chip backgrounds + dots)
  'lib/labels.ts': 19,
  // recharts SVG fill/stroke attributes
  'pages/Reports.tsx': 9,
  'pages/Finance.tsx': 4,
  'pages/MiraiCost.tsx': 5,
  'components/ProjectPnL.tsx': 6,
  // chip + tone scales used through STATUS_TONE / health helpers
  'pages/team/Leave.tsx': 8,
  'pages/Outsource.tsx': 8,
  'pages/team/Equipment.tsx': 7,
  'pages/team/Calendar.tsx': 5,
  'pages/Dashboard.tsx': 5,
  'pages/Tasks.tsx': 4,
  'components/TaskPreviewDrawer.tsx': 3,
  'components/ProjectPreviewDrawer.tsx': 3,
  'components/PortfolioPanel.tsx': 3,
  'components/Avatar.tsx': 3,
  'pages/company/Career.tsx': 3,
  'pages/team/Performance.tsx': 2,
  'pages/company/Okr.tsx': 2,
  'pages/Mirai.tsx': 2,
  'pages/team/Announcements.tsx': 1,
  'pages/DoneList.tsx': 1,
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const s = statSync(path);
    if (s.isDirectory()) walk(path, out);
    else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\.(t|j)sx?$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

describe('raw hex budget', () => {
  it('only allowlisted files contain raw 6-digit hex literals', () => {
    const files = walk(ROOT);
    const offenders: string[] = [];
    for (const path of files) {
      const rel = path.slice(ROOT.length + 1).replace(/\\/g, '/');
      const src = readFileSync(path, 'utf8');
      const matches = src.match(HEX_RE) ?? [];
      const allowed = ALLOWLIST[rel] ?? 0;
      if (matches.length > allowed) {
        offenders.push(`${rel}: ${matches.length} found, ${allowed} budgeted`);
      }
    }
    expect(
      offenders,
      `\nNew raw hex literals detected. Use a token from src/styles/tokens.css or extend the ALLOWLIST in src/lib/raw-hex.test.ts when recharts forces SVG fill.\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
