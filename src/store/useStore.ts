import { create } from 'zustand';

export type RobotSettings = {
  weight: number; // kg
  wheelbase: number; // px distance between wheels
  wheelRadius: number; // px radius
  sensorCount: number; // number of sensors
  sensorSpacing: number; // px distance between adjacent sensors
  sensorDistance: number; // px distance from the center of the wheels to the sensors
  maxSpeed: number; // max pixels per second
  friction: number; // friction coefficient
};

export type TrackSettings = {
  lineWidth: number;
  width: number;
  height: number;
  type: 'infinity' | 'oval' | 'sharp';
};

export type SimulationState = {
  isRunning: boolean;
  robotX: number;
  robotY: number;
  robotAngle: number;
  leftMotorSpeed: number; // -1 to 1
  rightMotorSpeed: number; // -1 to 1
  time: number;
};

export const getTrackStartPosition = (type: 'infinity' | 'oval' | 'sharp', width = 800, height = 600) => {
  switch (type) {
    case 'oval':
      // Top vertex of the oval: line goes horizontally to the right
      return { x: width / 2, y: height / 2 - height * 0.3, angle: 0 };
    case 'sharp':
      // Top edge of the sharp track: moving right
      return { x: width * 0.35, y: height * 0.2, angle: 0 };
    case 'infinity':
    default:
      // Top point of the outer ellipse: moving right
      return { x: width / 2, y: height / 2 - height * 0.35, angle: 0 };
  }
};

interface AppState {
  settings: RobotSettings;
  updateSettings: (newSettings: Partial<RobotSettings>) => void;
  
  trackSettings: TrackSettings;
  updateTrackSettings: (newSettings: Partial<TrackSettings>) => void;

  code: string;
  setCode: (code: string) => void;
  
  simState: SimulationState;
  updateSimState: (newState: Partial<SimulationState>) => void;
  resetSim: (startX?: number, startY?: number, angle?: number) => void;
  toggleSim: () => void;
}

const defaultCode = `// PID Controller for Line Follower
// sensors: array of numbers [0..1] (1 = over black line, 0 = white surface)
// dt: delta time in seconds
// return { leftSpeed: -1..1, rightSpeed: -1..1 }

function loop(sensors, dt) {
  const midIndex = Math.floor(sensors.length / 2);
  let error = 0;
  let activeSensors = 0;
  
  for (let i = 0; i < sensors.length; i++) {
    const weight = i - midIndex;
    error += sensors[i] * weight;
    if (sensors[i] > 0.4) activeSensors++;
  }
  
  // If line is lost completely, spin in place towards last direction
  if (activeSensors === 0) {
    return { leftSpeed: -0.4, rightSpeed: 0.4 };
  }

  const baseSpeed = 0.7;
  const kP = 0.4;
  const turn = error * kP;
  
  return {
    leftSpeed: baseSpeed + turn,
    rightSpeed: baseSpeed - turn
  };
}
`;

const initialTrackSettings: TrackSettings = {
  lineWidth: 24,
  width: 800,
  height: 600,
  type: 'infinity',
};

const initialPos = getTrackStartPosition(initialTrackSettings.type, initialTrackSettings.width, initialTrackSettings.height);

export const useStore = create<AppState>((set, get) => ({
  settings: {
    weight: 1.5,
    wheelbase: 50,
    wheelRadius: 15,
    sensorCount: 5,
    sensorSpacing: 12,
    sensorDistance: 45,
    maxSpeed: 160,
    friction: 0.1,
  },
  updateSettings: (newSettings) => 
    set((state) => ({ settings: { ...state.settings, ...newSettings } })),
    
  trackSettings: initialTrackSettings,
  updateTrackSettings: (newSettings) => {
    set((state) => {
      const updated = { ...state.trackSettings, ...newSettings };
      // If track type changed, automatically reposition robot on the new track
      if (newSettings.type && newSettings.type !== state.trackSettings.type) {
        const newPos = getTrackStartPosition(newSettings.type, updated.width, updated.height);
        return {
          trackSettings: updated,
          simState: {
            ...state.simState,
            isRunning: false,
            robotX: newPos.x,
            robotY: newPos.y,
            robotAngle: newPos.angle,
            leftMotorSpeed: 0,
            rightMotorSpeed: 0,
            time: 0,
          },
        };
      }
      return { trackSettings: updated };
    });
  },

  code: defaultCode,
  setCode: (code) => set({ code }),
  
  simState: {
    isRunning: false,
    robotX: initialPos.x,
    robotY: initialPos.y,
    robotAngle: initialPos.angle,
    leftMotorSpeed: 0,
    rightMotorSpeed: 0,
    time: 0,
  },
  updateSimState: (newState) => 
    set((state) => ({ simState: { ...state.simState, ...newState } })),
    
  resetSim: (startX, startY, angle) => {
    const { trackSettings } = get();
    const defaultPos = getTrackStartPosition(trackSettings.type, trackSettings.width, trackSettings.height);
    set((state) => ({ 
      simState: { 
        ...state.simState, 
        isRunning: false, 
        robotX: startX ?? defaultPos.x, 
        robotY: startY ?? defaultPos.y, 
        robotAngle: angle ?? defaultPos.angle, 
        leftMotorSpeed: 0, 
        rightMotorSpeed: 0, 
        time: 0 
      } 
    }));
  },
  toggleSim: () => set((state) => ({
    simState: { ...state.simState, isRunning: !state.simState.isRunning }
  }))
}));
