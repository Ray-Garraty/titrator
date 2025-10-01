import { Gpio } from "pigpio";

class StepperMotor {
  private dir: Gpio;

  private step: Gpio;

  private enable: Gpio;

  constructor(dirPin: number, stepPin: number, enablePin: number) {
    this.dir = new Gpio(dirPin, { mode: Gpio.OUTPUT });
    this.step = new Gpio(stepPin, { mode: Gpio.OUTPUT });
    this.enable = new Gpio(enablePin, { mode: Gpio.OUTPUT });

    this.disable(); // по умолчанию драйвер выключен
  }

  enableMotor() {
    this.enable.digitalWrite(1);
  }

  disable() {
    this.enable.digitalWrite(0);
  }

  setDirection(clockwise: boolean) {
    this.dir.digitalWrite(clockwise ? 1 : 0);
  }

  async stepMotor(steps: number, delayMicros: number) {
    for (let i = 0; i < steps; i += 1) {
      // формируем корректный STEP-пульс
      this.step.trigger(10, 1); // 10 мкс HIGH-импульс
      await this.sleepMicros(delayMicros);
    }
  }

  private async sleepMicros(micros: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, micros / 1000));
  }
}

// === Настройка ===
const motor1 = new StepperMotor(13, 19, 12);
const motor2 = new StepperMotor(24, 18, 4);

(async () => {
  motor1.enableMotor();
  motor2.enableMotor();

  motor1.setDirection(true); // мотор 1 - по часовой стрелке
  motor2.setDirection(true); // мотор 2 - против часовой стрелки

  const motor1Speed = 1000; // задержка в мкс для мотора 1 (меньше - быстрее)
  const motor2Speed = 2000; // задержка в мкс для мотора 2 (больше - медленнее)

  console.log("Мотор 1: 200 шагов, скорость: быстрее");
  console.log("Мотор 2: 200 шагов, скорость: медленнее");
  await Promise.all([
    motor1.stepMotor(2000, motor1Speed), // мотор 1 будет быстрее
    motor2.stepMotor(2000, motor2Speed), // мотор 2 будет медленнее
  ]);

  motor1.disable();
  motor2.disable();
})();
