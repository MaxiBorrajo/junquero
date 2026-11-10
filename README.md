# Junquero

Mercado descentralizado de changas para Argentina. TP de Seminario de Introducción a Blockchain (UNQ). El pago queda en garantía en un contrato inteligente (Sepolia, modo DEMO) hasta que ambas partes confirman; si hay desacuerdo resuelve un jurado de usuarios.

Este README explica cómo dejar una computadora lista para seguir trabajando. Las decisiones de producto y el estado del proyecto están en `docs/` (empezar por `docs/Junquero - traspaso y plan restante.md`).

## Estructura

| Carpeta | Qué es |
| --- | --- |
| `contracts/` | Contratos (Solidity 0.8.28, Foundry), desplegados en Sepolia. Direcciones y ABI en `contracts/deployments/` |
| `backend/` | Cloudflare Worker `junquero-api` (Hono, viem, D1, R2, Durable Object, cron cada minuto) |
| `admin/` | Panel de administración (Vite, React). Lo sirve el mismo Worker |
| `app/` | App móvil (Expo SDK 58, expo-router, wagmi y Reown AppKit, MapLibre) |
| `docs/` | Diseño, decisiones y traspaso |

URL de producción de la API: `https://junquero-api.maximilianoborrajo0-5a6.workers.dev`. La app y los contratos de Sepolia no necesitan nada local para funcionar: la app apunta a esa URL (`app/src/config.ts`).

## Qué instalar (Linux)

| Herramienta | Versión usada | Para qué |
| --- | --- | --- |
| Git | cualquiera | Clonar con submódulos |
| Node.js | 24 (mínimo 20) | App, backend y panel |
| JDK | OpenJDK 21 | Compilar Android con Gradle |
| Android SDK | ver abajo | Compilar la app y correr el emulador |
| Foundry | 1.9.0 (`forge`, `cast`, `anvil`) | Contratos y pruebas de punta a punta |
| Python 3 con Pillow | 3.x | Solo `app/scripts/make-pins.py` (imágenes de los pines) |
| `cloudflared` | opcional | Compartir un APK por un túnel |

No hace falta Docker, Xcode ni cuenta de Expo para desarrollar en Android.

### 1. Clonar

```bash
git clone --recurse-submodules https://github.com/MaxiBorrajo/junquero.git
cd junquero
git checkout dev
```

Si ya clonaste sin submódulos: `git submodule update --init --recursive` (los contratos necesitan `contracts/lib/`).

### 2. Dependencias de Node

```bash
(cd app && npm install)
(cd backend && npm install)
(cd admin && npm install)
```

### 3. Foundry

```bash
curl -L https://foundry.paradigm.xyz | bash
~/.foundry/bin/foundryup
export PATH=$PATH:$HOME/.foundry/bin
```

Para que el `PATH` quede fijo, agregar esa línea de `export` a `~/.bashrc`.

### 4. Android SDK y emulador

Sin Android Studio alcanza con las herramientas de línea de comandos.

1. Bajar "Command line tools" desde developer.android.com/studio y descomprimir en `~/Android/Sdk/cmdline-tools/latest/`.
2. Variables de entorno (agregar a `~/.bashrc`):

```bash
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator
```

3. Instalar los paquetes:

```bash
sdkmanager --licenses
sdkmanager "platform-tools" "emulator" "platforms;android-36" "build-tools;36.0.0" \
  "ndk;27.1.12297006" "cmake;3.22.1" "system-images;android-35;google_apis_playstore;x86_64"
```

4. Crear el emulador (con Play Store, necesario para instalar MetaMask):

```bash
avdmanager create avd -n junquero-play -k "system-images;android-35;google_apis_playstore;x86_64" -d pixel_6
```

Ajustes recomendados en `~/.android/avd/junquero-play.avd/config.ini`: `hw.ramSize = 3072M` (la PC original usa 1536M, justo), `disk.dataPartition.size = 6G`, pantalla 1080x2400 con densidad 420.

5. Aceleración por hardware: el usuario tiene que estar en el grupo `kvm` (`sudo usermod -aG kvm $USER` y reiniciar sesión) y la virtualización activa en la BIOS. Comprobar con `ls -l /dev/kvm`.

6. Levantar el emulador. **Usar siempre `-gpu host`**: con `swiftshader` el mapa pierde todos los textos.

```bash
emulator -avd junquero-play -gpu host
```

7. Crear `app/android/local.properties` si no existe (lo genera Gradle, pero por las dudas): `sdk.dir=/home/<usuario>/Android/Sdk`.

### 5. Cuentas y claves

No hay `.env` que cargar para la app: las claves públicas de MapTiler y Reown están en `app/src/config.ts` y se usan desde ahí. Para el resto:

- **MetaMask** en el emulador (o en el celular): instalarla desde Play Store, crear una cuenta de prueba y agregar la red Sepolia. Conseguir ETH de Sepolia de un grifo si se va a pagar gas propio; el relayer del sistema paga el de las operaciones normales. El USDC de prueba se acuña desde la app (mint abierto).
- **Panel de admin**: se ingresa con MetaMask usando la cuenta `admin` (`0x4E5e…6511`). Su clave vive en un keystore de Foundry en la computadora de Maxi (`~/.foundry/keystores`); copiarla a otra máquina es decisión de Maxi y nunca por chat ni por el repositorio.
- **Cloudflare**: para desplegar, `npx wrangler login` dentro de `backend/` con la cuenta de Maxi.
- **Secretos del Worker** (ya cargados en producción, no hay que repetirlos): `RPC_URL` (Alchemy), `RELAYER_KEY`, `AUTH_SECRET`. Para correr el Worker en local con la cadena real hace falta `backend/.dev.vars` con esas tres variables (el archivo está ignorado por git).
- **Contratos**: `contracts/.env` (ignorado por git), plantilla en `contracts/.env.example`. Solo se necesita para volver a desplegar o correr scripts contra Sepolia.

## Correr la app en el emulador

Con el emulador ya levantado:

```bash
cd app
npx expo start --dev-client --port 8081
```

En otra terminal:

```bash
adb reverse tcp:8081 tcp:8081
adb shell am start -a android.intent.action.VIEW -d "exp+junquero://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
```

La primera vez hay que compilar e instalar la app de desarrollo (tarda varios minutos; el cliente de desarrollo trae código nativo, por eso no sirve Expo Go):

```bash
cd app
npx expo prebuild --platform android   # solo si no existe app/android (está en .gitignore, se genera)
cd android
./gradlew :app:installDebug -PreactNativeArchitectures=x86_64 --max-workers=2
```

Notas de entorno:
- `app/android/` es generado y no está en el repositorio. En una máquina nueva hay que correr `npx expo prebuild` primero. Después de prebuild, poner en `app/android/gradle.properties` esta línea para evitar un fallo de OpenJDK 21 y quedarse sin memoria: `org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=768m -XX:TieredStopAtLevel=1 -XX:ReservedCodeCacheSize=512m -XX:+UseParallelGC`.
- Recargar la app desde la terminal: `adb shell input text "rr"` (doble R).
- Capturas: `adb exec-out screencap -p > captura.png`.
- Si `tsc` se cae por memoria: `NODE_OPTIONS=--max-old-space-size=4096`.
- No usar el `RefreshControl` nativo de React Native: deja las pantallas en blanco con esta versión. Se usa el gesto propio de `src/lib/usePullGesture.ts`.

### APK para un celular real

```bash
cd app/android
./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a \
  -x lintVitalRelease -x lintVitalAnalyzeRelease -x lintVitalReportRelease --max-workers=2
```

El APK queda en `app/android/app/build/outputs/apk/release/`. Para pasarlo al celular: cable con `adb install`, o un túnel (`cloudflared tunnel --url http://localhost:8000` sirviendo la carpeta con `python3 -m http.server 8000`). El celular necesita permitir instalar apps de orígenes desconocidos. Hay perfiles de EAS en `app/eas.json`, pero no hay cuenta de Expo en uso.

## Pruebas

```bash
cd app && npm test            # 160 pruebas
cd app && npm run typecheck
cd backend && npm test        # 210 pruebas
cd backend && npm run typecheck
cd admin && npm test
cd contracts && forge test    # cerca de 1 minuto por las invariantes
```

### Pruebas de punta a punta

Corren el flujo real contra una cadena local (anvil) y el servidor local, con el mismo código de la app. No tocan producción ni el repositorio (trabajan en `/tmp/junquero-e2e`).

```bash
cd app
bash e2e/up.sh
cd /tmp/junquero-e2e/repo/app && npx vitest run --config vitest.e2e.config.ts
```

`up.sh` necesita Foundry y acceso a internet (copia Multicall3 desde Sepolia una vez). Son 19 pruebas: individual con aprobación remota, hitos, grupal y reclamo con jurado. Detalle en `app/e2e/README.md`.

## Backend

Desde `backend/`:

```bash
npm run typecheck
npm test
npx wrangler d1 migrations apply junquero --remote   # aplicar migraciones nuevas (la última es la 0016)
npm run deploy                                        # compila el panel de admin y despliega el Worker
```

Si `migrations apply --remote` da el error 7403, reintentar: a veces funciona a la segunda. Referencia de endpoints en `backend/README.md`.

Para desarrollar el panel con recarga: `cd admin && npm run dev`.

## Contratos

Desde `contracts/` (con Foundry en el `PATH`):

```bash
forge build
forge test
forge fmt --check
```

Despliegue y scripts de Sepolia: `contracts/README.md` y `contracts/SECURITY.md`. Las direcciones vigentes están en `contracts/deployments/sepolia.json`.

## Seguridad

- Las claves privadas no se escriben en el repositorio ni se pasan por chat. Los scripts que firman usan keystores de Foundry.
- `contracts/.env` y `backend/.dev.vars` están ignorados por git.
- Las claves de MapTiler (plan gratuito, solo no comercial) y de Reown en `app/src/config.ts` son de uso público desde el cliente.

## Problemas conocidos del entorno

- Emulador sin textos en el mapa: está corriendo con `-gpu swiftshader`; usar `-gpu host`.
- Gradle sin memoria o con un fallo de JIT: revisar los `org.gradle.jvmargs` de arriba.
- Pantallas en blanco al tirar para actualizar: alguien volvió a usar `RefreshControl`.
- El indexador del Worker lee de a 10 bloques porque el plan gratuito de Alchemy limita `eth_getLogs`.
