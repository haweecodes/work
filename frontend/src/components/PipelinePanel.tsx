import { useState } from 'react';
import type { PipelineDeal } from '../types';

const PIPELINE_STAGES: { id: PipelineDeal['stage']; label: string; color: string }[] = [
  { id: 'lead',      label: 'Lead',      color: '#9CA3AF' },
  { id: 'qualified', label: 'Qualified', color: '#0D9488' },
  { id: 'proposal',  label: 'Proposal',  color: '#7C3AED' },
  { id: 'closing',   label: 'Closing',   color: '#D97706' },
];

interface Props {
  deals: PipelineDeal[];
  onAddDeal: () => void;
  onClose: () => void;
}

export default function PipelinePanel({ deals, onAddDeal, onClose }: Props) {
  const [aiBannerDismissed, setAiBannerDismissed] = useState(false);

  return (
    <>
      {/* Header */}
      <div className="flex-shrink-0" style={{ borderBottom: '1px solid var(--rule)' }}>
        <div className="flex items-center justify-between px-5 py-4">
          <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--faint)' }}>
            Opportunities Pipeline
          </span>
          <button
            onClick={onClose}
            style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--faint)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--faint)')}
          >
            Close
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2" style={{ scrollbarWidth: 'thin' }}>
        {!aiBannerDismissed && (
          <div className="rounded-lg p-3 mb-1 border" style={{ background: 'linear-gradient(135deg, #EDE9FE, #F5F3FF)', borderColor: '#C4B5FD' }}>
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#7C3AED' }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              AI Detected Opportunity
            </div>
            <div className="text-[13px] text-gray-800 leading-snug mb-2">Recent conversation shows strong buying signals.</div>
            <div className="flex gap-1.5">
              <button
                onClick={() => { onAddDeal(); setAiBannerDismissed(true); }}
                className="px-3 py-1 rounded-md text-[12px] font-medium text-white"
                style={{ background: '#7C3AED' }}
              >
                Add to Pipeline
              </button>
              <button
                onClick={() => setAiBannerDismissed(true)}
                className="px-2.5 py-1 rounded-md text-[12px] font-medium border"
                style={{ color: '#6B7280', borderColor: '#E5E7EB', background: 'transparent' }}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {deals.length === 0 && aiBannerDismissed && (
          <div className="px-2 py-8 text-center">
            <p style={{ fontSize: 13, color: 'var(--faint)', fontStyle: 'italic' }}>No deals yet</p>
          </div>
        )}

        {PIPELINE_STAGES.map(stage => {
          const items = deals.filter(d => d.stage === stage.id);
          if (!items.length) return null;
          return (
            <div key={stage.id} className="mb-2">
              <div className="flex items-center gap-2 mb-1.5 px-0.5">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: stage.color }} />
                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: stage.color }}>{stage.label}</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#E5E7EB', color: '#9CA3AF' }}>{items.length}</span>
              </div>
              {items.map(deal => (
                <div key={deal.id} className="rounded-lg px-3 py-2.5 mb-1.5 cursor-pointer transition-all"
                  style={{ background: '#F8F9FC', border: '1px solid #E5E7EB' }}
                  onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)')}
                  onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
                >
                  <div className="text-[13px] font-semibold text-gray-900">{deal.company}</div>
                  <div className="text-[12px] mt-0.5" style={{ color: '#6B7280' }}>{deal.detail}</div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[13px] font-bold" style={{ color: '#7C3AED' }}>{deal.value}</span>
                    <span className="text-[11px]" style={{ color: '#9CA3AF' }}>{deal.prob}</span>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
