#!/usr/bin/env python3
import pigpio
import time
import argparse

class StepperMotor:
    def __init__(self, pi, dir_pin, step_pin, enable_pin):
        self.pi = pi
        self.dir_pin = dir_pin
        self.step_pin = step_pin
        self.enable_pin = enable_pin
        self.is_running = True

        self.pi.set_mode(self.dir_pin, pigpio.OUTPUT)
        self.pi.set_mode(self.step_pin, pigpio.OUTPUT)
        self.pi.set_mode(self.enable_pin, pigpio.OUTPUT)
        self.disable()

    def enable(self):
        self.pi.write(self.enable_pin, 1)

    def disable(self):
        self.pi.write(self.enable_pin, 0)

    def set_direction(self, clockwise=True):
        self.pi.write(self.dir_pin, 1 if clockwise else 0)

    def stop(self):
        self.is_running = False
        self.disable()

    def step_by_count(self, steps, freq_hz, chunk_size=2000):
        micros = int(1_000_000 / (2 * freq_hz))
        done = 0
        while done < steps and self.is_running:
            batch = min(chunk_size, steps - done)
            pulses = []
            for _ in range(batch):
                pulses.append(pigpio.pulse(1 << self.step_pin, 0, micros))
                pulses.append(pigpio.pulse(0, 1 << self.step_pin, micros))

            self.pi.wave_clear()
            self.pi.wave_add_generic(pulses)
            wid = self.pi.wave_create()
            if wid >= 0:
                self.pi.wave_send_once(wid)
                while self.pi.wave_tx_busy() and self.is_running:
                    time.sleep(0.001)
                self.pi.wave_delete(wid)

            done += batch

    def step_by_time(self, duration_sec, freq_hz):
        delay = 1.0 / (2 * freq_hz)
        end_time = time.time() + duration_sec
        while time.time() < end_time and self.is_running:
            self.pi.write(self.step_pin, 1)
            time.sleep(delay)
            self.pi.write(self.step_pin, 0)
            time.sleep(delay)

# Callback для концевых датчиков мотора 1
def motor_stop_callback(pin, level, tick):
    if motor.is_running:
        print(f"Сработал датчик на пине GPIO{pin}. Остановка мотора.")
        motor.stop()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir_pin", type=int, required=True, help="Пин направления мотора")
    parser.add_argument("--step_pin", type=int, required=True, help="Пин шагов мотора")
    parser.add_argument("--enable_pin", type=int, required=True, help="Пин включения мотора")
    parser.add_argument("--sensor1_pin", type=int, required=True, help="Пин первого концевого датчика")
    parser.add_argument("--sensor2_pin", type=int, required=True, help="Пин второго концевого датчика")
    parser.add_argument("--steps", type=int, help="Количество шагов")
    parser.add_argument("--time_ms", type=int, help="Время работы в мс")
    parser.add_argument("--freq", type=int, required=True, help="Частота шагов в Гц")
    parser.add_argument("--clockwise", type=int, choices=[0,1], default=1, help="Направление вращения")

    args = parser.parse_args()

    pi = pigpio.pi()
    if not pi.connected:
        exit("Не удалось подключиться к pigpiod")

    # Настраиваем подтяжку для датчиков
    pi.set_pull_up_down(args.sensor1_pin, pigpio.PUD_DOWN)
    pi.set_pull_up_down(args.sensor2_pin, pigpio.PUD_DOWN)

    # Регистрируем callback
    pi.callback(args.sensor1_pin, pigpio.RISING_EDGE, motor_stop_callback)
    pi.callback(args.sensor2_pin, pigpio.RISING_EDGE, motor_stop_callback)

    # Инициализируем мотор
    motor = StepperMotor(pi, args.dir_pin, args.step_pin, args.enable_pin)
    motor.enable()
    motor.set_direction(bool(args.clockwise))

    # Запускаем шаги
    if args.steps is not None:
        motor.step_by_count(args.steps, args.freq)
    elif args.time_ms is not None:
        motor.step_by_time(args.time_ms / 1000.0, args.freq)

    try:
        while motor.is_running:
            time.sleep(0.1)
    except KeyboardInterrupt:
        print("Принудительная остановка")
    finally:
        motor.disable()
        pi.stop()
