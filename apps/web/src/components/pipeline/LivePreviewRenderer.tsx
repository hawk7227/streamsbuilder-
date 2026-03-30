'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { ExtractedArtifact } from '@/lib/activity-stream/code-extractor';

interface LivePreviewRendererProps {
  artifact: ExtractedArtifact;
  width?: number;
  height?: number;
  onError?: (msg: string) => void;
}

// Builds the full srcdoc for the sandboxed iframe.
// For JSX/TSX/React: loads Babel standalone + React from CDN, transpiles, renders.
// For HTML: injects directly.
function buildSrcdoc(artifact: ExtractedArtifact): string {
  if (artifact.language === 'html') {
    return artifact.code;
  }

  // JSX / TSX / React / JS / TS — transpile with Babel Standalone
  const escapedCode = artifact.code
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; padding: 8px; font-family: ui-sans-serif, system-ui, sans-serif; }
    #root { width: 100%; }
    #error-display {
      display: none; padding: 12px; border-radius: 6px;
      background: #fef2f2; border: 1px solid #fecaca;
      color: #b91c1c; font-size: 12px; font-family: monospace;
      white-space: pre-wrap; word-break: break-word;
    }
  </style>
</head>
<body>
  <div id="error-display"></div>
  <div id="root"></div>
  <script>
    window.addEventListener('error', function(e) {
      var el = document.getElementById('error-display');
      el.style.display = 'block';
      el.textContent = e.message;
      window.parent.postMessage({ type: 'preview-error', message: e.message }, '*');
    });
  </script>
  <script type="text/babel" data-presets="react,typescript" data-type="module">
    try {
      const userCode = \`${escapedCode}\`;

      // Transpile user code
      const transpiled = Babel.transform(userCode, {
        presets: ['react', 'typescript'],
        filename: 'Component.tsx',
      }).code;

      // Execute the transpiled code in a controlled scope
      const module = { exports: {} };
      const exports = module.exports;
      const fn = new Function('React', 'module', 'exports', 'require', transpiled);

      const fakeRequire = (mod) => {
        if (mod === 'react') return React;
        if (mod === 'react-dom') return ReactDOM;
        throw new Error('Module not available: ' + mod);
      };

      fn(React, module, exports, fakeRequire);

      // Resolve the default export as the component
      const Component =
        module.exports.default ||
        module.exports[Object.keys(module.exports)[0]] ||
        null;

      if (Component && typeof Component === 'function') {
        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(React.createElement(React.StrictMode, null,
          React.createElement(Component)
        ));
        window.parent.postMessage({ type: 'preview-ready' }, '*');
      } else {
        throw new Error('No default export found. Export a React component as the default export.');
      }
    } catch(err) {
      var el = document.getElementById('error-display');
      el.style.display = 'block';
      el.textContent = String(err);
      window.parent.postMessage({ type: 'preview-error', message: String(err) }, '*');
    }
  </script>
</body>
</html>`;
}

export function LivePreviewRenderer({ artifact, width = 320, height = 480, onError }: LivePreviewRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [renderState, setRenderState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Rebuild srcdoc whenever artifact code changes
  useEffect(() => {
    if (!artifact.code.trim()) return;
    setRenderState('loading');
    setErrorMsg(null);

    const iframe = iframeRef.current;
    if (!iframe) return;

    try {
      iframe.srcdoc = buildSrcdoc(artifact);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setRenderState('error');
      setErrorMsg(msg);
      onError?.(msg);
    }
  }, [artifact.code, artifact.language, onError]);

  // Listen for messages from the iframe
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (!iframeRef.current) return;
      const data = e.data as { type?: string; message?: string };
      if (data?.type === 'preview-ready') {
        setRenderState('ready');
      } else if (data?.type === 'preview-error') {
        setRenderState('error');
        setErrorMsg(data.message ?? 'Unknown render error');
        onError?.(data.message ?? 'Unknown render error');
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onError]);

  return (
    <div style={{ position: 'relative', width, height, borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
      {/* Loading overlay */}
      {renderState === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 2,
          background: 'rgba(8,12,33,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 6,
        }}>
          <div style={{ fontSize: 11, color: '#67e8f9' }}>Rendering preview...</div>
          <div style={{ fontSize: 9, color: '#475569' }}>Compiling component</div>
        </div>
      )}

      {/* Error overlay */}
      {renderState === 'error' && errorMsg && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 2,
          background: 'rgba(127,29,29,0.95)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start',
          padding: 12, flexDirection: 'column', gap: 4, overflowY: 'auto',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#fca5a5', letterSpacing: '0.05em' }}>
            PREVIEW ERROR
          </div>
          <pre style={{ fontSize: 9, color: '#fecaca', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
            {errorMsg}
          </pre>
        </div>
      )}

      <iframe
        ref={iframeRef}
        sandbox="allow-scripts"
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="STREAMS Live Preview"
      />
    </div>
  );
}
