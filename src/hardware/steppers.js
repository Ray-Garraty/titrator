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
const rinseFreq = 750;
const valveFreq = 25;
const waveBatchSize = 5000;
const delayMs = 1000;
const vol = 10;

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

const buretteDrivePinsNums = [13, 19, 12, 16, 7];
const valveDrivePinsNums = [24, 18, 4, 8, 25];

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
      `Верхний датчик бюретки (GPIO ${sensorAtEndObj.gpio}) уже активен, бюретка пустая.`,
    );
    return;
  }

  // console.log({ stepsCount });
  const intervalMicrosecs = Math.floor(1_000_000 / (4 * freq));
  enablePinObj.digitalWrite(1);
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
  enablePinObj.digitalWrite(0);
};

const moveToSensor = async (
  stepPinObj,
  enablePinObj,
  dirPinObj,
  freq,
  isClockwise,
  limitSensorObj,
) => {
  const intervalMicrosecs = Math.floor(1_000_000 / (4 * freq));
  enablePinObj.digitalWrite(1);
  dirPinObj.digitalWrite(isClockwise ? 1 : 0);

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
  enablePinObj.digitalWrite(0);
};

const emptyBurette = async () => {
  const { stepPinObj, enablePinObj, dirPinObj, sensorAtEndObj } =
    createDriveGpiosSet(...buretteDrivePinsNums);
  console.log("\nОпустошаю бюретку...");
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
  await moveToSensor(
    stepPinObj,
    enablePinObj,
    dirPinObj,
    rinseFreq,
    false,
    sensorAtStartObj,
  );
};

const doseVolume = async (volumeMl) => {
  const stepsCount = Math.round(volumeMl / 0.0001475);
  const { stepPinObj, enablePinObj, dirPinObj, sensorAtEndObj } =
    createDriveGpiosSet(...buretteDrivePinsNums);
  console.log(`\nДозирую ${volumeMl} мл...`);
  await moveByStepsCount(
    stepPinObj,
    enablePinObj,
    dirPinObj,
    stepsCount,
    doseFreq,
    true,
    sensorAtEndObj,
  );
};

const setValveToBottleBurette = async () => {
  const { stepPinObj, enablePinObj, dirPinObj, sensorAtEndObj } =
    createDriveGpiosSet(...valveDrivePinsNums);
  console.log("\nПеревожу клапан в положение Бутыль -> Бюретка");
  if (sensorAtEndObj.digitalRead() === 1) {
    console.log(`Датчик (GPIO ${sensorAtEndObj.gpio}) уже активен.`);
    return;
  }
  await moveToSensor(
    stepPinObj,
    enablePinObj,
    dirPinObj,
    valveFreq,
    true,
    sensorAtEndObj,
  );
};

const setValveToBuretteVessel = async () => {
  const { stepPinObj, enablePinObj, dirPinObj, sensorAtStartObj } =
    createDriveGpiosSet(...valveDrivePinsNums);
  console.log("\nПеревожу клапан в положение Бюретка -> Титровальный сосуд...");
  if (sensorAtStartObj.digitalRead() === 1) {
    console.log(`Датчик (GPIO ${sensorAtStartObj.gpio}) уже активен.`);
    return;
  }
  await moveToSensor(
    stepPinObj,
    enablePinObj,
    dirPinObj,
    valveFreq,
    false,
    sensorAtStartObj,
  );
};

await setValveToBottleBurette();
await delay(1000);
await fillBurette();
await delay(1000);
await setValveToBuretteVessel();
console.warn("Get ready!");
await delay(2000);
await doseVolume(vol);
