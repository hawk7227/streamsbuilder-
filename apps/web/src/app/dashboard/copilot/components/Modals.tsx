import React, { useState, useEffect } from 'react';
import { Button } from './Overlays';
import { Icons } from './Icons';

export const COMPRESSION_STRATEGIES = {
    summarize: 'Summarize older messages',
    removeCode: 'Remove code blocks from history',
    keepRecent: 'Keep only recent messages',
    archive: 'Archive to memory & start fresh'
};

export function CompressionModal({ isOpen, onClose, onApply, currentTokens }: any) {
  const [strategy, setStrategy] = useState('summarize');
  const [estimatedSavings, setEstimatedSavings] = useState(0);

  useEffect(() => {
    const savings: any = {
      summarize: 0.6,
      removeCode: 0.4,
      keepRecent: 0.7,
      archive: 0.9
    };
    setEstimatedSavings(Math.round(currentTokens * savings[strategy]));
  }, [strategy, currentTokens]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-100">Compress Conversation</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100">{Icons.close}</button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-zinc-400">Choose how to reduce context usage while preserving important information.</p>
          
          <div className="space-y-2">
            {Object.entries(COMPRESSION_STRATEGIES).map(([key, description]) => (
              <label key={key} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${strategy === key ? 'border-emerald-500 bg-emerald-500/10' : 'border-zinc-800 hover:border-zinc-700'}`}>
                <input type="radio" name="strategy" checked={strategy === key} onChange={() => setStrategy(key)} className="mt-1 accent-emerald-500" />
                <div>
                  <p className="text-sm font-medium text-zinc-100 capitalize">{key.replace(/([A-Z])/g, ' $1')}</p>
                  <p className="text-xs text-zinc-500">{description}</p>
                </div>
              </label>
            ))}
          </div>

          <div className="p-3 bg-zinc-800 rounded-xl">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Current usage</span>
              <span className="text-zinc-100">{(currentTokens / 1000).toFixed(1)}K tokens</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-zinc-400">Estimated after compression</span>
              <span className="text-emerald-400">{((currentTokens - estimatedSavings) / 1000).toFixed(1)}K tokens</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-zinc-400">Savings</span>
              <span className="text-emerald-400">~{(estimatedSavings / 1000).toFixed(1)}K tokens ({Math.round((estimatedSavings / currentTokens) * 100)}%)</span>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-zinc-800">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => { onApply(strategy); onClose(); }}>Apply Compression</Button>
        </div>
      </div>
    </div>
  );
}
