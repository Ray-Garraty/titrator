import ADS1115 from "ads1115";
import chalk from "chalk";

const i2cBus = 1;
const mvChannelNum = 0;
const tempChannelNum = 1;
const adcAddress = 0x48;
const adsModule = await ADS1115.open(i2cBus, adcAddress, "i2c-bus");
adsModule.gain = 1;

const A = 1.451521922 * 10 ** -3;
const B = 2.411232075 * 10 ** -4;
const C = 0.8942207997 * 10 ** -7;

const pollPeriod = 100;
let mV = 0;
let temperature = 0;

const measureMv = async () => {
  const rawMvReading = await adsModule.measure(`${mvChannelNum}+GND`);
  mV = Math.round(rawMvReading * 0.1253 - 1507.25);
  const rawTempReading = await adsModule.measure(`${tempChannelNum}+GND`);

  const resistance = Math.round(-0.675 * rawTempReading + 8797);

  temperature = Number(
    (
      1 /
        (A +
          B * Math.log(resistance) +
          C * Math.abs(Math.log(resistance)) ** 3) -
      273
    ).toFixed(1),
  );

  console.log(
    rawMvReading,
    chalk.yellowBright("ADC,"),
    chalk.greenBright(mV),
    chalk.greenBright("mV"),
    temperature,
    chalk.yellowBright("deg. C,"),
  );
};

setInterval(measureMv, pollPeriod);

process.on("message", () => {
  process.send([mV, temperature]);
});
