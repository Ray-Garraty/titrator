import { fork } from "node:child_process";
import path from "node:path";
import readlineSync from "readline-sync";
import { fileURLToPath } from "node:url";

import chalk from "chalk";

const fileName = fileURLToPath(import.meta.url);
const dirName = path.dirname(fileName);

const adcPollPeriod = 500;
let electrodeMv = 0;
let pH = 0;
let temperature = 0;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ADC Electrode mV polling setup
const adcProcess = fork(`${dirName}/hardware/adc.js`);

adcProcess.on("message", ([mV, temp]) => {
  electrodeMv = mV;
  pH = Math.round((7 - mV / 59.16) * 100) / 100;
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

// Titration setup
const doseTitrant = (volume) => {
  console.log(`\n➡️  Дозировано ${volume} мл титранта`);
};

const titrate = () => {
  console.log('--- Линейное титрование ---');
  console.log('Включаем мешалку...');

  const rawStep = readlineSync.question('Введите шаг дозирования (0.05–0.5 мл): ').replace(',', '.');
  const stepVolume = parseFloat(rawStep);
  if (isNaN(stepVolume) || stepVolume < 0.05 || stepVolume > 0.5) {
    console.error('❌ Некорректный шаг дозирования. Должен быть от 0.05 до 0.5 мл.');
    return;
  }

  const rawTarget = readlineSync.question('Введите целевое значение pH (0.00–14.00): ').replace(',', '.');
  let targetpH = parseFloat(rawTarget);
  if (isNaN(targetpH) || targetpH < 0 || targetpH > 14) {
    console.error('❌ Некорректное значение pH. Должно быть от 0 до 14.');
    return;
  }
  targetpH = Math.round(targetpH * 100) / 100;

  const stopThreshold = Math.min(targetpH + 1, 14);
  const maxVolume = 10.0; // принудительное ограничение объёма

  console.log(`\nЗапуск титрования. Целевой pH = ${targetpH.toFixed(2)}.`);
  console.log(`Будем продолжать до pH ≥ ${stopThreshold.toFixed(2)} или при достижении 10 мл.\n`);

  let totalVolume = 0.0;
  let volumeAtTarget = null;
  
  console.log(`Стартовое pH = ${pH.toFixed(2)}.`);

  if (pH >= targetpH) {
    volumeAtTarget = 0.0;
    console.log(`Стартовое pH уже ≥ целевого (${targetpH.toFixed(2)}). Объём до целевого: 0.00 мл.`);
  }

  while (pH < stopThreshold && totalVolume < maxVolume) {
    doseTitrant(stepVolume);
    totalVolume += stepVolume;

    if (totalVolume >= maxVolume) {
      console.warn(`⚠️ Достигнут максимальный объём (${maxVolume.toFixed(2)} мл). Титрование принудительно остановлено.`);
      break;
    }

    sleepSync(1000);

    console.log(`pH = ${pH.toFixed(2)} | Суммарно: ${totalVolume.toFixed(2)} мл`);

    if (volumeAtTarget === null && pH >= targetpH) {
      volumeAtTarget = totalVolume;
      console.log(`-- Целевой pH = ${targetpH.toFixed(2)} достигнут при объёме ${volumeAtTarget.toFixed(2)} мл.`);
    }
  }

  if (volumeAtTarget === null) {
    console.warn('⚠️ Целевой pH не был зафиксирован. Возвращаю общий объём как приближение.');
    volumeAtTarget = totalVolume;
  }

  console.log('\n✅ Титрование завершено.');
  console.log(`Результат (до достижения pH ${targetpH.toFixed(2)}): ${volumeAtTarget.toFixed(2)} мл`);
  console.log(`(Всего дозировано до конца процесса): ${totalVolume.toFixed(2)} мл`);
}

titrate();