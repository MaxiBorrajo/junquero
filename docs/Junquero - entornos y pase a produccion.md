# Junquero: entornos y pase a producción

Creado el 10 de noviembre de 2026. Define los tres entornos, cómo se levanta cada uno, cómo se manejan los secretos y qué hay que hacer el día que se pase a producción real (Arbitrum). Es el documento que hay que seguir para ese pase.

## 1. Entornos

| | Local | Dev (nube) | Prod |
| --- | --- | --- | --- |
| Para qué | Programar y probar rápido | Pruebas más reales, APK para conocidos | Usuarios reales |
| Servidor | `wrangler dev --local` en tu compu | Worker `junquero-api` en Cloudflare (el nombre es el histórico) | Worker nuevo `junquero-api-prod` (todavía no existe) |
| Cadena | Sepolia | Sepolia | Arbitrum One |
| Base D1, R2 y chat | Simulados en `backend/.wrangler` | Los actuales de Cloudflare | Nuevos, propios |
| Cron | `scripts/dev.sh` lo dispara cada minuto | Cron de Cloudflare | Cron de Cloudflare |
| Panel de admin | En tu compu (`npm run dev`) apuntando al servidor local o al de dev | Se sirve desde el Worker hoy; conviene sacarlo | No se sirve nunca: se corre en local contra prod |
| Relayer | Clave propia de desarrollo local | Clave propia del Worker | Clave propia, con saldo mínimo |
| Moneda | USDC de prueba (mint abierto) | USDC de prueba | USDC real |

Reglas:
- Cada entorno tiene sus propias bases, archivos y claves. Nunca se comparte una clave de relayer entre dos servidores: se pisan los nonces.
- El servidor local y el de dev leen la misma cadena (Sepolia) con bases distintas. Cada uno indexa por su cuenta.
- La cadena local con anvil se usa solo en las pruebas automáticas de punta a punta (`app/e2e/up.sh`).

## 2. Levantar el entorno local

Una vez por computadora (ver el `README.md` de la raíz para Node, JDK y Android):

1. Secretos: `bash scripts/pull-secrets.sh` (Doppler, sección 3) o copiar `backend/.dev.vars.example` a `backend/.dev.vars` y completarlo. La `RELAYER_KEY` tiene que empezar con `0x`.
2. Servidor: `cd backend && npm run dev`. Aplica las migraciones locales, arranca en `http://localhost:8787` y dispara el cron cada minuto.
3. Panel: `cd admin && npm run dev` (usa `admin/.env.development`, que apunta a `http://localhost:8787`). Para el servidor de la nube de dev: `npm run dev:cloud`. En el servidor tiene que estar `ADMIN_ORIGINS=http://localhost:5173`.
4. App en el emulador: `adb reverse tcp:8787 tcp:8787` y levantar Expo con `EXPO_PUBLIC_API_URL=http://localhost:8787 npx expo start --dev-client --port 8081`. Sin esa variable la app habla con la nube de dev.
5. Un APK que apunte al servidor local desde un celular real necesita la IP de la compu en la red (`EXPO_PUBLIC_API_URL=http://192.168.x.x:8787`) y una compilación de desarrollo, porque las de release no admiten HTTP sin cifrar.

## 3. Secretos

Qué hay que guardar:

| Secreto | Dónde se usa |
| --- | --- |
| `RPC_URL` (Alchemy) | Servidor |
| `RELAYER_KEY` | Servidor, una distinta por entorno |
| `AUTH_SECRET` | Servidor, uno distinto por entorno |
| `ADMIN_ORIGINS` | Servidor (no es secreto, pero cambia por entorno) |
| Claves de `contracts/.env` | Solo para desplegar contratos |

Las claves de MapTiler y Reown de la app son públicas y están en `app/src/config.ts`.

Propuesta: **Doppler** (plan gratuito) como fuente única. Proyecto `junquero` con tres configuraciones: `dev_local`, `dev` y `prod`.
- En cada computadora: instalar la CLI, `doppler login` y `bash scripts/pull-secrets.sh`. Es lo único que hay que repetir.
- Para la nube: la integración de Doppler con Cloudflare Workers sincroniza los secretos de `dev` y `prod` al Worker correspondiente, así que no se cargan a mano con `wrangler secret put`.
- Alternativa sin servicio externo: archivo cifrado con `sops` y `age` dentro del repositorio. Sigue obligando a copiar la clave `age` entre computadoras.
- Cloudflare Secrets Store no sirve para esto: solo alimenta a los Workers desplegados, no al desarrollo local.

Pendiente de Maxi: crear la cuenta y el proyecto en Doppler y cargar los valores. Después de eso, probar `pull-secrets.sh` en la otra computadora.

## 4. Checklist para el pase a producción (Arbitrum)

Hacerlo recién cuando todo ande en dev, con una prueba completa de dos cuentas y la auditoría hecha.

**Contratos**
1. Auditoría de los contratos y de las salvedades de `contracts/SECURITY.md`.
2. Pasar de modo DEMO a modo real en el script de despliegue y revisar los valores iniciales de parámetros (comisión, reserva, jurados, tiempos).
3. Usar el USDC nativo de Arbitrum One, Permit2 y Multicall3 (hoy los de Sepolia). Verificar las direcciones en la documentación oficial de cada uno antes de usarlas; no copiarlas de memoria.
4. Sin `TestToken`: no hay mint abierto.
5. Desplegar con una cuenta de despliegue nueva. Guardar `contracts/deployments/arbitrum.json` y su ABI.
6. Traspasar el control: el administrador único de monedas, parámetros y conexiones pasa a un multisig o a la gobernanza con el Timelock.
7. Cargar la garantía de los jurados con USDC real.

**Servidor**
8. En el código el nombre de la cadena está fijo como `sepolia` en varios archivos (`index.ts`, `relayChain.ts`, `agreementChain.ts`, `taskChain.ts`, `contracts.ts` y `agreements.ts`, que importa `sepolia.json`). Pasarlo a una variable de entorno o a un archivo de despliegue por entorno.
9. Crear con `wrangler` una base D1, un bucket R2 y los Durable Objects nuevos para producción. Agregar un bloque `env.prod` en `backend/wrangler.jsonc` con otro nombre, otros `database_id` y bucket, y sin `assets` para que no sirva el panel.
10. Aplicar las migraciones, cargar los secretos de `prod` (relayer nuevo con saldo mínimo, `AUTH_SECRET` nuevo) y revisar los límites de uso por IP y por cuenta.
11. Proveedor de RPC: plan que alcance para el indexador y el cron. Medir las llamadas antes (ver el plan de optimización del traspaso).
12. Alarmas del cron y del saldo del relayer.

**App**
13. `CHAIN_ID` y la red de `app/src/wallet/appkit.ts` pasan a Arbitrum. `EXPO_PUBLIC_API_URL` apunta al Worker de producción.
14. Nuevo identificador de paquete si hace falta, firma de release con keystore propio y alta en la tienda. Ícono y splash definitivos.
15. Quitar de la interfaz las referencias a "modo demostración" y a USDC de prueba.

**Panel**
16. No se despliega. Se corre en local con `VITE_API_URL` apuntando a producción y `ADMIN_ORIGINS` con el origen local. La cuenta administradora debería ser la del multisig.

**Fuera del código**
17. Registro de marca (INPI), términos y condiciones, política de privacidad y revisión legal de un pago en garantía con dinero real.

## 5. Estado actual

- Local: implementado (`backend/scripts/dev.sh`, `.dev.vars.example`, `scripts/pull-secrets.sh`, `EXPO_PUBLIC_API_URL`, modos del panel).
- Dev (nube): es el Worker actual. Falta decidir si se le saca el panel y agregarle `ADMIN_ORIGINS`.
- Prod: no existe. Seguir la sección 4.
