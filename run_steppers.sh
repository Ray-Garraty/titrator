#!/bin/bash

# Останавливаем pigpiod, если он уже запущен
if pgrep -x "pigpiod" > /dev/null
then
    echo "pigpiod уже работает. Останавливаю..."
    sudo killall pigpiod
    sleep 1
fi

# Запускаем твой Node-скрипт
echo "Запуск steppers.ts..."
sudo node src/hardware/steppers.ts
