import type { RobotSettings, TrackSettings, SimulationState } from '../store/useStore';

export class RobotEngine {
  private trackCtx: CanvasRenderingContext2D | null = null;
  public trackImageData: ImageData | null = null;

  constructor() {}

  setTrackContext(ctx: CanvasRenderingContext2D, width: number, height: number) {
    this.trackCtx = ctx;
    this.trackImageData = ctx.getImageData(0, 0, width, height);
  }

  // Draw a basic track
  drawTrack(ctx: CanvasRenderingContext2D, trackSettings: TrackSettings) {
    const { width, height, lineWidth, type } = trackSettings;
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    
    if (type === 'infinity') {
      ctx.ellipse(width / 2, height / 2, width * 0.35, height * 0.35, 0, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(width * 0.15, height / 2);
      ctx.bezierCurveTo(width * 0.15, height * 0.8, width * 0.85, height * 0.2, width * 0.85, height / 2);
      ctx.stroke();
    } else if (type === 'oval') {
      ctx.ellipse(width / 2, height / 2, width * 0.4, height * 0.3, 0, 0, 2 * Math.PI);
      ctx.stroke();
    } else if (type === 'sharp') {
      ctx.moveTo(width * 0.2, height * 0.2);
      ctx.lineTo(width * 0.8, height * 0.2);
      ctx.lineTo(width * 0.8, height * 0.8);
      ctx.lineTo(width * 0.5, height * 0.8);
      ctx.lineTo(width * 0.5, height * 0.5);
      ctx.lineTo(width * 0.2, height * 0.5);
      ctx.closePath();
      ctx.stroke();
    }
    
    this.setTrackContext(ctx, width, height);
  }

  readSensors(state: SimulationState, settings: RobotSettings): number[] {
    if (!this.trackImageData) return Array(settings.sensorCount).fill(0);

    const sensors: number[] = [];
    const count = settings.sensorCount;
    const spacing = settings.sensorSpacing;
    const dist = settings.sensorDistance;

    const totalWidth = (count - 1) * spacing;
    const startOffset = -totalWidth / 2;

    const width = this.trackImageData.width;
    const height = this.trackImageData.height;
    const data = this.trackImageData.data;

    for (let i = 0; i < count; i++) {
      const latOffset = startOffset + i * spacing;
      
      const sX = Math.round(state.robotX + Math.cos(state.robotAngle) * dist - Math.sin(state.robotAngle) * latOffset);
      const sY = Math.round(state.robotY + Math.sin(state.robotAngle) * dist + Math.cos(state.robotAngle) * latOffset);

      if (sX >= 0 && sX < width && sY >= 0 && sY < height) {
        const index = (sY * width + sX) * 4;
        const brightness = (data[index] + data[index + 1] + data[index + 2]) / 3;
        sensors.push(1 - (brightness / 255));
      } else {
        sensors.push(0);
      }
    }
    return sensors;
  }

  update(
    state: SimulationState,
    settings: RobotSettings,
    userCode: string,
    dt: number
  ): SimulationState {
    const sensors = this.readSensors(state, settings);
    
    let leftSpeed = 0;
    let rightSpeed = 0;

    try {
      const userFunc = new Function('sensors', 'dt', userCode + '\nreturn loop(sensors, dt);');
      const result = userFunc(sensors, dt);
      
      if (result && typeof result.leftSpeed === 'number' && typeof result.rightSpeed === 'number') {
        leftSpeed = Math.max(-1, Math.min(1, result.leftSpeed));
        rightSpeed = Math.max(-1, Math.min(1, result.rightSpeed));
      }
    } catch {
      // ignore syntax or runtime errors during user editing
    }

    const vL = leftSpeed * settings.maxSpeed;
    const vR = rightSpeed * settings.maxSpeed;
    
    const v = (vL + vR) / 2;
    // Positive omega means clockwise rotation (turning right, where left wheel moves faster)
    const omega = (vL - vR) / settings.wheelbase;

    const newAngle = state.robotAngle + omega * dt;
    const newX = state.robotX + v * Math.cos(newAngle) * dt;
    const newY = state.robotY + v * Math.sin(newAngle) * dt;

    return {
      ...state,
      robotX: newX,
      robotY: newY,
      robotAngle: newAngle,
      leftMotorSpeed: leftSpeed,
      rightMotorSpeed: rightSpeed,
      time: state.time + dt
    };
  }
}

export const engine = new RobotEngine();
