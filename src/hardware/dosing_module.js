import pigpioPkg from "pigpio";

const {
  Gpio,
  waveClear,
  waveAddGeneric,
  waveChain,
  waveCreate,
  waveTxBusy,
  waveTxStop,
} = pigpioPkg;

const doseFreq = 500;
const rinseFreq = 500;
const waveBatchSize = 5000;
const delayMs = 1000;
const buretteMaxVol = 8.14;

const buretteDrivePinsNums = [17, 27, 22, 6, 5]; // Stepper driver GPIO pin numbers array: [ DIR, STEP, EN, SENSOR_AT_START, SENSOR_AT_END ]

const valvePinNum = 26; // Valve GPIO pin number
const valvePinObj = new Gpio(valvePinNum, { mode: Gpio.OUTPUT });
const switchValveToInput = async () => valvePinObj.digitalWrite(0);
const switchValveToOutput = async () => valvePinObj.digitalWrite(1);

// eslint-disable-next-line no-promise-executor-return
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createDriveGpiosSet = (
  dirPinNum,
  stepPinNum,
  enablePinNum,
  sensorAtStartPinNum,
  sensorAtEndPinNum,
) => {
  const dirPinObj = new Gpio(dirPinNum, { mode: Gpio.OUTPUT });
  const stepPinObj = new Gpio(stepPinNum, { mode: Gpio.OUTPUT });
  const enablePinObj = new Gpio(enablePinNum, { mode: Gpio.OUTPUT });
  const sensorAtStartObj = new Gpio(sensorAtStartPinNum, {
    mode: Gpio.INPUT,
    pullUpDown: Gpio.PUD_DOWN,
  });
  const sensorAtEndObj = new Gpio(sensorAtEndPinNum, {
    mode: Gpio.INPUT,
    pullUpDown: Gpio.PUD_DOWN,
  });

  return {
    dirPinObj,
    stepPinObj,
    enablePinObj,
    sensorAtStartObj,
    sensorAtEndObj,
  };
};

const moveByStepsCount = async (
  stepPinObj,
  enablePinObj,
  dirPinObj,
  stepsCount,
  freq,
  isClockwise,
  sensorAtEndObj,
) => {
  if (sensorAtEndObj.digitalRead() === 1) {
    console.log(
      `Сработал верхний датчик (GPIO ${sensorAtEndObj.gpio})`,
    );
    return;
  }

  console.log({ stepsCount });
  const intervalMicrosecs = Math.floor(1000000 / (4 * freq));
  enablePinObj.digitalWrite(0);
  dirPinObj.digitalWrite(isClockwise ? 1 : 0);

  const fillPulsesArray = (v, i) =>
    i % 2 === 0
      ? { gpioOn: 0, gpioOff: stepPinObj.gpio, usDelay: intervalMicrosecs }
      : { gpioOn: stepPinObj.gpio, gpioOff: 0, usDelay: intervalMicrosecs };

  const repeatsCount = Math.floor(stepsCount / waveBatchSize);
  // console.log({ repeatsCount });
  const leftoverCount = stepsCount % waveBatchSize;

  waveClear();
  const pulsesMainBatch = Array.from(
    { length: waveBatchSize },
    fillPulsesArray,
  );
  const mainBatchPulsesCount = waveAddGeneric(pulsesMainBatch);
  // console.log({ mainBatchPulsesCount });
  const mainWaveId = waveCreate();

  const chain = [255, 0, mainWaveId, 255, 1, repeatsCount, 0];

  if (leftoverCount !== 0) {
    const pulsesLeftover = Array.from(
      { length: leftoverCount },
      fillPulsesArray,
    );
    const leftoverPulsesCount = waveAddGeneric(pulsesLeftover);
    // console.log({ leftoverPulsesCount });
    const leftoverWaveId = waveCreate();
    const expandedChain = [...chain, 255, 0, leftoverWaveId];
    waveChain(expandedChain);
  } else {
    waveChain(chain);
  }

  while (waveTxBusy()) {
    if (sensorAtEndObj.digitalRead() === 1) {
      console.log(`Сработал датчик GPIO ${sensorAtEndObj.gpio}`);
      waveTxStop();
      break;
    }
  }
  enablePinObj.digitalWrite(1);
};

const moveToSensor = async (
  stepPinObj,
  enablePinObj,
  dirPinObj,
  freq,
  isClockwise,
  limitSensorObj,
) => {
  const intervalMicrosecs = Math.floor(1000000 / (4 * freq));
  enablePinObj.digitalWrite(0);
  dirPinObj.digitalWrite(isClockwise ? 0 : 1);

  const fillPulsesArray = (v, i) =>
    i % 2 === 0
      ? { gpioOn: 0, gpioOff: stepPinObj.gpio, usDelay: intervalMicrosecs }
      : { gpioOn: stepPinObj.gpio, gpioOff: 0, usDelay: intervalMicrosecs };

  waveClear();
  const pulses = Array.from({ length: waveBatchSize }, fillPulsesArray);
  waveAddGeneric(pulses);
  const waveId = waveCreate();

  const chain = [255, 0, waveId, 255, 3];
  waveChain(chain);

  while (waveTxBusy()) {
    if (limitSensorObj.digitalRead() === 1) {
      console.log(`Сработал датчик GPIO ${limitSensorObj.gpio}`);
      waveTxStop();
      break;
    }
  }
  enablePinObj.digitalWrite(1);
};

const emptyBurette = async () => {
  const { stepPinObj, enablePinObj, dirPinObj, sensorAtEndObj } =
    createDriveGpiosSet(...buretteDrivePinsNums);
  console.log("\nОпустошаю бюретку...");
  await switchValveToOutput();
  await moveToSensor(
    stepPinObj,
    enablePinObj,
    dirPinObj,
    rinseFreq,
    true,
    sensorAtEndObj,
  );
};

const fillBurette = async () => {
  const { stepPinObj, enablePinObj, dirPinObj, sensorAtStartObj } =
    createDriveGpiosSet(...buretteDrivePinsNums);
  console.log("\nЗаполняю бюретку...");
  await switchValveToInput();
  await moveToSensor(
    stepPinObj,
    enablePinObj,
    dirPinObj,
    rinseFreq,
    false,
    sensorAtStartObj,
  );
};

const rinseBurette = async (repeatsCount = 1) => {
  const rinseOnce = async () => {
    await emptyBurette();
    await delay(1000);
    await fillBurette();
    console.log("\nЦикл промывки завершён");
  };
  for (let i = 0; i < repeatsCount; i += 1) {
    await rinseOnce();
  }
};

const doseVolume = async (volumeMl = 1) => {
  const cyclesCount = Math.floor(volumeMl / buretteMaxVol);
  console.log({ cyclesCount });
  const leftoverVol = Math.round(100 * (volumeMl % buretteMaxVol)) / 100;
  console.log({ leftoverVol });
  const leftoverStepsCount = Math.round(leftoverVol * 7704.16);
  console.log({ leftoverStepsCount });
  const { stepPinObj, enablePinObj, dirPinObj, sensorAtEndObj } =
    createDriveGpiosSet(...buretteDrivePinsNums);

  // console.log(`\nДозирую ${steps} шагов...`);
  console.log(`\nДозирую ${volumeMl} мл...`);
  await rinseBurette(cyclesCount);

  await switchValveToOutput();
  console.log(`\nДозирую ещё ${leftoverVol} мл...`);
  await moveByStepsCount(
    stepPinObj,
    enablePinObj,
    dirPinObj,
    leftoverStepsCount,
    doseFreq,
    false,
    sensorAtEndObj,
  );
  await delay(2000);
  await switchValveToInput();
  await fillBurette();
};

await doseVolume(20);

// await fillBurette();

// await emptyBurette();

// await switchValveToInput();

// await rinseBurette();
