import pigpio
import time

class StepperMotor:
    def __init__(self, pi, dir_pin, step_pin, enable_pin):
        self.pi = pi
        self.dir_pin = dir_pin
        self.step_pin = step_pin
        self.enable_pin = enable_pin

        # Настройка GPIO
        self.pi.set_mode(self.dir_pin, pigpio.OUTPUT)
        self.pi.set_mode(self.step_pin, pigpio.OUTPUT)
        self.pi.set_mode(self.enable_pin, pigpio.OUTPUT)

        # По умолчанию — отключить драйвер
        self.disable()

    def enable(self):
        self.pi.write(self.enable_pin, 1)

    def disable(self):
        self.pi.write(self.enable_pin, 0)

    def set_direction(self, clockwise=True):
        self.pi.write(self.dir_pin, 1 if clockwise else 0)

    def step(self, steps, freq_hz):
        """
        steps   — количество шагов
        freq_hz — частота шагов (Гц)
        """
        micros = int(1_000_000 / (2 * freq_hz))  # полупериод
        pulses = []

        for _ in range(steps):
            pulses.append(pigpio.pulse(1<<self.step_pin, 0, micros))
            pulses.append(pigpio.pulse(0, 1<<self.step_pin, micros))

        self.pi.wave_clear()
        self.pi.wave_add_generic(pulses)
        wid = self.pi.wave_create()

        if wid >= 0:
            self.pi.wave_send_once(wid)
            while self.pi.wave_tx_busy():
                time.sleep(0.001)
            self.pi.wave_delete(wid)

# === Использование ===
if __name__ == "__main__":
    pi = pigpio.pi()
    if not pi.connected:
        exit("Не удалось подключиться к pigpiod")

    motor1 = StepperMotor(pi, dir_pin=13, step_pin=19, enable_pin=12)
    motor2 = StepperMotor(pi, dir_pin=24, step_pin=18, enable_pin=4)

    motor1.enable()
    motor2.enable()

    motor1.set_direction(True)
    motor2.set_direction(False)

    print("Motor1 — 200 шагов @ 1000 Гц")
    motor1.step(2000, 1000)

    print("Motor2 — 400 шагов @ 500 Гц")
    motor2.step(2000, 1500)

    motor1.disable()
    motor2.disable()

    pi.stop()
