import { useEffect, useRef, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export default function EmojiPicker({ onSelect, onClose, anchorRef }: EmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchorRef.current || !ref.current) return;

    const update = () => {
      const anchor = anchorRef.current;
      const picker = ref.current;
      if (!anchor || !picker) return;

      const rect = anchor.getBoundingClientRect();
      const pickerRect = picker.getBoundingClientRect();
      const gap = 8;

      let top = rect.top - pickerRect.height - gap;
      if (top < 10) top = rect.bottom + gap;

      let left = rect.left - 12;
      if (left + pickerRect.width > window.innerWidth - 10) left = window.innerWidth - pickerRect.width - 10;
      if (left < 10) left = 10;

      setPosition({ top, left });
    };

    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [anchorRef]);

  useEffect(() => {
    const handleScroll = (e: Event) => {
      if (ref.current?.contains(e.target as Node)) return;
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
        zIndex: 99999,
        opacity: position ? 1 : 0,
        pointerEvents: position ? 'auto' : 'none',
      }}
      className="animate-fade-in"
    >
      <Picker
        data={data}
        onEmojiSelect={(e: { native: string }) => { onSelect(e.native); onClose(); }}
        theme="light"
        previewPosition="none"
        skinTonePosition="none"
        maxFrequentRows={2}
        perLine={9}
      />
    </div>
  );

  return createPortal(content, document.body);
}
