import { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

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
  const [position, setPosition] = useState<{ top: number; left: number; isAbove: boolean; arrowLeft: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchorRef.current || !ref.current) return;
    
    const updatePosition = () => {
      const anchorNode = anchorRef.current;
      const pickerNode = ref.current;
      if (!anchorNode || !pickerNode) return;

      const rect = anchorNode.getBoundingClientRect();
      const pickerRect = pickerNode.getBoundingClientRect();
      
      const gap = 8;
      let isAbove = true;
      let top = rect.top - pickerRect.height - gap;
      
      if (top < 0 && rect.bottom + pickerRect.height + gap < window.innerHeight) {
        isAbove = false;
        top = rect.bottom + gap;
      } else if (top < 0) {
        top = 10;
        isAbove = true;
      }
      
      let left = rect.left - 12;
      if (left + pickerRect.width > window.innerWidth - 10) {
        left = window.innerWidth - pickerRect.width - 10;
      }
      if (left < 10) left = 10;

      let arrowLeft = rect.left - left + (rect.width / 2) - 6;
      if (arrowLeft < 12) arrowLeft = 12;
      if (arrowLeft > pickerRect.width - 24) arrowLeft = pickerRect.width - 24;

      setPosition({ top, left, isAbove, arrowLeft });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [anchorRef]);

  // Close on scroll
  useEffect(() => {
    const handleScroll = (e: Event) => {
      if (ref.current && ref.current.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', handleScroll, { capture: true });
  }, [onClose]);

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

  const content = (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top: position ? position.top : -9999,
        left: position ? position.left : -9999,
        minWidth: 260,
        zIndex: 99999,
        opacity: position ? 1 : 0,
        pointerEvents: position ? 'auto' : 'none',
      }}
      className="bg-white rounded-2xl shadow-xl border border-gray-100 p-2 animate-fade-in"
    >
      {/* Arrow */}
      {position && (
        <div 
          className={`absolute ${position.isAbove ? '-bottom-1.5 border-r border-b' : '-top-1.5 border-l border-t'} w-3 h-3 bg-white border-gray-100 rotate-45 transition-all`}
          style={{ left: position.arrowLeft }}
        />
      )}

      {EMOJI_ROWS.map((row, i) => (
        <div key={i} className="flex gap-0.5 relative z-10">
          {row.map(emoji => (
            <button
              key={emoji}
              type="button"
              onClick={() => { onSelect(emoji); onClose(); }}
              className="w-8 h-8 flex items-center justify-center text-lg rounded-lg hover:bg-gray-100 transition-colors select-none bg-white"
              title={emoji}
            >
              {emoji}
            </button>
          ))}
        </div>
      ))}
    </div>
  );

  return createPortal(content, document.body);
}
