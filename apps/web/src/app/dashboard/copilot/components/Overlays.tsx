import React from 'react';
import { Icons } from './Icons';

// --- Simple Button Replacement if not available ---
const SimpleButton = ({ children, variant = 'primary', size = 'md', className = '', ...props }: any) => {
  const variants: any = {
    primary: 'bg-white text-zinc-900 hover:bg-zinc-100',
    secondary: 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700',
    ghost: 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    outline: 'border border-zinc-700 text-zinc-300 hover:bg-zinc-800'
  };
  const sizes: any = { sm: 'h-7 px-2.5 text-xs', md: 'h-9 px-3 text-sm', lg: 'h-11 px-5 text-base', icon: 'h-9 w-9', 'icon-sm': 'h-7 w-7' };
  
  return (
    <button className={`inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </button>
  );
};

const CONTEXT_LIMITS = {
  warning: 80000,
  danger: 120000,
  max: 150000
};

export function ContextWarning({ tokens, onCompress, onNewChat }: any) {
  const percentage = Math.min((tokens / CONTEXT_LIMITS.max) * 100, 100);
  const isDanger = tokens >= CONTEXT_LIMITS.danger;
  const isWarning = tokens >= CONTEXT_LIMITS.warning;
  const isCritical = tokens >= CONTEXT_LIMITS.max * 0.95;

  if (!isWarning) return null;

  return (
    <div className={`mx-4 mb-3 p-3 rounded-xl ${isDanger ? 'bg-red-900/20 border border-red-900/40' : 'bg-amber-900/20 border border-amber-900/40'}`}>
      <div className="flex items-start gap-3">
        <span className={isDanger ? 'text-red-400' : 'text-amber-400'}>{Icons.warning}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <h4 className={`text-sm font-medium ${isDanger ? 'text-red-300' : 'text-amber-300'}`}>
              {isCritical ? 'Context Limit Reached' : isDanger ? 'Running Low on Context' : 'Context Usage High'}
            </h4>
            <span className="text-xs text-zinc-400">{Math.round(percentage)}% used</span>
          </div>
          
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-3">
            <div 
              className={`h-full transition-all ${isDanger ? 'bg-red-500' : 'bg-amber-500'}`}
              style={{ width: `${percentage}%` }}
            />
          </div>

          <p className="text-xs text-zinc-400 mb-3">
            {isCritical 
              ? "You've reached the context limit. Start a new chat to continue."
              : isDanger 
                ? "Context is almost full. Consider compressing or starting fresh."
                : "Your conversation is getting long. Compress to free up space."
            }
          </p>

          <div className="flex gap-2">
            <SimpleButton variant="secondary" size="sm" onClick={onCompress} className="gap-1.5">
              {Icons.compress}
              Compress
            </SimpleButton>
            <SimpleButton variant={isCritical ? 'primary' : 'ghost'} size="sm" onClick={onNewChat} className="gap-1.5">
              {Icons.plus}
              New Chat
            </SimpleButton>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CompactingOverlay({ isVisible, progress, stage }: any) {
  if (!isVisible) return null;

  const stages = [
    { id: 'analyzing', label: 'Analyzing conversation history...', icon: Icons.search },
    { id: 'summarizing', label: 'Summarizing key information...', icon: Icons.sparkles },
    { id: 'compressing', label: 'Compressing context...', icon: Icons.compress },
    { id: 'rebuilding', label: 'Rebuilding conversation state...', icon: Icons.refresh },
    { id: 'complete', label: 'Compaction complete!', icon: Icons.check }
  ];

  const currentStageIndex = stages.findIndex(s => s.id === stage);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/95 backdrop-blur-md">
      <div className="w-full max-w-md text-center px-6">
        <div className="relative w-24 h-24 mx-auto mb-8">
          <div className="absolute inset-0 rounded-full border-4 border-zinc-800" />
          <svg className="absolute inset-0 w-24 h-24 -rotate-90">
            <circle
              cx="48"
              cy="48"
              r="44"
              fill="none"
              stroke="url(#gradient)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${progress * 2.76} 276`}
              className="transition-all duration-500"
            />
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#06b6d4" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={`text-emerald-400 ${stage !== 'complete' ? 'animate-pulse' : ''}`}>
              {/* Simple spinner or icon */}
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
              </svg>
            </div>
          </div>
        </div>

        <h2 className="text-xl font-semibold text-zinc-100 mb-2">
          Compacting our conversation...
        </h2>
        <p className="text-sm text-zinc-500 mb-8">
          This helps maintain context quality while freeing up space
        </p>

        <div className="space-y-3 text-left max-w-xs mx-auto">
          {stages.map((s, idx) => (
            <div 
              key={s.id}
              className={`flex items-center gap-3 transition-all duration-300 ${
                idx < currentStageIndex ? 'opacity-50' : 
                idx === currentStageIndex ? 'opacity-100' : 'opacity-30'
              }`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                idx < currentStageIndex ? 'bg-emerald-500/20 text-emerald-400' :
                idx === currentStageIndex ? 'bg-emerald-500 text-white' : 'bg-zinc-800 text-zinc-600'
              }`}>
                {idx < currentStageIndex ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : idx === currentStageIndex ? (
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                ) : (
                  <div className="w-1.5 h-1.5 bg-zinc-600 rounded-full" />
                )}
              </div>
              <span className={`text-sm ${idx === currentStageIndex ? 'text-zinc-100 font-medium' : 'text-zinc-500'}`}>
                {s.label}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-8">
          <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-zinc-600 mt-2">{Math.round(progress)}% complete</p>
        </div>
      </div>
    </div>
  );
}

export { SimpleButton as Button };
