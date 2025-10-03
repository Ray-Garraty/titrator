import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fileName = fileURLToPath(import.meta.url);
const dirName = path.dirname(fileName);

const scriptPath = `${dirName}/hardware/steppers/stepper.py`;

interface MotorOptions {
  dirPin: number;
  stepPin: number;
  enablePin: number;
  freq: number;
  clockwise?: boolean;
  steps?: number; // количество шагов
  timeMs?: number; // время работы
  sensor1Pin: number; // пин первого концевого датчика
  sensor2Pin: number; // пин второго концевого датчика
}

class MotorController {
  private queue: (() => Promise<void>)[] = [];

  // Добавление команды в очередь
  public addToQueue(opts: MotorOptions): void {
    this.queue.push(async () => this.runMotor(opts));
  }

  // Запуск всех команд из очереди
  public async runQueue(): Promise<void> {
    for (const command of this.queue) {
      await command();
      // Пауза, чтобы pigpiod успел освободить пины
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // Выполнение одного движения
  private async runMotor(opts: MotorOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        scriptPath,
        "--dir_pin",
        opts.dirPin.toString(),
        "--step_pin",
        opts.stepPin.toString(),
        "--enable_pin",
        opts.enablePin.toString(),
        "--freq",
        opts.freq.toString(),
        "--sensor1_pin",
        opts.sensor1Pin.toString(),
        "--sensor2_pin",
        opts.sensor2Pin.toString(),
        "--clockwise",
        (opts.clockwise ? 1 : 0).toString(),
      ];

      if (opts.steps !== undefined) {
        args.push("--steps", opts.steps.toString());
      } else if (opts.timeMs !== undefined) {
        args.push("--time_ms", opts.timeMs.toString());
      }

      const child = spawn("python3", args, { stdio: "inherit" });

      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Motor process exited with code ${code}`));
      });

      child.on("error", (err) => reject(err));
    });
  }
}

// === Пример использования ===
(async () => {
  const motorController = new MotorController();

  // Бюретка

  // Клапан
  motorController.addToQueue({
    dirPin: 24,
    stepPin: 18,
    enablePin: 4,
    freq: 500,
    timeMs: 3000,
    clockwise: false,
    sensor1Pin: 8,
    sensor2Pin: 25,
  });
  motorController.addToQueue({
    dirPin: 13,
    stepPin: 19,
    enablePin: 12,
    freq: 1000,
    steps: 2000,
    clockwise: true,
    sensor1Pin: 16,
    sensor2Pin: 7,
  });
  try {
    await motorController.runQueue();
    console.log("Оба мотора завершили работу");
  } catch (err) {
    console.error("Ошибка:", err);
  }
})();
