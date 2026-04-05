/** Reusable skeleton/shimmer components for loading states */

const shimmer = 'animate-pulse bg-gray-200 rounded';

// ── Primitive ──────────────────────────────────────────────────────────────────

export function SkeletonLine({ w = 'w-full', h = 'h-3' }: { w?: string; h?: string }) {
  return <div className={`${shimmer} ${w} ${h}`} />;
}

export function SkeletonCircle({ size = 'w-8 h-8' }: { size?: string }) {
  return <div className={`${shimmer} rounded-full flex-shrink-0 ${size}`} />;
}

// ── Message bubble skeleton ───────────────────────────────────────────────────

export function MessageSkeleton() {
  return (
    <div className="flex gap-3 px-6 py-2">
      <SkeletonCircle />
      <div className="flex-1 space-y-1.5 pt-0.5">
        <div className="flex gap-2 items-center">
          <SkeletonLine w="w-24" h="h-3" />
          <SkeletonLine w="w-16" h="h-2.5" />
        </div>
        <SkeletonLine w="w-3/4" />
        <SkeletonLine w="w-1/2" />
      </div>
    </div>
  );
}

// ── Message list skeleton (N bubbles) ─────────────────────────────────────────

export function MessageListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-1 py-4">
      {Array.from({ length: count }).map((_, i) => (
        <MessageSkeleton key={i} />
      ))}
    </div>
  );
}

// ── Board column skeleton ─────────────────────────────────────────────────────

function TaskSkeleton() {
  return (
    <div className={`${shimmer} rounded-xl h-20`} />
  );
}

export function ColumnSkeleton() {
  return (
    <div className="flex-shrink-0 w-72 bg-gray-50/80 rounded-2xl p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between mb-1 px-1">
        <SkeletonLine w="w-24" h="h-4" />
        <div className={`${shimmer} w-5 h-5 rounded-full`} />
      </div>
      <TaskSkeleton />
      <TaskSkeleton />
      <TaskSkeleton />
    </div>
  );
}

export function BoardSkeleton({ columns = 3 }: { columns?: number }) {
  return (
    <div className="flex gap-4 p-6">
      {Array.from({ length: columns }).map((_, i) => (
        <ColumnSkeleton key={i} />
      ))}
    </div>
  );
}
