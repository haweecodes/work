export default function PanelOverlay({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="absolute right-0 top-0 h-full z-10 flex flex-col border-l animate-slide-in"
      style={{ width: 380, background: 'var(--paper)', borderColor: 'var(--rule)' }}
    >
      {children}
    </div>
  );
}
