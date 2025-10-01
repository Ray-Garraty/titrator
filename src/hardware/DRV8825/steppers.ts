import { Gpio } from 'pigpio';

class StepperMotor {
  private dir: Gpio;
  private step: Gpio;
  private enable: Gpio;
  private stepPin: number;

  constructor(dirPin: number, stepPin: number, enablePin: number) {
    this.dir = new Gpio(dirPin, { mode: Gpio.OUTPUT });
    this.step = new Gpio(stepPin, { mode: Gpio.OUTPUT });
    this.enable = new Gpio(enablePin, { mode: Gpio.OUTPUT });
    this.stepPin = stepPin;

    this.disable(); // по умолчанию драйвер выключен
  }

  enableMotor() {
    this.enable.digitalWrite(0); // LOW = включено
  }

  disable() {
    this.enable.digitalWrite(1); // HIGH = выключено
  }

  setDirection(clockwise: boolean) {
    this.dir.digitalWrite(clockwise ? 1 : 0);
  }

  async stepMotor(steps: number, stepDelay: number) {
    // stepDelay в микросекундах
    const pulseDuration = 10; // длительность импульса HIGH в мкс
    const delayDuration = stepDelay - pulseDuration;

    // очищаем предыдущие волны
    Gpio.waveClear();

    // добавляем шаги
    for (let i = 0; i < steps; i++) {
      Gpio.waveAddPulse([
        { gpioOn: this.stepPin, gpioOff: 0, usDelay: pulseDuration },
        { gpioOn: 0, gpioOff: this.stepPin, usDelay: delayDuration }
      ]);
    }

    const waveId = Gpio.waveCreate();
    if (waveId >= 0) {
      Gpio.waveTxSend(waveId, Gpio.WAVE_MODE_ONE_SHOT);
      // ждём завершения воспроизведения волны
      while (Gpio.waveTxBusy()) {
        await new Promise(r => setTimeout(r, 1));
      }
      Gpio.waveDelete(waveId);
    }
  }
}

// === Настройка ===
const motor1 = new StepperMotor(13, 19, 12);
const motor2 = new StepperMotor(24, 18, 4);

(async () => {
  motor1.enableMotor();
  motor2.enableMotor();

  motor1.setDirection(true);  // мотор 1 - по часовой стрелке
  motor2.setDirection(false); // мотор 2 - против часовой стрелки

  console.log('Мотор 1: 200 шагов, быстрее');
  console.log('Мотор 2: 200 шагов, медленнее');
  await Promise.all([
    motor1.stepMotor(200, 1000), // задержка 1000 мкс -> быстрее
    motor2.stepMotor(200, 2000), // задержка 2000 мкс -> медленнее
  ]);

  motor1.disable();
  motor2.disable();
})();
