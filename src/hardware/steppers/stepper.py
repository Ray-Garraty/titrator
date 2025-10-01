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

        self.pi.set_mode(self.dir_pin, pigpio.OUTPUT)
        self.pi.set_mode(self.step_pin, pigpio.OUTPUT)
        self.pi.set_mode(self.enable_pin, pigpio.OUTPUT)
        self.disable()

    def enable(self):
        self.pi.write(self.enable_pin, 1)  # HIGH = включено

    def disable(self):
        self.pi.write(self.enable_pin, 0)  # LOW = выключено

    def set_direction(self, clockwise=True):
        self.pi.write(self.dir_pin, 1 if clockwise else 0)

    def step_by_count(self, steps, freq_hz):
        """Точный метод: шаги через pigpio wave, делим на безопасные чанки"""
        micros = int(1_000_000 / (2 * freq_hz))  # полупериод
        # Максимум шагов в одном чанке (чтобы не переполнить pigpio)
        max_steps_per_chunk = 2000  
        done = 0
        while done < steps:
            batch = min(max_steps_per_chunk, steps - done)
            pulses = []
            for _ in range(batch):
                pulses.append(pigpio.pulse(1 << self.step_pin, 0, micros))
                pulses.append(pigpio.pulse(0, 1 << self.step_pin, micros))

            self.pi.wave_clear()
            self.pi.wave_add_generic(pulses)
            wid = self.pi.wave_create()
            if wid >= 0:
                self.pi.wave_send_once(wid)
                while self.pi.wave_tx_busy():
                    time.sleep(0.001)
                self.pi.wave_delete(wid)

            done += batch

    def step_by_time(self, duration_sec, freq_hz):
        """Резервный метод: шаги через write+sleep, менее точный"""
        delay = 1.0 / (2 * freq_hz)
        end_time = time.time() + duration_sec
        while time.time() < end_time:
            self.pi.write(self.step_pin, 1)
            time.sleep(delay)
            self.pi.write(self.step_pin, 0)
            time.sleep(delay)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir_pin", type=int, required=True)
    parser.add_argument("--step_pin", type=int, required=True)
    parser.add_argument("--enable_pin", type=int, required=True)
    parser.add_argument("--steps", type=int, help="количество шагов")
    parser.add_argument("--time_ms", type=int, help="время работы в мс")
    parser.add_argument("--freq", type=int, required=True)
    parser.add_argument("--clockwise", type=int, choices=[0,1], default=1)
    args = parser.parse_args()

    pi = pigpio.pi()
    if not pi.connected:
        exit("Не удалось подключиться к pigpiod")

    motor = StepperMotor(pi, args.dir_pin, args.step_pin, args.enable_pin)
    motor.enable()
    motor.set_direction(bool(args.clockwise))

    if args.steps is not None:
        motor.step_by_count(args.steps, args.freq)
    elif args.time_ms is not None:
        motor.step_by_time(args.time_ms / 1000.0, args.freq)
    else:
        print("Ошибка: нужно указать либо --steps, либо --time_ms")

    motor.disable()
    pi.stop()
