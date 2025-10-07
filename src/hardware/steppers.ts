/* eslint-disable no-await-in-loop */
import pigpioPkg from "pigpio";

const {
  Gpio,
  waveClear,
  waveAddGeneric,
  waveCreate,
  waveTxBusy,
  waveDelete,
  waveTxStop,
  waveTxSend,
} = pigpioPkg;

// Интерфейсы для моторов
interface MotorOptions {
  dirPin: number;
  stepPin: number;
  enablePin: number;
  freq: number;
  clockwise?: boolean;
  steps?: number;
  timeMs?: number;
  sensor1Pin: number; // начальный
  sensor2Pin: number; // конечный
}

class MotorController {
  private queue: (() => Promise<void>)[] = [];

  public addToQueue(task: () => Promise<void>): void {
    this.queue.push(task);
  }

  public async runQueue(): Promise<void> {
    for (const command of this.queue) {
      await command();
    }
  }

  private createGpioMotor(opts: MotorOptions) {
    const dir = new Gpio(opts.dirPin, { mode: Gpio.OUTPUT });
    const step = new Gpio(opts.stepPin, { mode: Gpio.OUTPUT });
    const enable = new Gpio(opts.enablePin, { mode: Gpio.OUTPUT });

    const sensorLower = new Gpio(opts.sensor1Pin, {
      mode: Gpio.INPUT,
      pullUpDown: Gpio.PUD_DOWN,
    });
    const sensorUpper = new Gpio(opts.sensor2Pin, {
      mode: Gpio.INPUT,
      pullUpDown: Gpio.PUD_DOWN,
    });

    return { dir, step, enable, sensorLower, sensorUpper };
  }

  private async stepByCount(
    stepPin: number,
    enable: any,
    dir: any,
    steps: number,
    freq: number,
    clockwise: boolean,
  ) {
    const micros = Math.floor(1_000_000 / (4 * freq));
    let done = 0;
    enable.digitalWrite(1);
    dir.digitalWrite(clockwise ? 1 : 0);

    while (done < steps) {
      const batch = Math.min(2000, steps - done);
      const pulses: any[] = [];
      for (let i = 0; i < batch; i++) {
        pulses.push({ gpioOn: stepPin, gpioOff: 0, usDelay: micros });
        pulses.push({ gpioOn: 0, gpioOff: stepPin, usDelay: micros });
      }

      waveClear();
      waveAddGeneric(pulses);
      const wid = waveCreate();
      if (wid >= 0) {
        waveTxSend(wid, pigpioPkg.WAVE_MODE_ONE_SHOT);
        while (waveTxBusy()) {
          await new Promise((r) => setTimeout(r, 1));
        }
        waveDelete(wid);
      }

      done += batch;
    }

    enable.digitalWrite(0);
  }

  private async stepUntilSensor(
    stepPin: number,
    enable: any,
    dir: any,
    freq: number,
    clockwise: boolean,
    sensor: any,
  ) {
    const micros = Math.floor(1_000_000 / (2 * freq));
    enable.digitalWrite(1);
    dir.digitalWrite(clockwise ? 1 : 0);

    let triggered = false;
    while (!triggered) {
      const pulses: any[] = [
        { gpioOn: stepPin, gpioOff: 0, usDelay: micros },
        { gpioOn: 0, gpioOff: stepPin, usDelay: micros },
      ];
      waveClear();
      waveAddGeneric(pulses);
      const wid = waveCreate();
      if (wid >= 0) {
        waveTxSend(wid, pigpioPkg.WAVE_MODE_ONE_SHOT);
        while (waveTxBusy()) {
          if (sensor.digitalRead() === 1) {
            triggered = true;
            console.log(`Концевой датчик (GPIO ${sensor.gpio}) сработал`);
            waveTxStop();
            break;
          }
          await new Promise((r) => setTimeout(r, 1));
        }
        waveDelete(wid);
      }
    }
    enable.digitalWrite(0);
  }

  // === Алгоритмы для бюретки ===
  public async emptyBurette(opts: MotorOptions) {
    const { dir, step, enable, sensorLower, sensorUpper } =
      this.createGpioMotor(opts);
    console.log("\nОпустошение бюретки");
    await this.stepUntilSensor(
      opts.stepPin,
      enable,
      dir,
      opts.freq,
      true,
      sensorUpper,
    );
  }

  public async fillBurette(opts: MotorOptions) {
    const { dir, step, enable, sensorLower, sensorUpper } =
      this.createGpioMotor(opts);
    console.log("\nЗаполнение бюретки");
    await this.stepUntilSensor(
      opts.stepPin,
      enable,
      dir,
      opts.freq,
      false,
      sensorLower,
    );
  }

  public async rinseBurette(opts: MotorOptions) {
    console.log("\nПромывка бюретки");
    await this.emptyBurette(opts);
    await this.fillBurette(opts);
  }

  public async doseVolume(opts: MotorOptions, volumeMl: number) {
    const steps = volumeMl / 0.0002965;
    const { dir, step, enable, sensorLower, sensorUpper } =
      this.createGpioMotor(opts);
    console.log("\nДозирование заданного объёма");
    if (sensorUpper.digitalRead() === 1) {
      console.log(
        "Верхний датчик бюретки (GPIO",
        sensorUpper.gpio,
        ") уже активен, бюретка пустая, мне нечего дозировать...",
      );
      return;
    }
    await this.stepByCount(
      opts.stepPin,
      enable,
      dir,
      steps,
      opts.freq / 2,
      true,
    );
  }

  public async titrationMode(
    opts: MotorOptions,
    readPH: () => Promise<number>,
  ) {
    const { dir, step, enable, sensorLower, sensorUpper } =
      this.createGpioMotor(opts);
    console.log("\nТитрование с переменной скоростью");

    let continueTitration = true;
    let doseSteps = 100;

    while (continueTitration) {
      await this.stepByCount(
        opts.stepPin,
        enable,
        dir,
        doseSteps,
        opts.freq / 2,
        true,
      );
      await new Promise((r) => setTimeout(r, 2000));
      const ph = await readPH();
      console.log("pH =", ph);

      if (ph >= 7) {
        continueTitration = false;
      } else {
        doseSteps = Math.min(doseSteps + 50, 1000);
      }
    }

    await this.stepUntilSensor(
      opts.stepPin,
      enable,
      dir,
      opts.freq,
      false,
      sensorLower,
    );
  }

  // === Алгоритмы для клапана ===
  public async setValveBuretteToVessel(opts: MotorOptions) {
    const {
      dir,
      step,
      enable,
      sensorLower: sensorBottle,
      sensorUpper: sensorVessel,
    } = this.createGpioMotor(opts);
    console.log("\nКлапан: положение Бутыль -> Бюретка");
    if (sensorBottle.digitalRead() === 1) {
      console.log(
        "Концевой датчик клапана (GPIO",
        sensorBottle.gpio,
        ") уже активен",
      );
      return;
    }
    await this.stepUntilSensor(
      opts.stepPin,
      enable,
      dir,
      opts.freq,
      false,
      sensorBottle,
    );
  }

  public async setValveBottleToBurette(opts: MotorOptions) {
    const {
      dir,
      step,
      enable,
      sensorLower: sensorBottle,
      sensorUpper: sensorVessel,
    } = this.createGpioMotor(opts);
    console.log("\nКлапан: положение Бюретка -> Сосуд");
    if (sensorVessel.digitalRead() === 1) {
      console.log(
        "Концевой датчик клапана (GPIO",
        sensorVessel.gpio,
        ") уже активен",
      );
      return;
    }
    await this.stepUntilSensor(
      opts.stepPin,
      enable,
      dir,
      opts.freq,
      true,
      sensorVessel,
    );
  }
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// === Пример использования ===
(async () => {
  const motorController = new MotorController();

  const buretteOpts: MotorOptions = {
    dirPin: 13,
    stepPin: 19,
    enablePin: 12,
    freq: 1000,
    clockwise: true,
    sensor1Pin: 16,
    sensor2Pin: 7,
  };

  const valveOpts: MotorOptions = {
    dirPin: 24,
    stepPin: 18,
    enablePin: 4,
    freq: 75,
    clockwise: false,
    sensor1Pin: 8,
    sensor2Pin: 25,
  };

  try {
    await motorController.setValveBottleToBurette(valveOpts);
    await delay(1000);
    await motorController.fillBurette(buretteOpts);
    await delay(1000);
    await motorController.setValveBuretteToVessel(valveOpts);
    await delay(1000);
    await motorController.emptyBurette(buretteOpts);
    await delay(1000);
    await motorController.setValveBottleToBurette(valveOpts);
    await delay(1000);
    await motorController.fillBurette(buretteOpts);
    await delay(1000);
    await motorController.setValveBuretteToVessel(valveOpts);
    await delay(1000);
    await motorController.doseVolume(buretteOpts, 10);

    // await motorController.rinseBurette(buretteOpts);
    // const fakeReadPH = async () => 6.5 + Math.random();
    // await motorController.titrationMode(buretteOpts, fakeReadPH);
    
    console.log("Все операции завершены");
  } catch (err) {
    console.error("Ошибка:", err);
  }
})();
