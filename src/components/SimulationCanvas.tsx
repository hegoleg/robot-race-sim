import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { engine, PIXELS_PER_METER } from '../engine/RobotEngine';
import { sound } from '../utils/sound';
import { Play, Square, RotateCcw, Crosshair, Trophy, Activity, Gauge, Radio } from 'lucide-react';
import { SensorBar } from './SensorBar';
import { Oscilloscope } from './Oscilloscope';

export const SimulationCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackCanvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | undefined>(undefined);
  const lastTimeRef = useRef<number>(0);
  const [isDragging, setIsDragging] = useState(false);

  const {
    hardware,
    simState,
    code,
    trackSettings,
    updateSimState,
    toggleSim,
    resetSim,
    triggerBootButton,
    setTimeScale,
    toggleOscilloscope,
  } = useStore();

  const simStateRef = useRef(simState);
  simStateRef.current = simState;

  const hardwareRef = useRef(hardware);
  hardwareRef.current = hardware;

  const codeRef = useRef(code);
  codeRef.current = code;

  const trackSettingsRef = useRef(trackSettings);
  trackSettingsRef.current = trackSettings;

  // Redraw track when trackSettings change
  useEffect(() => {
    const trackCanvas = trackCanvasRef.current;
    if (trackCanvas) {
      const ctx = trackCanvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        engine.drawTrack(ctx, trackSettingsRef.current);
      }
    }
  }, [trackSettings]);

  const drawRobot = (
    ctx: CanvasRenderingContext2D,
    state: typeof simStateRef.current,
    h: typeof hardwareRef.current
  ) => {
    // 1. Draw trajectory breadcrumbs
    if (state.trail && state.trail.length > 1) {
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.25)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(state.trail[0].x, state.trail[0].y);
      for (let i = 1; i < state.trail.length; i++) {
        ctx.lineTo(state.trail[i].x, state.trail[i].y);
      }
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(state.robotX, state.robotY);
    ctx.rotate(state.robotAngle);

    const scale = PIXELS_PER_METER / 1000; // mm to pixels conversion (~0.7 to 1.4 px/mm)
    const wbPx = (h.wheelbase / 2) * scale;
    const rPx = h.wheelRadius * scale;
    const wPx = Math.max(3, (h.wheelWidth / 2) * scale);

    // Chassis body
    ctx.fillStyle = 'rgba(30, 58, 138, 0.85)';
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-rPx * 1.2, -wbPx + 3, rPx * 2.2, (wbPx - 3) * 2, 4);
    ctx.fill();
    ctx.stroke();

    // Tactile BOOT / START push-button on robot chassis
    const btnX = -rPx * 0.1;
    const btnY = 0;
    // Button bezel
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(btnX - 5, btnY - 5, 10, 10, 2);
    ctx.fill();
    ctx.stroke();

    // Button push-cap
    ctx.fillStyle = state.bootButtonPressed ? '#ea580c' : '#f59e0b';
    ctx.beginPath();
    ctx.arc(btnX, btnY, state.bootButtonPressed ? 2.5 : 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Robot Running Status LED
    ctx.fillStyle = state.isRunning ? '#22c55e' : '#ef4444';
    if (state.isRunning) {
      ctx.shadowColor = '#22c55e';
      ctx.shadowBlur = 6;
    }
    ctx.beginPath();
    ctx.arc(rPx * 0.4, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Wheels (with width visualization)
    ctx.fillStyle = '#0f172a';
    // Left wheel
    ctx.fillRect(-rPx, -wbPx - wPx, rPx * 2, wPx * 2);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    ctx.strokeRect(-rPx, -wbPx - wPx, rPx * 2, wPx * 2);

    // Right wheel
    ctx.fillRect(-rPx, wbPx - wPx, rPx * 2, wPx * 2);
    ctx.strokeRect(-rPx, wbPx - wPx, rPx * 2, wPx * 2);

    // Wheel rims
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(-rPx / 2, -wbPx - 1, rPx, 2);
    ctx.fillRect(-rPx / 2, wbPx - 1, rPx, 2);

    // Sensor boom bar
    const boomDistPx = h.sensorDistance * scale;
    const spacingPx = h.sensorSpacing * scale;
    const totalSensorWidthPx = (h.sensorCount - 1) * spacingPx;
    const startOffsetPx = -totalSensorWidthPx / 2;

    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(rPx, 0);
    ctx.lineTo(boomDistPx, 0);
    ctx.stroke();

    // Sensor PCB bar
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(boomDistPx - 2, startOffsetPx - 3, 4, totalSensorWidthPx + 6);

    // Sensor LEDs with active line glow
    const sensors = engine.readSensors(state, h);

    for (let i = 0; i < h.sensorCount; i++) {
      const latOffset = startOffsetPx + i * spacingPx;
      ctx.beginPath();
      ctx.arc(boomDistPx, latOffset, 3.5, 0, 2 * Math.PI);

      const val = sensors[i] || 0;
      if (val > 0.4) {
        ctx.fillStyle = '#ef4444';
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 6;
      } else {
        ctx.fillStyle = '#10b981';
        ctx.shadowBlur = 0;
      }
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Heading direction pointer
    ctx.strokeStyle = '#f59e0b';
    ctx.fillStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(24, 0);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(24, 0);
    ctx.lineTo(18, -4);
    ctx.lineTo(18, 4);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  };

  const update = (time: number) => {
    if (!lastTimeRef.current) lastTimeRef.current = time;
    const baseDt = Math.min((time - lastTimeRef.current) / 1000, 0.05);
    lastTimeRef.current = time;
    const dt = baseDt * (simStateRef.current.timeScale || 1.0);

    if (simStateRef.current.isRunning) {
      const newState = engine.update(
        simStateRef.current,
        hardwareRef.current,
        codeRef.current,
        dt
      );
      updateSimState(newState);
    }

    const canvas = canvasRef.current;
    const trackCanvas = trackCanvasRef.current;
    if (canvas && trackCanvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(trackCanvas, 0, 0);
        drawRobot(ctx, simStateRef.current, hardwareRef.current);
      }
    }

    requestRef.current = requestAnimationFrame(update);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

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

  const handleBootClick = () => {
    sound.playClick();
    if (!simState.isRunning) {
      sound.playStart();
    } else {
      sound.playPause();
    }
    triggerBootButton();
  };

  // Sound effect on new lap record
  useEffect(() => {
    if (simState.newRecordAlert) {
      sound.playLapRecord();
    }
  }, [simState.newRecordAlert]);

  // Global keyboard shortcut handler (Space = Start/Pause, R = Reset)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        handleToggleSim();
      } else if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') {
        e.preventDefault();
        handleResetSim();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [simState.isRunning]);

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e);
    setIsDragging(true);
    updateSimState({
      robotX: coords.x,
      robotY: coords.y,
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    const coords = getCanvasCoords(e);
    const dx = coords.x - simState.robotX;
    const dy = coords.y - simState.robotY;
    if (Math.hypot(dx, dy) > 8) {
      const angle = Math.atan2(dy, dx);
      updateSimState({ robotAngle: angle });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const speedKmh = Math.abs(simState.linearVelocity * 3.6);

  return (
    <div className="flex-1 flex flex-col bg-slate-100 p-3 overflow-hidden select-none">
      {/* Top Controls Toolbar */}
      <div className="mb-2 flex items-center justify-between gap-2 flex-wrap shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            Трасса тестирования
            <span className="text-[11px] font-normal text-slate-500 hidden sm:flex items-center gap-1">
              <Crosshair className="w-3.5 h-3.5" /> (кликните для перемещения, потяните для поворота)
            </span>
          </h2>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Speed multiplier selector */}
          <div className="flex items-center bg-white border border-slate-300 rounded-lg p-0.5 shadow-xs">
            <span className="text-[10px] text-slate-400 font-bold px-1.5 flex items-center gap-0.5" title="Скорость симуляции">
              <Gauge className="w-3 h-3" />
            </span>
            {[0.5, 1.0, 2.0, 5.0].map((scale) => (
              <button
                key={scale}
                onClick={() => setTimeScale(scale)}
                className={`px-2 py-1 text-[11px] font-bold rounded cursor-pointer transition ${
                  (simState.timeScale || 1.0) === scale
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {scale}x
              </button>
            ))}
          </div>

          {/* Oscilloscope toggle button */}
          <button
            onClick={toggleOscilloscope}
            className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg font-semibold text-xs transition cursor-pointer shadow-xs ${
              simState.showOscilloscope
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
            title="Показать / скрыть осциллограф телеметрии PID"
          >
            <Activity className="w-3.5 h-3.5" />
            График
          </button>

          {/* Start Robot Button */}
          <button 
            onClick={handleToggleSim}
            className={`flex items-center gap-2 px-4 py-1.5 text-white rounded-lg font-bold text-xs transition cursor-pointer shadow-md active:scale-95 ${
              simState.isRunning 
                ? 'bg-amber-600 hover:bg-amber-500 ring-2 ring-amber-400/50' 
                : 'bg-emerald-600 hover:bg-emerald-500 ring-2 ring-emerald-400/50 animate-pulse'
            }`}
            title="Запустить / остановить робота (Пробел)"
          >
            {simState.isRunning ? <Square className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white" />}
            <span>{simState.isRunning ? 'Пауза' : 'Запустить робота'}</span>
            <span className="text-[10px] opacity-75 font-mono bg-black/20 px-1 py-0.5 rounded ml-0.5">
              Пробел
            </span>
          </button>
          
          {/* Reset Robot Button */}
          <button 
            onClick={handleResetSim}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold text-xs transition cursor-pointer shadow-xs active:scale-95"
            title="Сбросить робота на стартовую позицию (R)"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>Сброс (R)</span>
          </button>
        </div>
      </div>
      
      {/* Simulation Arena Box */}
      <div className="flex-1 relative rounded-xl border border-slate-300/80 shadow-inner bg-slate-200/80 overflow-hidden flex items-center justify-center p-2">
        <canvas 
          ref={trackCanvasRef}
          width={trackSettings.width} 
          height={trackSettings.height}
          className="hidden"
        />
        <canvas 
          ref={canvasRef}
          width={trackSettings.width} 
          height={trackSettings.height}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          className="bg-white shadow-xl rounded-lg cursor-crosshair border border-slate-200"
          style={{ width: `${trackSettings.width}px`, height: `${trackSettings.height}px`, maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
        />
        
        {/* Real-time Telemetry & Lap Timing HUD */}
        <div className="absolute top-4 left-4 bg-slate-900/85 backdrop-blur-md text-white p-3 rounded-xl text-xs font-mono shadow-xl border border-slate-700/60 min-w-[210px] space-y-2">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-700 pb-1.5">
            <span className="text-slate-400 text-[10px] uppercase tracking-wider font-bold flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-blue-400" />
              Телеметрия заезда
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-400/30">
              Кругов: {simState.lapCount}
            </span>
          </div>

          {/* Speed & Dynamics */}
          <div className="space-y-1">
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[11px]">Скорость:</span>
              <span className="text-base font-bold text-cyan-300">
                {speedKmh.toFixed(1)} <span className="text-[10px] text-slate-400">км/ч</span>
                <span className="text-xs text-slate-400 font-normal ml-1">({simState.linearVelocity.toFixed(2)} м/с)</span>
              </span>
            </div>

            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">ШИМ L / R:</span>
              <span className="font-semibold text-slate-200">
                <span className={simState.leftMotorSpeed >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {(simState.leftMotorSpeed * 100).toFixed(0)}%
                </span>
                {' / '}
                <span className={simState.rightMotorSpeed >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {(simState.rightMotorSpeed * 100).toFixed(0)}%
                </span>
              </span>
            </div>
          </div>

          {/* Lap Times */}
          <div className="border-t border-slate-800 pt-1.5 space-y-1">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-400 flex items-center gap-1">
                ⏱️ Текущий круг:
              </span>
              <span className="font-bold text-amber-300">
                {simState.currentLapTime.toFixed(2)} с
              </span>
            </div>

            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-400 flex items-center gap-1">
                <Trophy className="w-3.5 h-3.5 text-yellow-400" />
                Лучший круг:
              </span>
              <span className="font-bold text-yellow-300">
                {simState.bestLapTime ? `${simState.bestLapTime.toFixed(2)} с` : '—'}
              </span>
            </div>
          </div>

          {/* Quality metric */}
          <div className="border-t border-slate-800 pt-1 flex justify-between text-[10px] text-slate-400">
            <span>Удержание линии:</span>
            <span className={simState.onLinePercentage > 85 ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
              {simState.onLinePercentage}%
            </span>
          </div>
        </div>

        {/* Lap record toast notification */}
        {simState.newRecordAlert && (
          <div className="absolute top-4 inset-x-0 mx-auto w-fit bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-black px-4 py-2 rounded-full shadow-2xl border-2 border-yellow-200 animate-bounce flex items-center gap-2 text-xs tracking-wide z-30">
            <Trophy className="w-4 h-4 text-slate-950 fill-current" />
            НОВЫЙ РЕКОРД КРУГА: {simState.bestLapTime?.toFixed(2)} сек!
          </div>
        )}

        {/* Interactive Physical Robot Launch / BOOT Button Widget */}
        <button
          onClick={handleBootClick}
          className={`absolute bottom-4 right-4 z-20 flex items-center gap-3 px-4 py-2.5 rounded-xl border font-mono shadow-2xl transition-all duration-150 active:scale-95 cursor-pointer backdrop-blur-md ${
            simState.isRunning
              ? 'bg-slate-900/90 border-amber-500/80 text-amber-300 shadow-amber-950/60 hover:bg-slate-900'
              : 'bg-slate-900/90 border-emerald-500/80 text-emerald-300 shadow-emerald-950/60 hover:bg-slate-900 hover:border-emerald-400 ring-2 ring-emerald-500/30'
          }`}
          title="Физическая кнопка запуска робота BOOT (GPIO 0). Кликните для запуска или остановки заезда"
        >
          <div className="relative flex items-center justify-center shrink-0">
            <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shadow-inner transition-transform duration-100 ${
              simState.bootButtonPressed 
                ? 'scale-90 bg-amber-600 border-amber-300' 
                : simState.isRunning
                ? 'bg-amber-500/20 border-amber-400'
                : 'bg-emerald-500/20 border-emerald-400 animate-pulse'
            }`}>
              <div className={`w-4 h-4 rounded-full transition-colors ${
                simState.isRunning ? 'bg-amber-400 shadow-sm shadow-amber-400' : 'bg-emerald-400 shadow-sm shadow-emerald-400'
              }`} />
            </div>
            {simState.isRunning && (
              <span className="absolute w-8 h-8 rounded-full border-2 border-emerald-400 animate-ping pointer-events-none opacity-40" />
            )}
          </div>
          
          <div className="flex flex-col text-left">
            <div className="flex items-center gap-1 text-[9px] text-slate-400 uppercase tracking-widest font-bold">
              <Radio className="w-3 h-3 text-cyan-400" />
              Кнопка робота (BOOT / GPIO 0)
            </div>
            <div className="text-xs font-black tracking-wide text-white flex items-center gap-2">
              <span>{simState.isRunning ? 'ОСТАНОВИТЬ РОБОТА' : 'ЗАПУСТИТЬ РОБОТА'}</span>
              <span className="text-[9px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700 font-mono">
                Клик
              </span>
            </div>
          </div>
        </button>
      </div>

      {/* Real-time Optical Sensor Bar Monitor */}
      <SensorBar />

      {/* Live PID & Dynamics Oscilloscope */}
      {simState.showOscilloscope && <Oscilloscope />}
    </div>
  );
};
