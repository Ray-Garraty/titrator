import pigpio from "pigpio";

const { Gpio } = pigpio;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const stirrer = new Gpio(23, { mode: Gpio.OUTPUT });

// stirrer.pwmFrequency(2000);

function setStirrerSpeed(percent) {
  const duty = Math.round((percent / 100) * 255);
  stirrer.pwmWrite(duty);
  console.log(`Скорость мешалки: ${percent}% (duty=${duty})`);
}

setStirrerSpeed(100);
delay(10000);
// setStirrerSpeed(80);

// setStirrerSpeed(0);
