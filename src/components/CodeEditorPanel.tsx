import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { useStore } from '../store/useStore';
import { Code2, Terminal } from 'lucide-react';

export const CodeEditorPanel: React.FC = () => {
  const { code, setCode } = useStore();
  const [useMonaco, setUseMonaco] = useState(true);

  return (
    <div className="flex-1 flex flex-col min-w-[320px] max-w-[500px] border-r border-slate-200 bg-slate-900 text-white">
      <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-950">
        <div className="flex items-center gap-2">
          <Code2 className="w-5 h-5 text-blue-400" />
          <h2 className="font-semibold text-sm text-slate-200">Алгоритм управления (JS)</h2>
        </div>
        <button
          onClick={() => setUseMonaco(!useMonaco)}
          className="text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center gap-1 cursor-pointer"
          title="Переключить режим редактора"
        >
          <Terminal className="w-3.5 h-3.5" />
          {useMonaco ? 'Monaco' : 'Простой'}
        </button>
      </div>

      <div className="flex-1 relative overflow-hidden bg-[#1e1e1e]">
        {useMonaco ? (
          <Editor
            height="100%"
            defaultLanguage="javascript"
            theme="vs-dark"
            value={code}
            onChange={(value) => setCode(value || '')}
            loading={
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                Загрузка редактора кода...
              </div>
            }
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              wordWrap: 'on',
              lineNumbers: 'on',
              tabSize: 2,
              scrollBeyondLastLine: false,
            }}
          />
        ) : (
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            className="w-full h-full p-4 font-mono text-sm bg-slate-950 text-slate-200 resize-none outline-none leading-relaxed border-0"
          />
        )}
      </div>

      <div className="p-2 border-t border-slate-800 bg-slate-950 text-[11px] text-slate-400 flex justify-between">
        <span>Функция: <code className="text-amber-400">loop(sensors, dt)</code></span>
        <span>Возврат: <code className="text-emerald-400">&#123; leftSpeed, rightSpeed &#125;</code></span>
      </div>
    </div>
  );
};
