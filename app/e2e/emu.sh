#!/usr/bin/env bash
# Levanta un emulador con el renderer que muestra bien el mapa (ANGLE).
# Uso: bash app/e2e/emu.sh <avd> [puerto]   p. ej. junquero 5554, junquero-play 5556
# (hw.gpu.mode=angle_indirect en el config.ini del AVD NO funciona: el emulador lo ignora.)
AVD=${1:-junquero}; PORT=${2:-5554}
setsid nohup ~/Android/Sdk/emulator/emulator -avd "$AVD" -port "$PORT" -gpu angle_indirect -no-audio -no-boot-anim -no-snapshot-save >/dev/null 2>&1 </dev/null &
until [ "$(adb -s emulator-$PORT shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do sleep 3; done
adb -s emulator-$PORT reverse tcp:8081 tcp:8081
adb -s emulator-$PORT shell settings put secure show_ime_with_hard_keyboard 0
adb -s emulator-$PORT shell am start -a android.intent.action.VIEW -d "exp+junquero://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081" >/dev/null
echo "emulator-$PORT listo"
