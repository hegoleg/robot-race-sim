import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { useStore, CODE_TEMPLATES } from '../store/useStore';
import { arduinoEnv } from '../engine/ArduinoTranspiler';
import { sound } from '../utils/sound';
import { 
  Code2, 
  Terminal, 
  BookOpen, 
  CheckCircle2, 
  AlertCircle, 
  FileCode, 
  Download, 
  Upload, 
  Check, 
  Cpu, 
  Zap, 
  Radio, 
  ChevronDown, 
  ChevronUp, 
  Sliders 
} from 'lucide-react';

export const CodeEditorPanel: React.FC = () => {
  const { code, setCode, hardware, updateHardware, simState, toggleSim } = useStore();
  const [useMonaco, setUseMonaco] = useState(true);
  const [showDocs, setShowDocs] = useState(false);
  const [showPinoutDetails, setShowPinoutDetails] = useState(false);
  const [exported, setExported] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut Ctrl+Enter to toggle simulation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!simState.isRunning) {
          sound.playStart();
        } else {
          sound.playPause();
        }
        toggleSim();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [simState.isRunning]);

  // Recompile when code or hardware changes to keep pinout diagnostics live
  useEffect(() => {
    arduinoEnv.compile(code, hardware.sensorCount);
  }, [code, hardware.sensorCount]);

  const compileError = arduinoEnv.getCompileError();
  const runtimeError = arduinoEnv.getRuntimeError();
  const pinout = arduinoEnv.getPinoutConfig();

  const handleTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tpl = CODE_TEMPLATES.find(t => t.name === e.target.value);
    if (tpl) {
      setCode(tpl.code);
      setUploadedFileName(null);
    }
  };

  const handleFileProcess = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        setCode(content);
        setUploadedFileName(file.name);
        sound.playButton();

        // Immediately compile to detect pinout and sensor count
        arduinoEnv.compile(content, hardware.sensorCount);
        const detectedCount = arduinoEnv.getDetectedSensorCount();
        if (detectedCount && detectedCount !== hardware.sensorCount) {
          // Automatically suggest or align sensor count
          updateHardware({ sensorCount: detectedCount });
        }
      }
    };
    reader.readAsText(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
    // reset input so the same file can be re-uploaded if modified
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
  };

  const handleExportIno = () => {
    const timestamp = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
    const header = `/* ============================================================
 *  Робот по линии (Line Follower) — Arduino (.ino)
 *  Сгенерировано в Line Robot Simulator (Pro Edition)
 *  Дата экспорта: ${timestamp}
 * ============================================================
 *  АППАРАТНАЯ КОМПОНОВКА ШАССИ:
 *   - Колесная база (wheelbase): ${hardware.wheelbase} мм
 *   - Радиус колес: ${hardware.wheelRadius} мм (диаметр ${hardware.wheelRadius * 2} мм)
 *   - Ширина шины: ${hardware.wheelWidth} мм
 *   - Коэффициент сцепления шин: ${hardware.tireGrip}
 *   - Общий вес робота: ${hardware.weight} г
 *   - Обороты моторов: ${hardware.motorRPM} RPM
 *   - Напряжение питания: ${hardware.batteryVoltage} В (номинал ${hardware.nominalVoltage} В)
 *   - Линейка датчиков: ${hardware.sensorCount} шт, шаг ${hardware.sensorSpacing} мм, вынос ${hardware.sensorDistance} мм
 * ============================================================
 */\n\n`;

    const fullContent = header + code;
    const blob = new Blob([fullContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = uploadedFileName || 'line_follower_robot.ino';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setExported(true);
    setTimeout(() => setExported(false), 2500);
  };

  const getDriverBadgeClass = (driver: string) => {
    switch (driver) {
      case 'TB6612': return 'bg-cyan-950/80 text-cyan-400 border-cyan-700/60';
      case 'L298N': return 'bg-amber-950/80 text-amber-400 border-amber-700/60';
      case 'DRV8833': return 'bg-purple-950/80 text-purple-400 border-purple-700/60';
      case 'PWM_DIR': return 'bg-emerald-950/80 text-emerald-400 border-emerald-700/60';
      case 'ESP32_LEDC': return 'bg-indigo-950/80 text-indigo-400 border-indigo-700/60';
      case 'HIGH_LEVEL': return 'bg-blue-950/80 text-blue-400 border-blue-700/60';
      default: return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div 
      className="flex-1 flex flex-col min-w-[350px] max-w-[580px] border-r border-slate-800 bg-slate-950 text-white select-none relative"
      onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
      onDragLeave={(e) => { e.preventDefault(); setIsDraggingFile(false); }}
      onDrop={handleDrop}
    >
      {/* Hidden File Input */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        accept=".ino,.cpp,.c,.h,.txt" 
        className="hidden" 
      />

      {/* Drag & Drop Visual Overlay */}
      {isDraggingFile && (
        <div className="absolute inset-0 z-50 bg-blue-950/85 backdrop-blur-sm border-2 border-dashed border-blue-400 flex flex-col items-center justify-center gap-3 text-white">
          <Upload className="w-12 h-12 text-blue-400 animate-bounce" />
          <div className="font-bold text-sm text-blue-200">Перетащите скетч сюда</div>
          <div className="text-xs text-blue-300">Поддерживаются файлы .ino, .cpp, .h</div>
        </div>
      )}

      {/* Header & Action Toolbar */}
      <div className="p-2.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/95 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-blue-600/20 text-blue-400 rounded border border-blue-500/30">
            <Code2 className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-xs text-slate-200 flex items-center gap-1.5">
              <span>Код Arduino (C++)</span>
              {uploadedFileName && (
                <span className="text-[10px] bg-blue-900/60 text-blue-300 border border-blue-700/40 px-1.5 py-0.2 rounded truncate max-w-[120px]" title={uploadedFileName}>
                  {uploadedFileName}
                </span>
              )}
            </div>
            <div className="text-[10px] text-slate-400 font-mono">Автоопределение распиновки и драйвера</div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Upload Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-[11px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition flex items-center gap-1 cursor-pointer font-medium border border-slate-700"
            title="Загрузить свой скетч .ino или .cpp с диска"
          >
            <Upload className="w-3.5 h-3.5 text-blue-400" />
            Загрузить
          </button>

          {/* Export Button */}
          <button
            onClick={handleExportIno}
            className={`text-[11px] px-2 py-1 rounded transition flex items-center gap-1 font-semibold cursor-pointer border ${
              exported 
                ? 'bg-emerald-600 text-white border-emerald-500' 
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
            title="Экспортировать скетч Arduino .ino с параметрами шасси"
          >
            {exported ? <Check className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5 text-emerald-400" />}
            {exported ? 'Готово!' : '.ino'}
          </button>

          {/* Docs Button */}
          <button
            onClick={() => setShowDocs(!showDocs)}
            className={`text-[11px] px-2 py-1 rounded transition flex items-center gap-1 cursor-pointer border ${
              showDocs ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
            title="Справочник функций Arduino"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Справка
          </button>
          
          {/* Engine toggle */}
          <button
            onClick={() => setUseMonaco(!useMonaco)}
            className="text-[11px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center gap-1 cursor-pointer border border-slate-700"
            title="Переключить движок редактора"
          >
            <Terminal className="w-3.5 h-3.5" />
            {useMonaco ? 'Monaco' : 'Text'}
          </button>
        </div>
      </div>

      {/* Smart Pinout & Driver Architecture HUD */}
      <div className="px-3 py-1.5 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between gap-2 text-xs flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Driver Badge */}
          <div 
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border flex items-center gap-1 ${getDriverBadgeClass(pinout?.driverType || 'UNKNOWN')}`}
            title={pinout?.diagnosticSummary}
          >
            <Cpu className="w-3 h-3" />
            <span>{pinout?.driverType !== 'UNKNOWN' ? pinout?.driverType : 'Direct API'}</span>
          </div>

          {/* Sensor Count Badge */}
          <div className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800/80 text-slate-300 border border-slate-700 flex items-center gap-1">
            <Radio className="w-3 h-3 text-cyan-400" />
            <span>{pinout?.sensorCount ?? hardware.sensorCount} датч.</span>
          </div>

          {/* Sync Sensor Count Button (if code sensors differ from simulator hardware) */}
          {pinout && pinout.sensorCount !== hardware.sensorCount && (
            <button
              onClick={() => {
                updateHardware({ sensorCount: pinout.sensorCount });
                sound.playButton();
              }}
              className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1 transition shadow cursor-pointer animate-pulse"
              title="Синхронизировать количество датчиков робота с загруженным кодом"
            >
              <Zap className="w-3 h-3" />
              <span>Синхронизировать ({pinout.sensorCount} шт)</span>
            </button>
          )}
        </div>

        {/* Pinout Details Toggle */}
        <button
          onClick={() => setShowPinoutDetails(!showPinoutDetails)}
          className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer transition"
          title="Показать подробную карту распиновки и обнаруженных пинов"
        >
          <span>Распиновка</span>
          {showPinoutDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Expandable Pinout Inspector Drawer */}
      {showPinoutDetails && (
        <div className="bg-slate-900 border-b border-slate-700 p-3 text-[11px] space-y-2.5 max-h-64 overflow-y-auto text-slate-300 shadow-inner">
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
            <div className="font-bold text-xs text-blue-400 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" />
              <span>Карта распиновки и привязки периферии</span>
            </div>
            <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-1.5 py-0.5 rounded">
              {pinout?.confidence === 'HIGH' ? 'Высокая точность' : 'Автоматический анализ'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
            {/* Left Motor Binding */}
            <div className="bg-slate-950 p-2 rounded border border-slate-800">
              <div className="text-cyan-400 font-bold mb-1">Левый мотор:</div>
              <div className="text-slate-400">PWM: <span className="text-slate-200">{pinout?.leftMotor.pwmPin ?? 'не задан (функция)'}</span></div>
              <div className="text-slate-400">DIR1: <span className="text-slate-200">{pinout?.leftMotor.dir1Pin ?? '—'}</span> | DIR2: <span className="text-slate-200">{pinout?.leftMotor.dir2Pin ?? '—'}</span></div>
            </div>

            {/* Right Motor Binding */}
            <div className="bg-slate-950 p-2 rounded border border-slate-800">
              <div className="text-cyan-400 font-bold mb-1">Правый мотор:</div>
              <div className="text-slate-400">PWM: <span className="text-slate-200">{pinout?.rightMotor.pwmPin ?? 'не задан (функция)'}</span></div>
              <div className="text-slate-400">DIR1: <span className="text-slate-200">{pinout?.rightMotor.dir1Pin ?? '—'}</span> | DIR2: <span className="text-slate-200">{pinout?.rightMotor.dir2Pin ?? '—'}</span></div>
            </div>

            {/* Sensors */}
            <div className="bg-slate-950 p-2 rounded border border-slate-800 col-span-2">
              <div className="text-amber-400 font-bold mb-1">Датчики линии ({pinout?.sensorCount ?? hardware.sensorCount} шт):</div>
              <div className="text-slate-300 truncate">
                {pinout?.sensorPins && pinout.sensorPins.length > 0 
                  ? pinout.sensorPins.map(p => p >= 14 && p <= 29 ? `A${p - 14}` : `D${p}`).join(', ')
                  : 'Стандартная линейка QTR (A0..A' + ((pinout?.sensorCount ?? hardware.sensorCount) - 1) + ')'}
              </div>
              <div className="text-[9px] text-slate-500 mt-0.5">
                Тип: {pinout?.sensorType === 'ANALOG' ? 'Аналоговые (АЦП 0..1023)' : pinout?.sensorType === 'QTR' ? 'Библиотека Pololu QTR' : 'Цифровые (0/1)'}
              </div>
            </div>

            {/* Button / Peripherals */}
            <div className="bg-slate-950 p-2 rounded border border-slate-800 col-span-2 flex items-center justify-between">
              <div>
                <span className="text-slate-400">Кнопка старта (BOOT): </span>
                <span className="text-emerald-400 font-bold">{pinout?.buttonPin !== undefined ? `Pin ${pinout.buttonPin}` : 'GPIO 0 / Пробел'}</span>
              </div>
              {pinout?.standbyPin !== undefined && (
                <div>
                  <span className="text-slate-400">STBY: </span>
                  <span className="text-cyan-300 font-bold">Pin {pinout.standbyPin}</span>
                </div>
              )}
            </div>
          </div>

          <div className="text-[10px] text-slate-400 bg-slate-950/60 p-1.5 rounded border border-slate-800/80">
            ℹ️ <span className="text-slate-300">{pinout?.diagnosticSummary}</span>
          </div>
        </div>
      )}

      {/* Template Selector Bar */}
      <div className="px-3 py-1.5 bg-slate-900 border-b border-slate-800 flex items-center gap-2 text-xs">
        <FileCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />
        <span className="text-slate-400 text-[11px] shrink-0">Шаблон:</span>
        <select
          onChange={handleTemplateChange}
          className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none cursor-pointer min-w-0 truncate"
          defaultValue=""
        >
          <option value="" disabled>Выберите готовый алгоритм...</option>
          {CODE_TEMPLATES.map((t, idx) => (
            <option key={idx} value={t.name}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* API Reference Dropdown Sheet */}
      {showDocs && (
        <div className="bg-slate-900 border-b border-slate-700 p-3 text-[11px] space-y-2 max-h-56 overflow-y-auto text-slate-300 shadow-inner">
          <div className="font-bold text-xs text-blue-400 mb-1">Доступные функции и константы Arduino:</div>
          <div className="space-y-1.5 font-mono text-[10px]">
            <div className="bg-slate-950 p-1.5 rounded border border-slate-800">
              <span className="text-amber-400">digitalWrite(pin, val)</span>, <span className="text-amber-400">analogWrite(pin, val)</span>: прямое управление моторами через L298N, TB6612, DRV8833.
            </div>
            <div className="bg-slate-950 p-1.5 rounded border border-slate-800">
              <span className="text-amber-400">analogRead(pin)</span>, <span className="text-amber-400">digitalRead(pin)</span>: чтение оптических сенсоров и кнопки старта.
            </div>
            <div className="bg-slate-950 p-1.5 rounded border border-slate-800">
              <span className="text-amber-400">readLineBlack(sensorValues)</span>: взвешенное положение линии от <span className="text-cyan-300">0</span> до <span className="text-cyan-300">{(hardware.sensorCount - 1) * 1000}</span> (центр = <span className="text-emerald-400">{(hardware.sensorCount - 1) * 500}</span>).
            </div>
            <div className="bg-slate-950 p-1.5 rounded border border-slate-800">
              <span className="text-amber-400">setMotors(left, right)</span>: скорость моторов от <span className="text-cyan-300">-255</span> до <span className="text-cyan-300">+255</span>.
            </div>
            <div className="bg-slate-950 p-1.5 rounded border border-slate-800">
              <span className="text-amber-400">QTRSensors</span>: полная поддержка библиотеки Pololu (<span className="text-cyan-300">readLineBlack</span>, <span className="text-cyan-300">calibrate</span>, <span className="text-cyan-300">setSensorPins</span>).
            </div>
          </div>
        </div>
      )}

      {/* Editor Main Canvas */}
      <div className="flex-1 relative overflow-hidden bg-[#1e1e1e]">
        {useMonaco ? (
          <Editor
            height="100%"
            defaultLanguage="cpp"
            theme="vs-dark"
            value={code}
            onChange={(value) => setCode(value || '')}
            loading={
              <div className="flex items-center justify-center h-full text-slate-400 text-xs">
                Загрузка редактора C++...
              </div>
            }
            options={{
              minimap: { enabled: false },
              fontSize: 12.5,
              wordWrap: 'on',
              lineNumbers: 'on',
              tabSize: 2,
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        ) : (
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            className="w-full h-full p-3 font-mono text-xs bg-slate-950 text-slate-200 resize-none outline-none leading-relaxed border-0"
          />
        )}
      </div>

      {/* Compiler / Runtime Status Footer */}
      <div className="p-2 border-t border-slate-800 bg-slate-950 shrink-0 text-xs flex flex-col gap-1 font-mono">
        {compileError ? (
          <div className="flex items-start gap-1.5 text-rose-400 bg-rose-950/40 p-1.5 rounded border border-rose-800/40">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span className="text-[11px] leading-tight line-clamp-2">Ошибка компиляции: {compileError}</span>
          </div>
        ) : runtimeError ? (
          <div className="flex items-start gap-1.5 text-amber-400 bg-amber-950/40 p-1.5 rounded border border-amber-800/40">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span className="text-[11px] leading-tight line-clamp-2">Ошибка loop(): {runtimeError}</span>
          </div>
        ) : (
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>C++ код готов • {pinout?.driverType !== 'UNKNOWN' ? pinout?.driverType : 'Direct Motor Control'}</span>
            </div>
            <div className="text-slate-500">
              Сенсоров: {hardware.sensorCount}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
