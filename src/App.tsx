import { SettingsPanel } from './components/SettingsPanel';
import { CodeEditorPanel } from './components/CodeEditorPanel';
import { SimulationCanvas } from './components/SimulationCanvas';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useStore } from './store/useStore';
import { sound } from './utils/sound';
import { Bot, Play, Square, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { useState } from 'react';

function App() {
  const { simState, toggleSim, resetSim } = useStore();
  const [soundOn, setSoundOn] = useState(true);

  const handleToggleSim = () => {
    if (!simState.isRunning) {
      sound.playStart();
    } else {
      sound.playPause();
    }
    toggleSim();
  };

  const handleResetSim = () => {
    sound.playClick();
    resetSim();
  };

  const toggleSound = () => {
    sound.enabled = !soundOn;
    setSoundOn(!soundOn);
  };

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-screen overflow-hidden bg-slate-100 font-sans select-none">
        <header className="bg-slate-900 text-white px-4 py-2 flex items-center justify-between shrink-0 shadow-md z-10 border-b border-slate-800 gap-4">
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

          {/* Central Prominent Robot Start & Control Bar */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleToggleSim}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg font-bold text-xs cursor-pointer shadow-lg transition-all duration-150 active:scale-95 ${
                simState.isRunning
                  ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/40 ring-2 ring-amber-400/50'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40 ring-2 ring-emerald-400/50 animate-pulse'
              }`}
              title="Запустить робота / Пауза (Горячая клавиша: Пробел)"
            >
              {simState.isRunning ? (
                <>
                  <Square className="w-4 h-4 fill-white" />
                  <span>Пауза</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>Запустить робота</span>
                </>
              )}
              <span className="text-[10px] font-mono opacity-80 bg-black/25 px-1.5 py-0.5 rounded ml-0.5">
                Пробел
              </span>
            </button>

            <button
              onClick={handleResetSim}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg font-semibold text-xs transition cursor-pointer shadow-sm active:scale-95"
              title="Сбросить робота на стартовую позицию (Клавиша: R)"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>Сброс</span>
            </button>
          </div>

          {/* Right Status and Options */}
          <div className="flex items-center gap-3 shrink-0 text-xs">
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-[11px]">
              <span className={`w-2 h-2 rounded-full ${simState.isRunning ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`} />
              <span className="text-slate-300">
                {simState.isRunning ? 'Робот на трассе' : 'Готов к старту'}
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
