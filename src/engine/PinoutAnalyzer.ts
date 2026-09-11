/**
 * Smart Pinout & Driver Architecture Analyzer
 * Automatically detects motor driver topology, sensor array pins, button inputs,
 * and high-level control functions from arbitrary Arduino / C++ code.
 */

export interface MotorPinBinding {
  pwmPin?: number;
  dir1Pin?: number;
  dir2Pin?: number;
  dirPin?: number;
  channel?: number;
}

export type DriverType = 
  | 'TB6612' 
  | 'L298N' 
  | 'DRV8833' 
  | 'PWM_DIR' 
  | 'ESP32_LEDC' 
  | 'HIGH_LEVEL' 
  | 'UNKNOWN';

export interface PinoutConfig {
  driverType: DriverType;
  leftMotor: MotorPinBinding;
  rightMotor: MotorPinBinding;
  standbyPin?: number;
  sensorPins: number[];
  sensorType: 'ANALOG' | 'DIGITAL' | 'QTR' | 'UNKNOWN';
  sensorCount: number;
  buttonPin?: number;
  buttonActiveLow: boolean;
  hookFunctions: string[];
  diagnosticSummary: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  detectedVariables: Record<string, number | string>;
}

// Map Arduino pin names (A0-A15, D0-D13, GPIO_NUM_X) to standard numeric IDs
export function normalizeArduinoPin(pinStr: string | number): number {
  if (typeof pinStr === 'number') return pinStr;
  const s = String(pinStr).trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10);

  const analogMatch = s.match(/^A(\d+)$/i);
  if (analogMatch) {
    return 14 + parseInt(analogMatch[1], 10); // Standard Uno/Nano A0=14..A5=19
  }

  const digitalMatch = s.match(/^D(\d+)$/i);
  if (digitalMatch) {
    return parseInt(digitalMatch[1], 10);
  }

  const gpioMatch = s.match(/^GPIO(?:_NUM_)?(\d+)$/i);
  if (gpioMatch) {
    return parseInt(gpioMatch[1], 10);
  }

  return 0;
}

export function analyzePinout(sourceCode: string, currentSensorCount: number = 8): PinoutConfig {
  const vars: Record<string, number | string> = {};
  const hookFunctions: string[] = [];

  // 1. Extract #define NAME VALUE
  const defineRegex = /#define\s+([A-Za-z0-9_]+)\s+([A-Za-z0-9_]+)/g;
  let match: RegExpExecArray | null;
  while ((match = defineRegex.exec(sourceCode)) !== null) {
    const name = match[1];
    const val = match[2];
    vars[name] = val;
  }

  // 2. Extract const int / int / byte declarations: const int NAME = VALUE;
  const declRegex = /(?:const\s+)?(?:unsigned\s+)?(?:int|uint8_t|byte|char|short|long)\s+([A-Za-z0-9_]+)\s*=\s*([A-Za-z0-9_]+)\s*;/g;
  while ((match = declRegex.exec(sourceCode)) !== null) {
    const name = match[1];
    const val = match[2];
    vars[name] = val;
  }

  // Helper to resolve pin value from name or raw number
  const resolvePin = (val: string | number | undefined): number | undefined => {
    if (val === undefined) return undefined;
    if (typeof val === 'number') return val;
    const str = String(val).trim();
    if (vars[str] !== undefined) {
      return resolvePin(vars[str]);
    }
    const norm = normalizeArduinoPin(str);
    if (!isNaN(norm) && norm > 0) return norm;
    if (str === '0') return 0;
    return undefined;
  };

  // Find pin by matching regex against variable names
  const findPinByRegex = (...regexes: RegExp[]): { name: string; pin: number } | undefined => {
    for (const [vName, vVal] of Object.entries(vars)) {
      for (const rx of regexes) {
        if (rx.test(vName)) {
          const pin = resolvePin(vVal);
          if (pin !== undefined) return { name: vName, pin };
        }
      }
    }
    return undefined;
  };

  // 3. Search for Sensor Pins
  let sensorPins: number[] = [];
  let sensorType: 'ANALOG' | 'DIGITAL' | 'QTR' | 'UNKNOWN' = 'UNKNOWN';

  // Check array definitions: int sensorPins[] = { A0, A1, A2, A3, A4 };
  const sensorArrayRegex = /(?:sensor|sens|qtr|line|ir)[A-Za-z0-9_]*\s*(?:\[\s*\d*\s*\])?\s*=\s*\{([^\}]+)\}/i;
  const arrayMatch = sourceCode.match(sensorArrayRegex);
  if (arrayMatch) {
    const rawList = arrayMatch[1].split(',').map(s => s.trim());
    for (const item of rawList) {
      const p = resolvePin(item);
      if (p !== undefined) sensorPins.push(p);
    }
  }

  // Check QTRSensors setSensorPins((const uint8_t[]){2, 3, 4, 5, 6, 7, 8, 9}, 8)
  const qtrSetPins = sourceCode.match(/setSensorPins\s*\(\s*(?:\([^)]*\)\s*)?\{([^\}]+)\}/i);
  if (qtrSetPins) {
    sensorPins = [];
    const rawList = qtrSetPins[1].split(',').map(s => s.trim());
    for (const item of rawList) {
      const p = resolvePin(item);
      if (p !== undefined) sensorPins.push(p);
    }
    sensorType = 'QTR';
  }

  // If no array found, check individual sensor defines: S1, S2, S3... or SENSOR_0, SENSOR_1...
  if (sensorPins.length === 0) {
    const sensorEntries: Array<{ index: number; pin: number }> = [];
    for (const [vName, vVal] of Object.entries(vars)) {
      const sMatch = vName.match(/^(?:S|SENSOR|SENS|IR|LINE)[_]?(\d+)$/i);
      if (sMatch) {
        const idx = parseInt(sMatch[1], 10);
        const pin = resolvePin(vVal);
        if (pin !== undefined) {
          sensorEntries.push({ index: idx, pin });
        }
      }
    }
    if (sensorEntries.length > 0) {
      sensorEntries.sort((a, b) => a.index - b.index);
      sensorPins = sensorEntries.map(e => e.pin);
    }
  }

  // Check calls to analogRead() or digitalRead() in code
  const analogReadCalls = [...sourceCode.matchAll(/analogRead\s*\(\s*([A-Za-z0-9_]+)\s*\)/g)].map(m => m[1]);
  const digitalReadCalls = [...sourceCode.matchAll(/digitalRead\s*\(\s*([A-Za-z0-9_]+)\s*\)/g)].map(m => m[1]);

  if (sensorPins.length === 0 && analogReadCalls.length > 0) {
    const uniquePins = Array.from(new Set(analogReadCalls));
    for (const pName of uniquePins) {
      const p = resolvePin(pName);
      if (p !== undefined && p !== 0) sensorPins.push(p);
    }
    sensorType = 'ANALOG';
  }

  if (sourceCode.includes('QTRSensors') || sourceCode.includes('readLineBlack')) {
    sensorType = 'QTR';
  } else if (analogReadCalls.length > 0 && sensorType === 'UNKNOWN') {
    sensorType = 'ANALOG';
  } else if (digitalReadCalls.length > 0 && sensorType === 'UNKNOWN') {
    sensorType = 'DIGITAL';
  }

  // Default sensor count
  let detectedSensorCount = sensorPins.length > 0 ? sensorPins.length : currentSensorCount;
  const sensorCountDef = findPinByRegex(/^SENSOR_COUNT$/i, /^NUM_SENSORS$/i, /^NUM_SENS$/i, /^SENSOR_NUM$/i);
  if (sensorCountDef) {
    detectedSensorCount = sensorCountDef.pin;
  }

  // 4. Detect Motor Pins & Driver Type
  // Left Motor pins
  const leftPWM = findPinByRegex(/^PWMA$/i, /^ENA$/i, /^(?:LEFT|L|M1|MOT_L)[_]?(?:PWM|SPEED|EN|ENABLE)$/i, /^PWM1$/i);
  const leftDir1 = findPinByRegex(/^AIN1$/i, /^IN1$/i, /^(?:LEFT|L|M1|MOT_L)[_]?(?:IN1|DIR1|FORWARD|FWD)$/i, /^(?:LEFT|L|M1)[_]?DIR$/i);
  const leftDir2 = findPinByRegex(/^AIN2$/i, /^IN2$/i, /^(?:LEFT|L|M1|MOT_L)[_]?(?:IN2|DIR2|REVERSE|BACK|REV)$/i);

  // Right Motor pins
  const rightPWM = findPinByRegex(/^PWMB$/i, /^ENB$/i, /^(?:RIGHT|R|M2|MOT_R)[_]?(?:PWM|SPEED|EN|ENABLE)$/i, /^PWM2$/i);
  const rightDir1 = findPinByRegex(/^BIN1$/i, /^IN3$/i, /^(?:RIGHT|R|M2|MOT_R)[_]?(?:IN1|IN3|DIR1|DIR|FORWARD|FWD)$/i, /^(?:RIGHT|R|M2)[_]?DIR$/i);
  const rightDir2 = findPinByRegex(/^BIN2$/i, /^IN4$/i, /^(?:RIGHT|R|M2|MOT_R)[_]?(?:IN2|IN4|DIR2|REVERSE|BACK|REV)$/i);

  // Standby pin
  const stby = findPinByRegex(/^STBY$/i, /^STANDBY$/i, /^NSLEEP$/i, /^SLP$/i);

  // Check for high-level motor functions
  const highLevelFns = [
    'setMotors', 'motors', 'drive', 'motorLeft', 'motorRight', 
    'set_motors', 'motor_speed', 'setSpeed', 'forward', 'runMotor',
    'Motor', 'driveMotors', 'move'
  ];
  for (const fn of highLevelFns) {
    const rx = new RegExp(`\\b${fn}\\s*\\(`, 'i');
    if (rx.test(sourceCode)) {
      hookFunctions.push(fn);
    }
  }

  // Determine Driver Architecture
  let driverType: DriverType = 'UNKNOWN';
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';

  if (sourceCode.includes('PWMA') && sourceCode.includes('AIN1')) {
    driverType = 'TB6612';
    confidence = 'HIGH';
  } else if (sourceCode.includes('ENA') && sourceCode.includes('IN1') && sourceCode.includes('IN3')) {
    driverType = 'L298N';
    confidence = 'HIGH';
  } else if (leftDir1 && leftDir2 && !leftPWM && rightDir1 && rightDir2 && !rightPWM) {
    driverType = 'DRV8833';
    confidence = 'HIGH';
  } else if (leftPWM && leftDir1 && !leftDir2) {
    driverType = 'PWM_DIR';
    confidence = 'HIGH';
  } else if (leftPWM && leftDir1 && leftDir2) {
    driverType = 'TB6612';
    confidence = 'HIGH';
  } else if (sourceCode.includes('ledcWrite')) {
    driverType = 'ESP32_LEDC';
    confidence = 'HIGH';
  } else if (hookFunctions.length > 0) {
    driverType = 'HIGH_LEVEL';
    confidence = 'HIGH';
  } else if (leftPWM || rightPWM) {
    driverType = 'TB6612';
    confidence = 'MEDIUM';
  }

  // 5. Detect Start Button
  const btn = findPinByRegex(/^BUTTON$/i, /^BTN$/i, /^START$/i, /^KEY$/i, /^BOOT$/i, /^SW1?$/i, /^START_BUTTON$/i);
  let buttonPin = btn ? btn.pin : undefined;
  let buttonActiveLow = true;

  if (sourceCode.includes('INPUT_PULLUP')) {
    buttonActiveLow = true;
  }

  // Build human-readable diagnostic summary
  const summaryParts: string[] = [];
  if (driverType !== 'UNKNOWN') {
    summaryParts.push(`Драйвер моторов: ${driverType}`);
    if (leftPWM || leftDir1) {
      summaryParts.push(`Лев. мотор: PWM=${leftPWM?.pin ?? 'нет'}, DIR=${leftDir1?.pin ?? 'нет'}/${leftDir2?.pin ?? 'нет'}`);
    }
    if (rightPWM || rightDir1) {
      summaryParts.push(`Прав. мотор: PWM=${rightPWM?.pin ?? 'нет'}, DIR=${rightDir1?.pin ?? 'нет'}/${rightDir2?.pin ?? 'нет'}`);
    }
  } else if (hookFunctions.length > 0) {
    summaryParts.push(`Управление: вызовы функций ${hookFunctions.join(', ')}()`);
  }

  if (sensorPins.length > 0) {
    summaryParts.push(`Датчики (${sensorPins.length} шт): [${sensorPins.map(p => p >= 14 && p <= 21 ? 'A' + (p - 14) : p).join(', ')}]`);
  } else {
    summaryParts.push(`Датчики: стандартная линейка QTR (${detectedSensorCount} шт)`);
  }

  if (buttonPin !== undefined) {
    summaryParts.push(`Кнопка старта: Pin ${buttonPin}`);
  }

  return {
    driverType,
    leftMotor: {
      pwmPin: leftPWM?.pin,
      dir1Pin: leftDir1?.pin,
      dir2Pin: leftDir2?.pin,
      dirPin: leftDir1?.pin,
    },
    rightMotor: {
      pwmPin: rightPWM?.pin,
      dir1Pin: rightDir1?.pin,
      dir2Pin: rightDir2?.pin,
      dirPin: rightDir1?.pin,
    },
    standbyPin: stby?.pin,
    sensorPins,
    sensorType,
    sensorCount: detectedSensorCount,
    buttonPin,
    buttonActiveLow,
    hookFunctions,
    diagnosticSummary: summaryParts.join(' | ') || 'Стандартная конфигурация Arduino',
    confidence,
    detectedVariables: vars
  };
}

/**
 * Calculates effective motor speeds (-1.0 to 1.0) from virtual GPIO pin state
 */
export function calculateMotorSpeedsFromGPIO(
  digitalPins: Record<number, number>,
  pwmPins: Record<number, number>,
  config: PinoutConfig
): { left: number; right: number } {
  // Check standby pin
  if (config.standbyPin !== undefined && digitalPins[config.standbyPin] === 0) {
    return { left: 0, right: 0 };
  }

  let left = 0;
  let right = 0;

  if (config.driverType === 'TB6612' || config.driverType === 'L298N') {
    // Left
    const pwmValL = (config.leftMotor.pwmPin !== undefined ? (pwmPins[config.leftMotor.pwmPin] ?? (digitalPins[config.leftMotor.pwmPin] ? 255 : 0)) : 0);
    const in1L = config.leftMotor.dir1Pin !== undefined ? (digitalPins[config.leftMotor.dir1Pin] ?? 0) : 0;
    const in2L = config.leftMotor.dir2Pin !== undefined ? (digitalPins[config.leftMotor.dir2Pin] ?? 0) : 0;

    if (in1L === 1 && in2L === 0) left = pwmValL / 255;
    else if (in1L === 0 && in2L === 1) left = -pwmValL / 255;
    else if (in1L === in2L && in1L === 0) left = 0;
    else left = 0;

    // Right
    const pwmValR = (config.rightMotor.pwmPin !== undefined ? (pwmPins[config.rightMotor.pwmPin] ?? (digitalPins[config.rightMotor.pwmPin] ? 255 : 0)) : 0);
    const in1R = config.rightMotor.dir1Pin !== undefined ? (digitalPins[config.rightMotor.dir1Pin] ?? 0) : 0;
    const in2R = config.rightMotor.dir2Pin !== undefined ? (digitalPins[config.rightMotor.dir2Pin] ?? 0) : 0;

    if (in1R === 1 && in2R === 0) right = pwmValR / 255;
    else if (in1R === 0 && in2R === 1) right = -pwmValR / 255;
    else if (in1R === in2R && in1R === 0) right = 0;
    else right = 0;
  } else if (config.driverType === 'DRV8833') {
    const in1L = config.leftMotor.dir1Pin !== undefined ? (pwmPins[config.leftMotor.dir1Pin] ?? (digitalPins[config.leftMotor.dir1Pin] ? 255 : 0)) : 0;
    const in2L = config.leftMotor.dir2Pin !== undefined ? (pwmPins[config.leftMotor.dir2Pin] ?? (digitalPins[config.leftMotor.dir2Pin] ? 255 : 0)) : 0;
    left = (in1L - in2L) / 255;

    const in1R = config.rightMotor.dir1Pin !== undefined ? (pwmPins[config.rightMotor.dir1Pin] ?? (digitalPins[config.rightMotor.dir1Pin] ? 255 : 0)) : 0;
    const in2R = config.rightMotor.dir2Pin !== undefined ? (pwmPins[config.rightMotor.dir2Pin] ?? (digitalPins[config.rightMotor.dir2Pin] ? 255 : 0)) : 0;
    right = (in1R - in2R) / 255;
  } else if (config.driverType === 'PWM_DIR') {
    const pwmL = config.leftMotor.pwmPin !== undefined ? (pwmPins[config.leftMotor.pwmPin] ?? 0) : 0;
    const dirL = config.leftMotor.dirPin !== undefined ? (digitalPins[config.leftMotor.dirPin] ?? 1) : 1;
    left = (dirL ? 1 : -1) * (pwmL / 255);

    const pwmR = config.rightMotor.pwmPin !== undefined ? (pwmPins[config.rightMotor.pwmPin] ?? 0) : 0;
    const dirR = config.rightMotor.dirPin !== undefined ? (digitalPins[config.rightMotor.dirPin] ?? 1) : 1;
    right = (dirR ? 1 : -1) * (pwmR / 255);
  }

  return {
    left: Math.max(-1, Math.min(1, left)),
    right: Math.max(-1, Math.min(1, right))
  };
}
