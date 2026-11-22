import React, { useEffect, useMemo, useState } from 'react';
import { Check, Code2, Copy, Globe, Terminal, X } from 'lucide-react';
import type { ApiRequest, CodeLanguage, Environment } from '../types/api';
import { generateCodeSnippet } from '../utils/codeGen';

export interface CodeModalProps {
  isOpen: boolean;
  request: ApiRequest;
  activeEnvironment: Environment | null;
  onClose: () => void;
  onCopied: (label: string) => void;
}

const LANGUAGES: Array<{ id: CodeLanguage; label: string; badge: string }> = [
  { id: 'curl', label: 'cURL', badge: 'Shell' },
  { id: 'fetch', label: 'JavaScript (fetch)', badge: 'JS' },
  { id: 'axios', label: 'Axios', badge: 'JS / TS' },
  { id: 'python', label: 'Python (requests)', badge: 'Py' },
];

export const CodeModal: React.FC<CodeModalProps> = ({
  isOpen,
  request,
  activeEnvironment,
  onClose,
  onCopied,
}) => {
  const [language, setLanguage] = useState<CodeLanguage>('curl');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const snippet = useMemo(
    () => generateCodeSnippet(language, request, activeEnvironment),
    [language, request, activeEnvironment]
  );

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      const langName = LANGUAGES.find((l) => l.id === language)?.label ?? language;
      onCopied(`Copied ${langName} snippet`);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      onCopied('Unable to access clipboard');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400">
              <Code2 className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Generate Code Snippet</h2>
              <p className="text-[11px] text-zinc-500">
                Variables resolved using{' '}
                <span className="text-cyan-400">
                  {activeEnvironment ? activeEnvironment.name : 'No Environment'}
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Language Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 bg-zinc-900/50 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {LANGUAGES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setLanguage(item.id);
                  setCopied(false);
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  language === item.id
                    ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                }`}
              >
                <Terminal className="h-3 w-3" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-glow-cyan transition-opacity hover:opacity-90"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? 'Copied!' : 'Copy Snippet'}</span>
          </button>
        </div>

        {/* Code Viewport */}
        <div className="flex-1 overflow-auto bg-[#0b0d13] p-5">
          <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-6 text-cyan-100/95 select-all">
            {snippet}
          </pre>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-800/80 bg-zinc-950 px-5 py-2.5 text-[11px] text-zinc-500">
          <span className="inline-flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 text-zinc-500" />
            Ready to paste directly into your terminal or codebase
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2.5 py-1 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
          >
            Close (Esc)
          </button>
        </div>
      </div>
    </div>
  );
};
