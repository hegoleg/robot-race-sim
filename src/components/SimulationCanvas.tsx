import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { engine } from '../engine/RobotEngine';
import { Play, Square, RotateCcw, Crosshair } from 'lucide-react';

export const SimulationCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackCanvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | undefined>(undefined);
  const lastTimeRef = useRef<number>(0);
  const [isDragging, setIsDragging] = useState(false);

  const { settings, simState, code, trackSettings, updateSimState, toggleSim, resetSim } = useStore();
  const simStateRef = useRef(simState);
  simStateRef.current = simState;

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

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

  const drawRobot = (ctx: CanvasRenderingContext2D, state: typeof simStateRef.current, robotSettings: typeof settingsRef.current) => {
    ctx.save();
    ctx.translate(state.robotX, state.robotY);
    ctx.rotate(state.robotAngle);

    // Chassis body
    ctx.fillStyle = '#2563eb'; // blue-600
    ctx.strokeStyle = '#1d4ed8';
    ctx.lineWidth = 2;
    ctx.fillRect(-15, -robotSettings.wheelbase / 2, 30, robotSettings.wheelbase);
    ctx.strokeRect(-15, -robotSettings.wheelbase / 2, 30, robotSettings.wheelbase);

    // Wheels
    ctx.fillStyle = '#0f172a'; // slate-900
    ctx.fillRect(-robotSettings.wheelRadius, -robotSettings.wheelbase / 2 - 5, robotSettings.wheelRadius * 2, 8); 
    ctx.fillRect(-robotSettings.wheelRadius, robotSettings.wheelbase / 2 - 3, robotSettings.wheelRadius * 2, 8);

    // Sensors
    const totalWidth = (robotSettings.sensorCount - 1) * robotSettings.sensorSpacing;
    const startOffset = -totalWidth / 2;
    const sensors = engine.readSensors(state, robotSettings);

    for (let i = 0; i < robotSettings.sensorCount; i++) {
      const latOffset = startOffset + i * robotSettings.sensorSpacing;
      ctx.beginPath();
      ctx.arc(robotSettings.sensorDistance, latOffset, 4, 0, 2 * Math.PI);
      // Green/Red based on line detection
      const val = sensors[i] || 0;
      if (val > 0.4) {
        ctx.fillStyle = '#ef4444'; // detected line (red glow)
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 4;
      } else {
        ctx.fillStyle = '#10b981'; // white background (green)
        ctx.shadowBlur = 0;
      }
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Heading direction arrow
    ctx.strokeStyle = '#f59e0b';
    ctx.fillStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(24, 0);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(24, 0);
    ctx.lineTo(16, -4);
    ctx.lineTo(16, 4);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  };

  const update = (time: number) => {
    if (!lastTimeRef.current) lastTimeRef.current = time;
    const dt = Math.min((time - lastTimeRef.current) / 1000, 0.1);
    lastTimeRef.current = time;

    if (simStateRef.current.isRunning) {
      const newState = engine.update(
        simStateRef.current,
        settingsRef.current,
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
        drawRobot(ctx, simStateRef.current, settingsRef.current);
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

  return (
    <div className="flex-1 flex flex-col bg-slate-100 p-4 overflow-hidden">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            Симуляция
            <span className="text-xs font-normal text-slate-500 flex items-center gap-1">
              <Crosshair className="w-3.5 h-3.5" /> (кликните по холсту для перемещения робота)
            </span>
          </h2>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={toggleSim}
            className={`flex items-center gap-2 px-4 py-2 text-white rounded-lg font-medium transition cursor-pointer shadow-sm ${
              simState.isRunning 
                ? 'bg-amber-600 hover:bg-amber-700' 
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {simState.isRunning ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {simState.isRunning ? 'Пауза' : 'Старт'}
          </button>
          <button 
            onClick={() => resetSim()}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition cursor-pointer shadow-sm"
          >
            <RotateCcw className="w-4 h-4" />
            Сброс
          </button>
        </div>
      </div>
      
      <div className="flex-1 relative rounded-xl border border-slate-200 shadow-inner bg-slate-200/70 overflow-hidden flex items-center justify-center p-2">
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
          className="bg-white shadow-xl rounded-lg cursor-crosshair"
          style={{ width: `${trackSettings.width}px`, height: `${trackSettings.height}px`, maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
        />
        
        {/* Real-time telemetry dashboard */}
        <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur-sm text-white px-3 py-2 rounded-lg text-xs font-mono shadow-lg border border-slate-700/50 space-y-0.5">
          <div className="text-slate-400 text-[10px] uppercase tracking-wider font-semibold border-b border-slate-700 pb-1 mb-1">
            Телеметрия
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-400">Мотор L:</span>
            <span className={simState.leftMotorSpeed >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
              {(simState.leftMotorSpeed * 100).toFixed(0)}%
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-400">Мотор R:</span>
            <span className={simState.rightMotorSpeed >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
              {(simState.rightMotorSpeed * 100).toFixed(0)}%
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-400">Время:</span>
            <span className="text-cyan-400 font-semibold">{simState.time.toFixed(1)} с</span>
          </div>
        </div>
      </div>
    </div>
  );
};
