import ADS1115 from "ads1115";
import chalk from "chalk";

const i2cBus = 1;
const adcChannelNum = 0;
const adcAddress = 0x48;
const adsModule = await ADS1115.open(i2cBus, adcAddress, "i2c-bus");
adsModule.gain = 1;

const pollPeriod = 100;
let mV = 0;

const measureMv = async (): Promise<number> => {
  const rawReading: number = await adsModule.measure(`${adcChannelNum}+GND`);
  mV = Math.round(rawReading * 0.1253 - 1508.25);
  /* console.log(
    rawReading,
    chalk.yellowBright("ADC,"),
    chalk.greenBright(mV),
    chalk.greenBright("mV"),
  ); */
  return mV;
};

setInterval(measureMv, pollPeriod);

process.on("message", () => {
  process.send(mV);
});
