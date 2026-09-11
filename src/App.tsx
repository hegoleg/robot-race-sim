import { SettingsPanel } from './components/SettingsPanel';
import { CodeEditorPanel } from './components/CodeEditorPanel';
import { SimulationCanvas } from './components/SimulationCanvas';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useStore } from './store/useStore';
import { sound } from './utils/sound';
import { Bot, Volume2, VolumeX } from 'lucide-react';
import { useState } from 'react';

function App() {
  const { simState } = useStore();
  const [soundOn, setSoundOn] = useState(true);

  const toggleSound = () => {
    sound.enabled = !soundOn;
    setSoundOn(!soundOn);
  };

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-screen overflow-hidden bg-slate-100 font-sans select-none">
        <header className="bg-slate-900 text-white px-4 py-2.5 flex items-center justify-between shrink-0 shadow-md z-10 border-b border-slate-800 gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <div className="p-1.5 bg-blue-600/20 text-blue-400 rounded-lg border border-blue-500/30 shadow-inner">
              <Bot className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
                Line Robot Simulator
                <span className="text-[10px] bg-blue-500/20 text-blue-300 font-medium px-2 py-0.5 rounded-full border border-blue-400/30">
                  Pro Edition
                </span>
              </h1>
            </div>
          </div>

          {/* Right Status and Sound Toggle */}
          <div className="flex items-center gap-3 shrink-0 text-xs">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-[11px]">
              <span className={`w-2 h-2 rounded-full ${simState.isRunning ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`} />
              <span className="text-slate-300">
                {simState.isRunning ? 'Робот на трассе (заезд активен)' : 'Робот готов к старту'}
              </span>
            </div>

            <button
              onClick={toggleSound}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition cursor-pointer border border-slate-700"
              title={soundOn ? 'Выключить звуковые эффекты' : 'Включить звуковые эффекты'}
            >
              {soundOn ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
            </button>
          </div>
        </header>
        
        <main className="flex flex-1 overflow-hidden">
          <CodeEditorPanel />
          <SimulationCanvas />
          <SettingsPanel />
        </main>
      </div>
    </ErrorBoundary>
  );
}

export default App;
