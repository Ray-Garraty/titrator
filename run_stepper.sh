#!/bin/bash

# Останавливаем pigpiod, если он уже запущен
if pgrep -x "pigpiod" > /dev/null
then
    echo "pigpiod уже работает. Останавливаю..."
    sudo killall pigpiod
    sleep 1
fi

# Запускаем твой Node-скрипт
echo "Запуск stepper2.ts..."
sudo node src/hardware/stepper2.ts
