import { useEffect, useRef } from 'react';

const EMOJI_ROWS = [
  ['👍', '👎', '❤️', '😂', '😮', '😢', '😡', '🎉'],
  ['🙌', '🔥', '✅', '👀', '💯', '🚀', '💡', '🤔'],
  ['😎', '🥹', '🫡', '💪', '⭐', '🙏', '😅', '🤝'],
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  /** Position anchor – the component floats itself above this element */
  anchorRef: React.RefObject<HTMLElement | null>;
}

export default function EmojiPicker({ onSelect, onClose, anchorRef }: EmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose, anchorRef]);

  return (
    <div
      ref={ref}
      className="absolute z-50 bottom-full mb-2 left-0 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 animate-fade-in"
      style={{ minWidth: 260 }}
    >
      {/* Arrow */}
      <div className="absolute -bottom-1.5 left-4 w-3 h-3 bg-white border-r border-b border-gray-100 rotate-45" />

      {EMOJI_ROWS.map((row, i) => (
        <div key={i} className="flex gap-0.5">
          {row.map(emoji => (
            <button
              key={emoji}
              type="button"
              onClick={() => { onSelect(emoji); onClose(); }}
              className="w-8 h-8 flex items-center justify-center text-lg rounded-lg hover:bg-gray-100 transition-colors select-none"
              title={emoji}
            >
              {emoji}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
