import { TASK_STATUS_LABEL, TASK_STATUS_TONE } from '@/lib/labels';
import type { TaskStatus } from '@/types/db';

export function StatusChip({ status }: { status: TaskStatus }) {
  const tone = TASK_STATUS_TONE[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-chip text-tiny font-medium"
      style={{ background: tone.bg, color: tone.text }}
    >
      <span
        aria-hidden
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: tone.dot }}
      />
      {TASK_STATUS_LABEL[status]}
    </span>
  );
}
