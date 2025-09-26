import { fork } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import chalk from "chalk";

const fileName = fileURLToPath(import.meta.url);
const dirName = path.dirname(fileName);

const adcPollPeriod = 1000;
let electrodeMv = 0;
let temperature = 0;

// ADC Electrode mV polling setup
const adcProcess = fork(`${dirName}/hardware/adc.ts`);

adcProcess.on("message", ([mV, temp]) => {
  electrodeMv = mV;
  temperature = temp;
  console.log(electrodeMv, chalk.yellow("mV"), ",", chalk.blue(temperature));
});

adcProcess.on("close", (code) => {
  console.log(chalk.redBright(`ADC process exited with code ${code}`));
});

const pollAdc = () => {
  adcProcess.send("Give me the electrode mV");
};

setInterval(pollAdc, adcPollPeriod);
