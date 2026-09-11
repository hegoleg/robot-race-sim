import React, { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { Settings, Sliders, Route } from 'lucide-react';

export const SettingsPanel: React.FC = () => {
  const { settings, updateSettings, trackSettings, updateTrackSettings } = useStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    updateSettings({ [name]: parseFloat(value) || 0 });
  };

  const handleTrackChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    const { name, value } = e.target;
    updateTrackSettings({ [name]: name === 'type' ? value : parseFloat(value) || 0 });
  };

  // Draw Robot Scheme preview
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2 + 25;
    const scale = 1.4;

    ctx.save();
    ctx.translate(cx, cy);

    // Chassis body
    ctx.fillStyle = '#2563eb';
    ctx.strokeStyle = '#1d4ed8';
    ctx.lineWidth = 2;
    ctx.fillRect(-15 * scale, (-settings.wheelbase / 2) * scale, 30 * scale, settings.wheelbase * scale);
    ctx.strokeRect(-15 * scale, (-settings.wheelbase / 2) * scale, 30 * scale, settings.wheelbase * scale);

    // Wheels
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-settings.wheelRadius * scale, (-settings.wheelbase / 2 - 4) * scale, settings.wheelRadius * 2 * scale, 8 * scale);
    ctx.fillRect(-settings.wheelRadius * scale, (settings.wheelbase / 2 - 4) * scale, settings.wheelRadius * 2 * scale, 8 * scale);

    // Sensors
    const totalWidth = (settings.sensorCount - 1) * settings.sensorSpacing;
    const startOffset = -totalWidth / 2;
    ctx.fillStyle = '#ef4444';
    
    for (let i = 0; i < settings.sensorCount; i++) {
      const latOffset = startOffset + i * settings.sensorSpacing;
      ctx.beginPath();
      ctx.arc(settings.sensorDistance * scale, latOffset * scale, 3.5, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Direction arrow
    ctx.strokeStyle = '#f59e0b';
    ctx.fillStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(20 * scale, 0);
    ctx.stroke();

    ctx.restore();
  }, [settings]);

  return (
    <div className="w-80 bg-white border-l border-slate-200 flex flex-col h-full text-sm shrink-0">
      <div className="p-3 border-b border-slate-200 flex items-center gap-2 bg-slate-50">
        <Settings className="w-5 h-5 text-slate-600" />
        <h2 className="font-semibold text-slate-800">Конфигурация робота</h2>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <section>
          <div className="flex items-center gap-2 mb-2">
            <Route className="w-4 h-4 text-blue-600" />
            <h3 className="font-semibold text-slate-700 text-xs uppercase tracking-wider">Параметры трассы</h3>
          </div>
          <div className="space-y-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Форма трассы</label>
              <select 
                name="type" value={trackSettings.type} onChange={handleTrackChange}
                className="w-full border border-slate-300 rounded-md p-1.5 text-xs bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="infinity">Восьмерка (Infinity)</option>
                <option value="oval">Овал (Oval)</option>
                <option value="sharp">Острые повороты (Sharp)</option>
              </select>
            </div>
            <div>
              <label className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                <span>Ширина линии (px)</span>
                <span className="font-mono text-blue-600 font-semibold">{trackSettings.lineWidth}</span>
              </label>
              <input 
                type="range" name="lineWidth" 
                min="8" max="40" step="1" 
                value={trackSettings.lineWidth} onChange={handleTrackChange}
                className="w-full accent-blue-600"
              />
            </div>
          </div>
        </section>

        <section>
          <div className="flex items-center gap-2 mb-2">
            <Sliders className="w-4 h-4 text-blue-600" />
            <h3 className="font-semibold text-slate-700 text-xs uppercase tracking-wider">Схема шасси и датчиков</h3>
          </div>
          
          <div className="bg-slate-50 border border-slate-200 rounded-lg flex justify-center py-2 mb-3">
            <canvas ref={canvasRef} width={240} height={160} />
          </div>

          <div className="space-y-3">
            <div>
              <label className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                <span>Колесная база (px)</span>
                <span className="font-mono text-blue-600 font-semibold">{settings.wheelbase}</span>
              </label>
              <input type="range" name="wheelbase" min="20" max="100" step="1" value={settings.wheelbase} onChange={handleChange} className="w-full accent-blue-600" />
            </div>
            
            <div>
              <label className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                <span>Количество сенсоров</span>
                <span className="font-mono text-blue-600 font-semibold">{settings.sensorCount}</span>
              </label>
              <input type="range" name="sensorCount" min="1" max="15" step="2" value={settings.sensorCount} onChange={handleChange} className="w-full accent-blue-600" />
            </div>
            
            <div>
              <label className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                <span>Расстояние между датчиками (px)</span>
                <span className="font-mono text-blue-600 font-semibold">{settings.sensorSpacing}</span>
              </label>
              <input type="range" name="sensorSpacing" min="2" max="30" step="1" value={settings.sensorSpacing} onChange={handleChange} className="w-full accent-blue-600" />
            </div>

            <div>
              <label className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                <span>Вынос планки датчиков (px)</span>
                <span className="font-mono text-blue-600 font-semibold">{settings.sensorDistance}</span>
              </label>
              <input type="range" name="sensorDistance" min="10" max="100" step="1" value={settings.sensorDistance} onChange={handleChange} className="w-full accent-blue-600" />
            </div>

            <div>
              <label className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                <span>Макс. скорость (px/s)</span>
                <span className="font-mono text-blue-600 font-semibold">{settings.maxSpeed}</span>
              </label>
              <input type="range" name="maxSpeed" min="40" max="400" step="5" value={settings.maxSpeed} onChange={handleChange} className="w-full accent-blue-600" />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
