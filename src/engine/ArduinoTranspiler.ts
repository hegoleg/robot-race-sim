/**
 * Arduino C++ Simulator & Intelligent Transpiler
 * Transpiles arbitrary Arduino/C++ code into executable JavaScript running in a persistent sandbox.
 * Features automated pinout detection, virtual GPIO/PWM peripheral simulation,
 * QTRSensors emulation, motor driver topology calculation, and resilience to arbitrary user code.
 */

import { 
  analyzePinout, 
  calculateMotorSpeedsFromGPIO, 
  type PinoutConfig, 
  type DriverType 
} from './PinoutAnalyzer';

export interface ArduinoExecutionResult {
  leftSpeed: number;  // -1 to 1
  rightSpeed: number; // -1 to 1
  logs: string[];
  pinout: PinoutConfig | null;
}

export class ArduinoEnvironment {
  private instance: any = null;
  private currentCode: string = '';
  private compileError: string | null = null;
  private runtimeError: string | null = null;
  private logs: string[] = [];
  private pinoutConfig: PinoutConfig | null = null;

  // Virtual GPIO & PWM state table
  private digitalPins: Record<number, number> = {};
  private pwmPins: Record<number, number> = {};
  private pinModes: Record<number, number> = {};

  private envContext: any = null;
  private simTime: number = 0;
  private isBootPressed: boolean = false;
  private currentSensors0to1: number[] = [];

  constructor() {}

  public getCompileError(): string | null {
    return this.compileError;
  }

  public getRuntimeError(): string | null {
    return this.runtimeError;
  }

  public getLogs(): string[] {
    return this.logs;
  }

  public getPinoutConfig(): PinoutConfig | null {
    return this.pinoutConfig;
  }

  public getDetectedSensorCount(): number {
    return this.pinoutConfig?.sensorCount ?? 8;
  }

  public getDetectedDriverType(): DriverType {
    return this.pinoutConfig?.driverType ?? 'UNKNOWN';
  }

  public getDiagnosticSummary(): string {
    return this.pinoutConfig?.diagnosticSummary ?? 'Стандартная конфигурация Arduino';
  }

  /**
   * Cleans function parameter lists in C++:
   * e.g. "int left, float right, uint16_t *sensors" -> "left, right, sensors"
   */
  private cleanParameters(paramsStr: string): string {
    return paramsStr
      .split(',')
      .map(p => {
        let clean = p.trim();
        // Remove const, unsigned, qualifiers, types, references, pointers
        clean = clean.replace(/\b(?:const\s+)?(?:unsigned\s+)?(?:int|long|short|char|float|double|uint8_t|uint16_t|uint32_t|int8_t|int16_t|int32_t|size_t|bool|boolean|byte|word|String)\b/g, '');
        clean = clean.replace(/[*&]/g, '');
        // Remove array brackets in param like sensorValues[]
        clean = clean.replace(/\[\s*\]/g, '');
        return clean.trim();
      })
      .filter(p => p.length > 0)
      .join(', ');
  }

  /**
   * Robust C++ to JavaScript Transpiler for arbitrary Arduino robot code
   */
  private transpile(cppCode: string): string {
    let js = cppCode;

    // 1. Strip include headers, pragma, and standard C++ directives
    js = js.replace(/#include\s+<[^>]+>/g, '// [included header]');
    js = js.replace(/#include\s+"[^"]+"/g, '// [included header]');
    js = js.replace(/#pragma\s+.*/g, '');

    // 2. Transpile #define
    // Function-style macro: #define SGN(x) ((x) < 0 ? -1 : 1) -> function SGN(x) { return ((x) < 0 ? -1 : 1); }
    js = js.replace(/#define\s+([A-Za-z0-9_]+)\(([^)]*)\)\s+([^\r\n]+)/g, (_match, name, params, body) => {
      return `function ${name}(${params}) { return (${body}); };`;
    });
    // Value macro: #define NAME VALUE
    js = js.replace(/#define\s+([A-Za-z0-9_]+)\s+([^\r\n]+)/g, 'const $1 = $2;');

    // 3. Remove C++ visibility and qualifiers
    js = js.replace(/\b(public|private|protected)\s*:/g, '');
    js = js.replace(/\b(static|volatile|inline|constexpr)\b\s+/g, '');

    // 4. Transpile Enums: enum Name { A, B, C }; -> const A = 0, B = 1, C = 2;
    js = js.replace(/enum(?:\s+[A-Za-z0-9_]+)?\s*\{([^}]+)\}\s*;/g, (_m, items) => {
      const parts = items.split(',').map((it: string, idx: number) => {
        const trimmed = it.trim();
        if (trimmed.includes('=')) return trimmed;
        return `${trimmed} = ${idx}`;
      });
      return `const ${parts.join(', ')};`;
    });

    // 5. Transpile Structs into classes: struct Name { int a; float b; };
    js = js.replace(/struct\s+([A-Za-z0-9_]+)\s*\{([^}]+)\}\s*;/g, (_m, name, body) => {
      const fieldNames = (body.match(/\b([A-Za-z0-9_]+)\s*;/g) || [])
        .map((f: string) => f.replace(';', '').trim());
      const inits = fieldNames.map((fn: string) => `this.${fn} = 0;`).join(' ');
      return `class ${name} { constructor() { ${inits} } };`;
    });

    // 6. Array Initializations:
    // int pins[] = {A0, A1, A2}; -> let pins = [A0, A1, A2];
    // const uint8_t arr[8] = {2, 3, 4, 5, 6, 7, 8, 9}; -> let arr = [2, 3, 4, 5, 6, 7, 8, 9];
    js = js.replace(/\b(?:const\s+)?(?:unsigned\s+)?(?:int|uint8_t|byte|char|short|long|float|double|bool|boolean)\s+([A-Za-z0-9_]+)\s*(?:\[\s*\d*\s*\])?\s*=\s*\{([^}]+)\}\s*;/g, 'let $1 = [$2];');

    // Array Declarations without init:
    // int sensorValues[8]; -> let sensorValues = new Array(8).fill(0);
    js = js.replace(/\b(?:unsigned\s+)?(?:int|long|short|char|float|double|uint8_t|uint16_t|uint32_t|int8_t|int16_t|int32_t|size_t|bool|boolean|byte|word)\s+([A-Za-z0-9_]+)\s*\[\s*([0-9A-Za-z_]+)\s*\]\s*;/g, 'let $1 = new Array($2).fill(0);');

    // 7. Normal Variable Declarations:
    // float Kp = 0.07; -> let Kp = 0.07;
    // int a, b, c; -> let a, b, c;
    js = js.replace(/\b(?:const\s+)?(?:unsigned\s+)?(?:int|long|short|char|float|double|uint8_t|uint16_t|uint32_t|int8_t|int16_t|int32_t|size_t|bool|boolean|byte|word|String)\s+([A-Za-z0-9_]+)\s*([=,;])/g, 'let $1 $2');

    // 8. Function Declarations with parameter cleaning:
    // void loop() -> function loop()
    // int getPos(int a, float b) -> function getPos(a, b)
    js = js.replace(/\b(?:void|int|float|double|bool|boolean|uint16_t|uint8_t|uint32_t|int16_t|int32_t|long|short|char|byte|word)\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*\{/g, (_m, fnName, params) => {
      const cleanParams = this.cleanParameters(params);
      return `function ${fnName}(${cleanParams}) {`;
    });

    // 9. C++ Casts:
    // (float)x -> x, (int)x -> Math.floor(x)
    js = js.replace(/\(\s*(?:float|double)\s*\)/g, '');
    js = js.replace(/\(\s*(?:int|uint16_t|uint8_t|int8_t|int16_t|int32_t|uint32_t|long|short|byte)\s*\)\s*\(/g, 'Math.floor(');
    js = js.replace(/\(\s*(?:int|uint16_t|uint8_t|int8_t|int16_t|int32_t|uint32_t|long|short|byte)\s*\)\s*([A-Za-z0-9_]+)/g, 'Math.floor($1)');
    js = js.replace(/\(\s*(?:int|uint16_t|uint8_t|int8_t|int16_t|int32_t|uint32_t|long|short|byte)\s*\)/g, '');

    // 10. Numeric suffixes (3500.0f, 100UL)
    js = js.replace(/([0-9]+\.?[0-9]*)[fF]\b/g, '$1');
    js = js.replace(/([0-9]+)[uU][lL]?\b/g, '$1');

    // 11. C++ Pointers and Member Access
    js = js.replace(/->/g, '.');
    js = js.replace(/\bdelete\s+[A-Za-z0-9_]+;/g, '');

    // 12. Safeguard against blocking loops that would freeze JS single-thread execution:
    // while (digitalRead(...) == HIGH);
    // while (!digitalRead(...));
    // while (digitalRead(...) != 0);
    js = js.replace(/while\s*\(\s*!*digitalRead\s*\([^)]*\)\s*(?:==|!=)?\s*(?:HIGH|LOW|1|0)?\s*\)\s*(?:\{[^}]*\}|[^;]+;)/g, '/* [sim: bypassed button wait loop] */');
    // while (!calibrated); or while(waiting);
    js = js.replace(/while\s*\(\s*!*(?:calibrated|isCalibrated|waiting|wait|buttonPressed)\s*\)\s*(?:\{[^}]*\}|[^;]+;)/g, '/* [sim: bypassed state wait loop] */');

    return js;
  }

  /**
   * Recompiles and initializes the persistent Arduino sandbox environment.
   */
  public compile(cppCode: string, sensorCount: number): boolean {
    if (this.currentCode === cppCode && this.instance) {
      return this.compileError === null;
    }

    this.currentCode = cppCode;
    this.compileError = null;
    this.runtimeError = null;
    this.logs = [];

    // Analyze pinout, motor driver, and sensor arrangement
    this.pinoutConfig = analyzePinout(cppCode, sensorCount);

    // Reset virtual GPIO and PWM tables
    this.digitalPins = {};
    this.pwmPins = {};
    this.pinModes = {};

    try {
      const transpiledJs = this.transpile(cppCode);

      // Environment helpers provided to the user code
      const envContext: any = {
        // Standard Arduino constants
        HIGH: 1,
        LOW: 0,
        INPUT: 0,
        OUTPUT: 1,
        INPUT_PULLUP: 2,
        LED_BUILTIN: 13,
        true: true,
        false: false,
        PI: Math.PI,
        HALF_PI: Math.PI / 2,
        TWO_PI: Math.PI * 2,
        DEG_TO_RAD: Math.PI / 180,
        RAD_TO_DEG: 180 / Math.PI,

        // Standard Arduino Analog Pins (A0 - A15)
        A0: 14, A1: 15, A2: 16, A3: 17, A4: 18, A5: 19,
        A6: 20, A7: 21, A8: 22, A9: 23, A10: 24, A11: 25,
        A12: 26, A13: 27, A14: 28, A15: 29,

        // Math & Arduino helpers
        constrain: (amt: number, low: number, high: number) => Math.max(low, Math.min(high, amt)),
        map: (x: number, in_min: number, in_max: number, out_min: number, out_max: number) => 
          (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min,
        abs: Math.abs,
        min: Math.min,
        max: Math.max,
        sq: (x: number) => x * x,
        sqrt: Math.sqrt,
        pow: Math.pow,
        round: Math.round,
        floor: Math.floor,
        ceil: Math.ceil,
        random: (min: number, max?: number) => {
          if (max === undefined) return Math.floor(Math.random() * min);
          return Math.floor(Math.random() * (max - min) + min);
        },
        randomSeed: () => {},
        bitRead: (value: number, bit: number) => (value >> bit) & 1,
        bitSet: (value: number, bit: number) => value | (1 << bit),
        bitClear: (value: number, bit: number) => value & ~(1 << bit),
        bitWrite: (value: number, bit: number, bitvalue: number) => 
          bitvalue ? (value | (1 << bit)) : (value & ~(1 << bit)),
        bit: (b: number) => 1 << b,
        lowByte: (w: number) => w & 0xff,
        highByte: (w: number) => (w >> 8) & 0xff,

        // System / Time
        millis: () => Math.floor(this.simTime * 1000),
        micros: () => Math.floor(this.simTime * 1000000),
        delay: () => {},
        delayMicroseconds: () => {},

        // Virtual GPIO & PWM hooks
        pinMode: (pin: number, mode: number) => {
          this.pinModes[pin] = mode;
        },

        digitalWrite: (pin: number, val: number) => {
          const v = val ? 1 : 0;
          this.digitalPins[pin] = v;
          if (v === 0 && this.pwmPins[pin] !== undefined) {
            this.pwmPins[pin] = 0;
          }
        },

        analogWrite: (pin: number, val: number) => {
          const clamped = Math.max(0, Math.min(255, Math.round(val)));
          this.pwmPins[pin] = clamped;
          this.digitalPins[pin] = clamped > 0 ? 1 : 0;
        },

        digitalRead: (pin: number): number => {
          const cfg = this.pinoutConfig;
          // 1. Check if button pin
          if (cfg && cfg.buttonPin !== undefined && pin === cfg.buttonPin) {
            if (this.isBootPressed) {
              return cfg.buttonActiveLow ? 0 : 1;
            }
            return cfg.buttonActiveLow ? 1 : 0;
          }

          // Pin 0 or 2 or 34 or 35 default BOOT / SW button on ESP32/AVR
          if (pin === 0 || pin === 2 || pin === 34 || pin === 35) {
            if (this.isBootPressed) return 0;
          }

          // 2. Check if sensor pin
          if (cfg && cfg.sensorPins.length > 0) {
            const idx = cfg.sensorPins.indexOf(pin);
            if (idx !== -1 && idx < this.currentSensors0to1.length) {
              const reading = this.currentSensors0to1[idx] || 0;
              // 1 if line detected (black line reflectance > 0.35)
              return reading > 0.35 ? 1 : 0;
            }
          }

          return this.digitalPins[pin] ?? 1;
        },

        analogRead: (pin: number): number => {
          const cfg = this.pinoutConfig;
          let sensorIdx = -1;

          // Check if pin is A0..A15
          if (pin >= 14 && pin <= 29) {
            sensorIdx = pin - 14;
          } else if (cfg && cfg.sensorPins.length > 0) {
            sensorIdx = cfg.sensorPins.indexOf(pin);
          } else if (pin >= 0 && pin < (cfg?.sensorCount ?? 8)) {
            sensorIdx = pin;
          }

          if (sensorIdx >= 0 && sensorIdx < this.currentSensors0to1.length) {
            const val = this.currentSensors0to1[sensorIdx] || 0;
            return Math.round(val * 1023); // Standard 10-bit Arduino ADC (0..1023)
          }

          return 0;
        },

        // ESP32 LEDC PWM emulation
        ledcSetup: () => {},
        ledcAttachPin: (pin: number, _channel: number) => {
          this.digitalPins[pin] = 0;
        },
        ledcWrite: (channelOrPin: number, val: number) => {
          const clamped = Math.max(0, Math.min(255, Math.round(val)));
          this.pwmPins[channelOrPin] = clamped;
        },

        // High-level motor actuation helpers
        _motorLeft: 0,
        _motorRight: 0,
        setMotors: (left: number, right: number) => {
          envContext._motorLeft = left;
          envContext._motorRight = right;
        },
        motors: (left: number, right: number) => {
          envContext._motorLeft = left;
          envContext._motorRight = right;
        },
        drive: (left: number, right: number) => {
          envContext._motorLeft = left;
          envContext._motorRight = right;
        },
        motor: (left: number, right: number) => {
          envContext._motorLeft = left;
          envContext._motorRight = right;
        },
        setMotorA: (speed: number) => { envContext._motorLeft = speed; },
        setMotorB: (speed: number) => { envContext._motorRight = speed; },
        motorLeft: (speed: number) => { envContext._motorLeft = speed; },
        motorRight: (speed: number) => { envContext._motorRight = speed; },
        leftMotor: (speed: number) => { envContext._motorLeft = speed; },
        rightMotor: (speed: number) => { envContext._motorRight = speed; },

        // Sensors
        SENSOR_COUNT: this.pinoutConfig?.sensorCount ?? sensorCount,
        sensorValues: new Array(this.pinoutConfig?.sensorCount ?? sensorCount).fill(0),
        readLineBlack: (values?: number[]) => {
          const arr = values || envContext.sensorValues;
          let weightedSum = 0;
          let sum = 0;
          for (let i = 0; i < arr.length; i++) {
            const v = arr[i];
            weightedSum += v * (i * 1000);
            sum += v;
          }
          if (sum === 0) {
            return (arr.length - 1) * 500;
          }
          return Math.round(weightedSum / sum);
        },
        readLineWhite: (values?: number[]) => {
          const arr = values || envContext.sensorValues;
          let weightedSum = 0;
          let sum = 0;
          for (let i = 0; i < arr.length; i++) {
            const v = 1000 - arr[i];
            weightedSum += v * (i * 1000);
            sum += v;
          }
          if (sum === 0) return (arr.length - 1) * 500;
          return Math.round(weightedSum / sum);
        },

        // Mock QTRSensors Library (Pololu)
        QTRSensors: class QTRSensorsMock {
          private count: number = 8;
          setTypeRC() {}
          setTypeAnalog() {}
          setSensorPins(_pins: any, count?: number) {
            if (count) this.count = count;
          }
          setEmitterPin() {}
          calibrate() {}
          resetCalibration() {}
          read(values: number[]) {
            for (let i = 0; i < values.length && i < envContext.sensorValues.length; i++) {
              values[i] = envContext.sensorValues[i];
            }
          }
          readCalibrated(values: number[]) {
            this.read(values);
          }
          readLineBlack(values: number[]) {
            this.read(values);
            return envContext.readLineBlack(values);
          }
          readLineWhite(values: number[]) {
            this.read(values);
            return envContext.readLineWhite(values);
          }
        },

        // Mock Adafruit Motor Shield
        AF_DCMotor: class AF_DCMotorMock {
          private num: number;
          private speed: number = 0;
          constructor(num: number) { this.num = num; }
          setSpeed(speed: number) { this.speed = speed; }
          run(cmd: number | string) {
            const mult = (cmd === 1 || cmd === 'FORWARD') ? 1 : (cmd === 2 || cmd === 'BACKWARD') ? -1 : 0;
            if (this.num === 1) envContext._motorLeft = this.speed * mult;
            if (this.num === 2) envContext._motorRight = this.speed * mult;
          }
        },
        FORWARD: 1,
        BACKWARD: 2,
        RELEASE: 3,

        // Serial logging
        Serial: {
          begin: () => {},
          print: (val: any) => {
            if (this.logs.length < 60) this.logs.push(String(val));
          },
          println: (val: any = '') => {
            if (this.logs.length < 60) this.logs.push(String(val));
          },
        },

        // Wire / I2C / EEPROM Mocks
        Wire: {
          begin: () => {},
          beginTransmission: () => {},
          write: () => {},
          endTransmission: () => 0,
          requestFrom: () => 0,
          read: () => 0,
        },
        EEPROM: {
          read: () => 0,
          write: () => {},
          commit: () => true,
        }
      };

      // Create sandboxed execution closure
      const factory = new Function('env', `
        with (env) {
          ${transpiledJs}

          return {
            setup: typeof setup === 'function' ? setup : null,
            loop: typeof loop === 'function' ? loop : null,
            getGlobals: () => ({
              ...(typeof Kp !== 'undefined' ? { Kp } : {}),
              ...(typeof Ki !== 'undefined' ? { Ki } : {}),
              ...(typeof Kd !== 'undefined' ? { Kd } : {}),
              ...(typeof baseSpeed !== 'undefined' ? { baseSpeed } : {}),
              ...(typeof leftSpeed !== 'undefined' ? { leftSpeed } : {}),
              ...(typeof rightSpeed !== 'undefined' ? { rightSpeed } : {}),
              ...(typeof pwmL !== 'undefined' ? { pwmL } : {}),
              ...(typeof pwmR !== 'undefined' ? { pwmR } : {}),
            })
          };
        }
      `);

      this.envContext = envContext;
      this.instance = factory(envContext);

      if (this.instance.setup) {
        this.instance.setup();
      }

      return true;
    } catch (err: any) {
      this.compileError = err.message || String(err);
      this.instance = null;
      return false;
    }
  }

  /**
   * Executes one simulation tick of the Arduino loop() with live sensor readings.
   */
  public executeTick(
    sensors0to1: number[], 
    timeSeconds: number, 
    dt: number, 
    bootPressed: boolean = false
  ): ArduinoExecutionResult {
    this.simTime = timeSeconds;
    this.isBootPressed = bootPressed;
    this.currentSensors0to1 = sensors0to1;

    if (!this.instance || !this.instance.loop) {
      return { leftSpeed: 0, rightSpeed: 0, logs: this.logs, pinout: this.pinoutConfig };
    }

    try {
      // 1. Update internal sensor array (scaled 0-1000 like QTR optical reflectance)
      for (let i = 0; i < sensors0to1.length; i++) {
        this.envContext.sensorValues[i] = Math.round((sensors0to1[i] || 0) * 1000);
      }

      // Reset direct motor variables before loop
      this.envContext._motorLeft = 0;
      this.envContext._motorRight = 0;

      // 2. Execute user's loop()
      this.instance.loop(this.envContext.sensorValues, dt);

      // 3. Determine effective motor speeds:
      let left = 0;
      let right = 0;

      // Priority A: Direct API or high-level function calls (setMotors, motors, drive, etc.)
      if (this.envContext._motorLeft !== 0 || this.envContext._motorRight !== 0) {
        left = this.envContext._motorLeft;
        right = this.envContext._motorRight;
      } 
      // Priority B: Calculate from virtual GPIO & PWM pin states (TB6612, L298N, DRV8833, PWM_DIR)
      else if (this.pinoutConfig && this.pinoutConfig.driverType !== 'UNKNOWN' && this.pinoutConfig.driverType !== 'HIGH_LEVEL') {
        const gpioSpeeds = calculateMotorSpeedsFromGPIO(
          this.digitalPins, 
          this.pwmPins, 
          this.pinoutConfig
        );
        left = gpioSpeeds.left;
        right = gpioSpeeds.right;
      } 
      // Priority C: Check global motor variables in scope
      else if (this.instance.getGlobals) {
        const globals = this.instance.getGlobals();
        if (globals.leftSpeed !== undefined && globals.rightSpeed !== undefined) {
          left = globals.leftSpeed;
          right = globals.rightSpeed;
        } else if (globals.pwmL !== undefined && globals.pwmR !== undefined) {
          left = globals.pwmL;
          right = globals.pwmR;
        }
      }

      // If outputs were given in 0-255 range, normalize to -1.0 .. +1.0
      if (Math.abs(left) > 1 || Math.abs(right) > 1) {
        left = Math.max(-1, Math.min(1, left / 255));
        right = Math.max(-1, Math.min(1, right / 255));
      }

      this.runtimeError = null;
      return { 
        leftSpeed: left, 
        rightSpeed: right, 
        logs: this.logs,
        pinout: this.pinoutConfig
      };
    } catch (err: any) {
      this.runtimeError = err.message || String(err);
      return { 
        leftSpeed: 0, 
        rightSpeed: 0, 
        logs: this.logs,
        pinout: this.pinoutConfig
      };
    }
  }
}

export const arduinoEnv = new ArduinoEnvironment();
