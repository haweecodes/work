export default function DocsView() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6" style={{ background: '#F8F9FC' }}>
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
        style={{ background: '#EDE9FE' }}
      >
        <svg width="26" height="26" fill="none" viewBox="0 0 24 24" stroke="#7C3AED" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>

      <h2 className="text-[18px] font-semibold text-gray-900 mb-2">Docs — coming soon</h2>
      <p className="text-[14px] text-gray-500 max-w-sm leading-relaxed mb-6">
        A collaborative document editor where conversations can be summarised into living docs.
        This feature is under development.
      </p>

      <div
        className="flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-medium"
        style={{ background: '#F3F4F6', color: '#6B7280' }}
      >
        <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
        In development — not yet available
      </div>
    </div>
  );
}
