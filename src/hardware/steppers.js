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

function createGpioMotor(opts) {
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

async function stepByCount(stepPin, enable, dir, steps, freq, clockwise) {
  const micros = Math.floor(1_000_000 / (4 * freq));
  let done = 0;
  enable.digitalWrite(1);
  dir.digitalWrite(clockwise ? 1 : 0);

  while (done < steps) {
    const batch = Math.min(2000, steps - done);
    const pulses = [];
    for (let i = 0; i < batch; i += 1) {
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

async function stepUntilSensor(stepPin, enable, dir, freq, clockwise, sensor) {
  const micros = Math.floor(1_000_000 / (2 * freq));
  enable.digitalWrite(1);
  dir.digitalWrite(clockwise ? 1 : 0);

  let triggered = false;
  while (!triggered) {
    const pulses = [
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

async function emptyBurette(opts) {
  const { dir, step, enable, sensorUpper } = createGpioMotor(opts);
  console.log("\nОпустошение бюретки");
  await stepUntilSensor(
    opts.stepPin,
    enable,
    dir,
    opts.freq,
    true,
    sensorUpper,
  );
}

async function fillBurette(opts) {
  const { dir, step, enable, sensorLower } = createGpioMotor(opts);
  console.log("\nЗаполнение бюретки");
  await stepUntilSensor(
    opts.stepPin,
    enable,
    dir,
    opts.freq,
    false,
    sensorLower,
  );
}

async function rinseBurette(opts) {
  console.log("\nПромывка бюретки");
  await emptyBurette(opts);
  await fillBurette(opts);
}

async function doseVolume(opts, volumeMl) {
  const steps = volumeMl / 0.0002965;
  const { dir, step, enable, sensorUpper } = createGpioMotor(opts);
  console.log("\nДозирование заданного объёма");
  if (sensorUpper.digitalRead() === 1) {
    console.log(
      `Верхний датчик бюретки (GPIO ${sensorUpper.gpio}) уже активен, бюретка пустая.`,
    );
    return;
  }
  await stepByCount(opts.stepPin, enable, dir, steps, opts.freq / 2, true);
}

async function titrationMode(opts, readPH) {
  const { dir, step, enable, sensorLower } = createGpioMotor(opts);
  console.log("\nТитрование с переменной скоростью");
  let continueTitration = true;
  let doseSteps = 100;

  while (continueTitration) {
    await stepByCount(
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
    if (ph >= 7) continueTitration = false;
    else doseSteps = Math.min(doseSteps + 50, 1000);
  }

  await stepUntilSensor(
    opts.stepPin,
    enable,
    dir,
    opts.freq,
    false,
    sensorLower,
  );
}

async function setValveBuretteToVessel(opts) {
  const { dir, enable, sensorLower: sensorBottle } = createGpioMotor(opts);
  console.log("\nКлапан: положение Бутыль -> Бюретка");
  if (sensorBottle.digitalRead() === 1) {
    console.log(
      `Концевой датчик клапана (GPIO ${sensorBottle.gpio}) уже активен`,
    );
    return;
  }
  await stepUntilSensor(
    opts.stepPin,
    enable,
    dir,
    opts.freq,
    false,
    sensorBottle,
  );
}

async function setValveBottleToBurette(opts) {
  const { dir, enable, sensorUpper: sensorVessel } = createGpioMotor(opts);
  console.log("\nКлапан: положение Бюретка -> Сосуд");
  if (sensorVessel.digitalRead() === 1) {
    console.log(
      `Концевой датчик клапана (GPIO ${sensorVessel.gpio}) уже активен`,
    );
    return;
  }
  await stepUntilSensor(
    opts.stepPin,
    enable,
    dir,
    opts.freq,
    true,
    sensorVessel,
  );
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  const buretteOpts = {
    dirPin: 13,
    stepPin: 19,
    enablePin: 12,
    freq: 1000,
    clockwise: true,
    sensor1Pin: 16,
    sensor2Pin: 7,
  };

  const valveOpts = {
    dirPin: 24,
    stepPin: 18,
    enablePin: 4,
    freq: 75,
    clockwise: false,
    sensor1Pin: 8,
    sensor2Pin: 25,
  };

  try {
    await setValveBottleToBurette(valveOpts);
    await delay(1000);
    await fillBurette(buretteOpts);
    await delay(1000);
    await setValveBuretteToVessel(valveOpts);
    await delay(1000);
    await emptyBurette(buretteOpts);
    await delay(1000);
    await setValveBottleToBurette(valveOpts);
    await delay(1000);
    await fillBurette(buretteOpts);
    await delay(1000);
    await setValveBuretteToVessel(valveOpts);
    await delay(1000);
    await doseVolume(buretteOpts, 10);
    console.log("Все операции завершены");
  } catch (err) {
    console.error("Ошибка:", err);
  }
})();
