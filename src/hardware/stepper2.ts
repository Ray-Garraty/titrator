import pigpioPkg from "pigpio";

const {
  Gpio,
  waveClear,
  waveAddGeneric,
  waveCreate,
  waveTxSend,
  waveTxBusy,
  waveDelete,
} = pigpioPkg;

interface MotorOptions {
  dirPin: number;
  stepPin: number;
  enablePin: number;
  freq: number;
  clockwise?: boolean;
  steps?: number;
  timeMs?: number;
  sensor1Pin: number;
  sensor2Pin: number;
}

class MotorController {
  private queue: (() => Promise<void>)[] = [];

  public addToQueue(opts: MotorOptions): void {
    this.queue.push(async () => this.runMotor(opts));
  }

  public async runQueue(): Promise<void> {
    for (const command of this.queue) {
      await command();
    }
  }

  private async runMotor(opts: MotorOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const dir = new Gpio(opts.dirPin, { mode: Gpio.OUTPUT });
      const step = new Gpio(opts.stepPin, { mode: Gpio.OUTPUT });
      const enable = new Gpio(opts.enablePin, { mode: Gpio.OUTPUT });

      const sensor1 = new Gpio(opts.sensor1Pin, {
        mode: Gpio.INPUT,
        pullUpDown: Gpio.PUD_DOWN,
        alert: true,
      });
      const sensor2 = new Gpio(opts.sensor2Pin, {
        mode: Gpio.INPUT,
        pullUpDown: Gpio.PUD_DOWN,
        alert: true,
      });

      let isRunning = true;

      const stopMotor = (pin: number, level: number, tick: number) => {
        if (isRunning) {
          console.log(`Сработал датчик на пине GPIO${pin}. Остановка мотора.`);
          isRunning = false;
          enable.digitalWrite(0);
        }
      };

      sensor1.on("alert", stopMotor);
      sensor2.on("alert", stopMotor);

      enable.digitalWrite(1);
      dir.digitalWrite(opts.clockwise ? 1 : 0);

      const stepByCount = async (steps: number, freq: number) => {
        const micros = Math.floor(1_000_000 / (2 * freq));
        let done = 0;
        while (done < steps && isRunning) {
          const batch = Math.min(1000, steps - done);
          const pulses = [];
          for (let i = 0; i < batch; i++) {
            pulses.push({
              gpioOn: opts.stepPin,
              gpioOff: 0,
              usDelay: micros,
            });
            pulses.push({
              gpioOn: 0,
              gpioOff: opts.stepPin,
              usDelay: micros,
            });
          }
          // console.log(pulses[0]);
          waveClear();
          waveAddGeneric(pulses);
          const wid = waveCreate();
          if (wid >= 0) {
            // console.log("Создана волна wid=", wid, " batch=", batch);
            waveTxSend(wid, pigpioPkg.WAVE_MODE_ONE_SHOT);
            while (waveTxBusy() && isRunning) {
              await new Promise((r) => setTimeout(r, 1));
            }
            waveDelete(wid);
          }
          done += batch;
        }
      };

      const stepByTime = async (durationMs: number, freq: number) => {
        const delay = 1000 / (2 * freq); // мс
        const end = Date.now() + durationMs;
        while (Date.now() < end && isRunning) {
          step.digitalWrite(1);
          await new Promise((r) => setTimeout(r, delay));
          step.digitalWrite(0);
          await new Promise((r) => setTimeout(r, delay));
        }
      };

      const cleanup = () => {
        // Отключаем мотор
        enable.digitalWrite(0);
        dir.digitalWrite(0);
        step.digitalWrite(0);

        // Отключаем оповещения от датчиков
        sensor1.disableAlert();
        sensor2.disableAlert();
      };

      const run = async () => {
        try {
          if (opts.steps !== undefined) {
            await stepByCount(opts.steps, opts.freq);
          } else if (opts.timeMs !== undefined) {
            await stepByTime(opts.timeMs, opts.freq);
          }
          cleanup();
          resolve(undefined);
        } catch (err) {
          cleanup();
          reject(err);
        }
      };

      run();
    });
  }
}

// === Пример использования ===
(async () => {
  const motorController = new MotorController();

  // Бюретка
  motorController.addToQueue({
    dirPin: 13,
    stepPin: 19,
    enablePin: 12,
    freq: 1000,
    steps: 20000,
    clockwise: true,
    sensor1Pin: 16,
    sensor2Pin: 7,
  });

  // Клапан
  motorController.addToQueue({
    dirPin: 24,
    stepPin: 18,
    enablePin: 4,
    freq: 500,
    timeMs: 30000,
    clockwise: false,
    sensor1Pin: 8,
    sensor2Pin: 25,
  });

  try {
    await motorController.runQueue();
    console.log("Оба мотора завершили работу");
  } catch (err) {
    console.error("Ошибка:", err);
  }
})();
