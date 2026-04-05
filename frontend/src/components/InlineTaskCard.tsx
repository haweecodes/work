import useBoardStore from '../store/boardStore';
import type { Task } from '../types';

const PRIORITY_DOT: Record<string, string> = {
  low: 'bg-emerald-400',
  medium: 'bg-amber-400',
  high: 'bg-orange-500',
  critical: 'bg-red-500',
};

export default function InlineTaskCard({ task }: { task: Task }) {
  const setSelectedTask = useBoardStore(s => s.setSelectedTask);
  if (!task) return null;

  return (
    <button
      onClick={() => setSelectedTask(task)}
      className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-md border border-gray-200 bg-gray-50
                 hover:bg-white hover:border-primary-300 hover:text-primary-700 transition-all duration-150
                 text-xs text-gray-600 font-medium group max-w-[260px]"
    >
      {/* Priority dot */}
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[task.priority || 'medium'] || 'bg-gray-400'}`} />

      {/* Task title */}
      <span className="truncate">{task.title}</span>

      {/* Open arrow — only on hover */}
      <svg
        className="w-3 h-3 flex-shrink-0 text-gray-300 group-hover:text-primary-400 transition-colors"
        fill="none" viewBox="0 0 24 24" stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    </button>
  );
}
