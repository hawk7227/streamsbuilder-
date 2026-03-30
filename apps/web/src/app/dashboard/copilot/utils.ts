
export const extractCodeFromContent = (content: string) => {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    while ((match = codeBlockRegex.exec(content)) !== null) {
        const lang = match[1] || 'javascript';
        const code = match[2].trim();
        if (code.includes('function App') || code.includes('const App') || code.includes('export default') || code.includes('<div') || lang === 'jsx' || lang === 'tsx' || lang === 'html') {
            return { code, language: lang };
        }
    }
    return null;
};

export const generatePreviewHtml = (code: string) => {
    if (!code) return '';
    if (code.includes('<!DOCTYPE') || code.includes('<html')) return code;

    // React wrapping
    if (code.includes('export default') || code.includes('function App') || code.includes('const App') || code.includes('return (')) {
        return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    const { useState, useEffect, useRef, useCallback } = React;
    ${code}
    try {
      const root = ReactDOM.createRoot(document.getElementById('root'));
      root.render(<App />);
    } catch (e) {
      document.getElementById('root').innerHTML = '<div style="padding:20px;color:red;">Error: ' + e.message + '</div>';
    }
  </script>
</body>
</html>`;
    }
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-white">
  ${code}
</body>
</html>`;
};
