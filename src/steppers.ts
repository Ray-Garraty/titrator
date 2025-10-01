import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fileName = fileURLToPath(import.meta.url);
const dirName = path.dirname(fileName);

const scriptPath = `${dirName}/hardware/steppers/stepper.py`;

interface MotorOptions {
  dirPin: number;
  stepPin: number;
  enablePin: number;
  freq: number;
  clockwise?: boolean;
  steps: number;
}

async function runMotor(opts: MotorOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      scriptPath,
      "--dir_pin",
      opts.dirPin.toString(),
      "--step_pin",
      opts.stepPin.toString(),
      "--enable_pin",
      opts.enablePin.toString(),
      "--steps",
      opts.steps.toString(),
      "--freq",
      opts.freq.toString(),
      "--clockwise",
      (opts.clockwise ? 1 : 0).toString(),
    ];

    const child = spawn("python3", args, { stdio: "inherit" });

    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Motor process exited with code ${code}`));
    });
  });
}

// Пример использования
(async () => {
  try {
    await runMotor({
      dirPin: 13,
      stepPin: 19,
      enablePin: 12,
      freq: 1000,
      steps: 2000,
      clockwise: true,
    });
    console.log("Мотор завершил работу");
  } catch (err) {
    console.error("Ошибка:", err);
  }
})();
