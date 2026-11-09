# Junquero: traspaso y plan restante

Escrito el 7 de noviembre de 2026 y actualizado el 8 de noviembre con el despliegue en Sepolia y el backend. Está pensado para pegarlo entero al empezar un chat nuevo de Claude. Es autosuficiente: dice qué está hecho, qué falta, qué necesita Claude de Maxi y en qué orden se sigue. Reemplaza al documento `Junquero - traspaso.md`, que quedó desactualizado.

Orden de lectura si hace falta más detalle: `docs/Junquero - CONTEXT.md` (decisiones de producto), `docs/Junquero - especificacion de contratos y pruebas.md` (diseño y avance de los contratos), `contracts/SECURITY.md` (análisis y limitaciones), `docs/Junquero - diseno de pantallas.md` (pantallas) y `docs/Junquero - stack y costos.md` (infraestructura).

## 1. Proyecto y reglas de trabajo

Junquero es un marketplace descentralizado de changas para Argentina, TP de la UNQ (Seminario de Introducción a Blockchain). Entrega: 1 de diciembre de 2026; no se sabe si es entrega o defensa y se consulta al profesor. Al escribir esto faltan 24 días.

Reglas de trabajo con Maxi:
- Maxi decide qué se hace y qué no. No cerrar decisiones sin su confirmación.
- Respuestas directas, sin relleno, sin emojis, tono profesional. Maxi pidió explicaciones en lenguaje simple cuando algo salió muy técnico: explicar primero el efecto y dejar el detalle técnico para después.
- Código sin comentarios, limpio, modular, sin repeticiones, con casos borde considerados.
- Nivel avanzado en backend: no explicar conceptos básicos.
- Los docs y los textos de la app están en español (es-AR con voseo en la app).
- Los commits terminan con la línea `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Maxi quiso terminar y probar todos los contratos, publicarlos en Sepolia y recién después construir backend, app y panel.

## 2. Estado del repositorio

Ruta `/home/maxi/Documents/junquero`, rama `dev`, remoto `https://github.com/MaxiBorrajo/junquero.git`. Maxi ya hizo push; después de eso se agregaron commits del relayer, el robot de tareas y las optimizaciones (se suben cuando Maxi lo pide). Estructura:
- `contracts/`: proyecto Foundry (Solidity 0.8.28, OpenZeppelin 5.7.0, Permit2). Submódulos en `contracts/lib/`. `contracts/deployments/sepolia.json` y `contracts/deployments/abi/` son el registro del despliegue; `contracts/.env` (ignorado por git) guarda los secretos y `contracts/.env.example` es la plantilla.
- `backend/`: Cloudflare Worker `junquero-api` (ver sección 3.1).
- `docs/`: documentos de diseño.
- No existen todavía la app ni el panel.

Foundry está en `~/.foundry/bin` y no está en el `PATH` de la shell: antes de cualquier comando, `export PATH=$PATH:$HOME/.foundry/bin`.

Comandos habituales (desde `contracts/`): `forge build`, `forge test` (tarda cerca de 1 minuto por las invariantes), `forge fmt --check`, `forge coverage --report summary --no-match-coverage "(test|script|lib)"`. Slither se instaló en un entorno aislado dentro del directorio temporal de la sesión; para repetirlo ver `contracts/SECURITY.md`.

## 3. Contratos: hechos, probados y desplegados en Sepolia

Estado verificado: 758 tests en verde (754 más 4 del token de prueba), cobertura 98,8% de líneas y 91,9% de ramas, formato limpio, sin hallazgos nuevos de Slither. Desplegados en Sepolia el 8 de noviembre de 2026 en modo `DEMO` (ventanas de minutos; la liberación automática sigue en 24 h y 72 h), con 104 transacciones y 0 fallos. Direcciones, bloques de despliegue y ABI en `contracts/deployments/`. El control de parámetros ya pasó al Timelock: desde ahora cambiar un parámetro o agregar una moneda requiere una votación.

Cuentas: `deployer` (`0x2105…8560`, ya sin roles) y `admin` (`0x4E5e…6511`, modera, emite credenciales, siembra jurados y resuelve emergencias). Las cuentas de demo (solicitante, prestador, cinco jurados, tres aportantes y un testigo) están en `demoAccounts` de `sepolia.json`, con credencial nivel 0, jurados semilla y fondos de prueba. Las claves se guardan en keystores de Foundry de la máquina de Maxi y nunca se pasan por el chat.

Moneda en Sepolia: `TestUSDC` (6 decimales, con permit, `mint` abierto con tope de 100.000 por llamada). En producción se pensó USDC (permit), USDT y DAI (Permit2, DAI con 18 decimales), sin moneda en pesos. Pendiente: agregar tokens de prueba USDT y DAI en Sepolia.

Scripts en `contracts/script/`: `Deploy.s.sol`, `Verify.s.sol` (70 comprobaciones de conexiones, roles, parámetros y módulos bloqueados), `Seed.s.sol` (credenciales, jurados semilla y fondos), `Smoke.s.sol` (escenarios A y B en la red, ya ejecutados con éxito), `Handover.s.sol` (traspaso al Timelock) y `RelayPayload.s.sol` (firma un pedido para probar el relayer).

| Contrato | Función |
| --- | --- |
| `Escrow` (router de 3,9 KB) y módulos `OrderModule`, `CancelModule`, `AdminModule`, `DisputeModule`, `MilestoneModule`, `GroupModule`, `WitnessModule` | Una sola dirección y una sola caja de datos; la lógica vive en módulos por `delegatecall` porque el Escrow superó el límite de 24 KB. Módulos fijos tras `lockModules()` |
| `ParameterRegistry` | Parámetros con mínimo y máximo; solo el Timelock los cambia tras el traspaso |
| `Treasury` | Recibe comisiones; el Escrow puede retirar solo por la tarifa del testigo |
| `Forwarder` | `ERC2771Forwarder` para que el relayer pague el gas |
| `Credentials` | Nivel de cuenta como credencial intransferible (ERC-5192); en el TP solo nivel 0 |
| `Reputation` | Historial por persona y por rol; lo actualizan el Escrow y `Arbitration` |
| `Receipt` | Comprobante intransferible de changa cerrada, que reclama el prestador |
| `Arbitration` | Jurados con stake, sorteo por compromiso y revelación, votos cifrados, castigos, una apelación, árbitro de emergencia. Ocupa 23,0 de 24,5 KB: cualquier función nueva obliga a partirlo |
| `VotingWeight`, `ProtocolGovernor`, `TimelockController` | Votación por actividad con reloj por tiempo, y traspaso de control |

Reglas implementadas (todas con parámetros votables dentro de límites): changa individual, en efectivo, a distancia (hasta 2 pedidos de cambios), por hitos (anticipo como primer hito, término anticipado, abandono con reapertura, disputa por hito), grupal (aportes de 5% a 50%, devolución proporcional, veto de prestador, cambio de coordinador, objeción), reserva del prestador con compensación creciente, cancelaciones escalonadas, check-in y no presentación, testigo en changas de más de 300 USDC, disputa chica 50/50, disputa con jurado de 3 o 5, apelación con 2N+1 jurados, moderación del administrador, pagos reclamables si una cuenta está bloqueada por la moneda.

Pruebas disponibles: unitarias por función, fuzz, invariantes con secuencias aleatorias (`test/invariants/`), escenarios A a F de punta a punta sobre el despliegue real (`test/Scenarios.t.sol`) y vectores de firma para la app (`contracts/vectors/signatures.json`, con `README.md`).

Script de despliegue: `contracts/script/Deploy.s.sol` (usa `script/lib/EscrowAssembly.sol`). Variables de entorno que lee: `USDC` (obligatoria, es también la moneda de stake de jurados y del depósito de voto), `USDT` (opcional), `PERMIT2` (por defecto la dirección canónica), `FINAL_ADMIN` (dirección que recibe los roles operativos), `GOVERNANCE=true` (traspasa el control de parámetros al Timelock) y `DEMO=true` (ventanas de minutos en vez de horas y días).

Valores iniciales cargados por el script (a confirmar por Maxi, ver sección 5): comisión 0% (máximo 2%); efectivo 1 USDC más 2%; reserva con gracia de 12 h, crecimiento de 3 días, máximo 2% y tope de 10 USDC; cancelación tras acordar 10% (80% al prestador); no presentación 10% con espera de 20 minutos; 2 cancelaciones gratis por mes por cuenta y 1 por pareja; tamaños chica hasta 20 USDC, media hasta 300; hitos obligatorios sobre 150 USDC o más de 5 días; anticipo hasta 30% con 5 changas cerradas sin disputa; liberación automática a las 24 h (72 h por hito); costo de jurado 1 USDC por jurado; stake de jurado 10 USDC; respuesta a reclamo 72 h; ventanas del jurado 24 h, 6 h, 24 h y 24 h; apelación 24 h; voto con depósito de 5 USDC y tope de peso 20; Governor con 1 día de espera, 5 de votación, quórum 10% y Timelock de 2 días.

### 3.1 Backend desplegado

Worker `junquero-api` en `https://junquero-api.maximilianoborrajo0-5a6.workers.dev` (Cloudflare, plan gratuito, URLs de vista previa desactivadas), código en `backend/`, con Hono, viem, base D1 `junquero` y Alchemy como RPC (secreto `RPC_URL`). Un cron cada minuto ejecuta el indexador y el robot de tareas.

- **Indexador**: guarda cada evento de los contratos en la tabla `events` (clave `(block_number, log_index)`, sin rowid). El plan gratuito de Alchemy limita `eth_getLogs` a 10 bloques, por eso `BLOCK_CHUNK=10` y `CHUNKS_PER_RUN=6`. Lee con 2 confirmaciones.
- **API pública**: `GET /health`, `GET /events` (filtros `contract`, `name`, `beforeBlock`, `limit` hasta 200) y `GET /orders/:id/timeline`. Límite de 120 pedidos por minuto por IP y caché de 10 segundos en memoria.
- **Relayer**: `POST /relay` recibe un pedido firmado para el Forwarder y lo envía pagando el gas. Acepta solo `escrow`, `arbitration`, `receipt` y `governor`, solo funciones que existen en el contrato, sin valor, con tope de 3 millones de gas y vencimiento de al menos 60 segundos. Estima antes de enviar, limita a 30 pedidos por hora por cuenta y 10 por minuto por IP. La clave es el secreto `RELAYER_KEY` de una cuenta dedicada (`0xD68b…8a0E`) con poco saldo. Probado de punta a punta: la orden 3 la creó el solicitante sin gastar ETH.
- **Robot de tareas**: vigila órdenes y casos, y manda `autoRelease`, `autoReleaseMilestone`, `reclaim`, `refundFunding`, `resolveByDefault`, `draw`, `finalize` y `execute` cuando corresponde, desde la misma cuenta del relayer. Es dirigido por eventos y duerme hasta la hora exacta que informa el contrato en el error de cada acción. Máximo 5 envíos por minuto. No cubre `claimWitnessFee` (lo reclama el testigo por el relayer) ni los empates que requieren al árbitro de emergencia. Todavía no se probó con una disputa o entrega vencida reales.
- **Sesión y datos fuera de la cadena**: login con firma de la billetera (`POST /auth/login`, token de 7 días), perfiles (`/me/profile`, `/profiles/:address`) fichas de changas (`POST /me/changas`, `GET /changas`) y postulaciones (`PUT /me/applications/:changaId`, lista para quien publicó). La ficha se guarda con su hash, que va en `createOrder`; la changa aparece en el mapa cuando el indexador ve la orden. Solo se guarda una zona aproximada, nunca la dirección exacta. Referencia completa en `backend/README.md`. Archivos y selfie: subida a R2 verificada por SHA-256 (`PUT /me/files`, `PUT /me/selfie`) y revisión de selfies por el administrador (`/admin/selfies`); al resolver se borra la imagen y queda solo el estado. Falta cargar el secreto `AUTH_SECRET`.
- **Tablas**: `events`, `sync_state`, `meta`, `watched`, `task_log`, `relay_log`, `profiles`, `changas`, `applications`; migraciones en `backend/migrations/`. Se purgan los registros de más de 30 días todos los días a las 03:00 UTC.
- **Costo**: hoy cero. Hay que mirar en unos días el CPU por ejecución en el panel de Cloudflare y el consumo en el panel de Alchemy. Si el consumo de Alchemy aprieta, el indexador puede pasar a correr cada 2 minutos.
- Pruebas: 108 con Vitest y una D1 simulada sobre `node:sqlite` (`npm test` en `backend/`).

Pendientes del backend: evidencia privada cifrada, chat cifrado y notificaciones; R2 ya está activo (bucket `junquero`); la clave de Alchemy se mostró en una captura y Maxi decidió no rotarla por ahora.

## 4. Lo que haré yo (Claude), en orden

### 4.1 Paso 10 de contratos: Sepolia (hecho, salvo lo marcado)

Hecho: despliegue, comprobación posterior, carga inicial, prueba de humo de los escenarios A y B, traspaso al Timelock y `sepolia.json` con los ABI. Pendiente:
1. Pruebas con copia (fork) de Sepolia contra Permit2 y USDC reales de Circle, no los mocks. No bloquea la demo.
2. Verificación del código en Etherscan: Maxi decidió no hacerla por ahora.
3. Stake de 10 USDC de los jurados semilla: se hace desde la app o con los keystores antes de probar una disputa.
4. Tokens de prueba USDT y DAI en Sepolia, para probar Permit2 y los 18 decimales.

### 4.2 Backend y app

Orden propuesto, sin decidir (Maxi decide). Los puntos 1 a 3 están hechos, ver sección 3.1:

1. **Indexador y API mínima**: hecho.
2. **Relayer**: hecho.
3. **Robot de tareas**: hecho (falta probarlo con un caso vencido real).
4. **App React Native con Expo (Android primero)**: registro con MetaMask por WalletConnect (Reown, viem, wagmi) y perfil con selfie en vivo; mapa con MapLibre y MapTiler; publicar en cinco pantallas con adjuntos; postulación, chat y acuerdo con las dos firmas; hacer y cerrar la changa (check-in, evidencia, QR); reclamo y jurado; perfil, reputación y votación. Textos en archivos de traducción, voseo, sin términos de blockchain. Marca y tipografía en `docs/Junquero - marca.md`. Las firmas se comprueban contra los vectores de `contracts/vectors/`.
5. **Pruebas y evidencia en R2** con URLs firmadas, cifrado en el cliente, cola sin conexión.
6. **Chat cifrado propio** (libsodium sobre Durable Objects) y **notificaciones push** con Expo. Los jurados necesitan avisos críticos (también por correo) porque deben actuar en cada fase: comprometer el sorteo, revelarlo, votar, revelar el voto.
7. **Panel de administración web**: lectura del indexador, novedades, tesoro, relayer, verificación de selfies, moderación, explorador de changas y métricas.
8. **Interfaz de gobernanza** (votar y ver propuestas) y, si hay tiempo, panel del tesoro.

Alcance del TP: 37 de 40 funciones; quedan fuera historial y nivel 1, nivel 2 con documento y capas contra changas falsas. Escenarios de demo: A individual, B efectivo, C disputa con jurado, D cancelación escalonada, E grupal, F votar un parámetro, H panel e I chat y notificaciones. El G no entra. Tope de costo de infraestructura: 20 USD por mes.

### 4.3 Documentos a actualizar cuando se llegue a la app

- `docs/Junquero - diseno de pantallas.md`: faltan las pantallas de reserva del prestador, propuesta y veto del prestador en grupal, cambio de coordinador, objeción, testigo (asignar y atestar), apelación y la cola de tareas del jurado.
- `docs/Junquero - idea cerrada.md` es la versión vieja del funcional: no usarla.
- `docs/Junquero - confianza y economia.md`: recalcular la tabla de sostenibilidad, que usa supuestos viejos.

## 5. Lo que necesito de Maxi

### 5.1 Despliegue en Sepolia (resuelto)

Resuelto el 8 de noviembre: RPC de Alchemy para todo (el público de publicnode falló), cuentas `deployer` y `admin` creadas por Maxi con keystores de Foundry, moneda `TestUSDC` propia, `FINAL_ADMIN` igual a `admin`, modo `DEMO=true`, cuentas de demo creadas y cargadas. La clave de Etherscan no se usó: Maxi decidió no verificar el código por ahora. **Nunca pasar claves privadas por el chat**: Maxi ejecuta los comandos que firman, con keystores.

Lo que Claude necesita de Maxi para lo que sigue:
1. **Perfiles y changas fuera de la cadena**: decidir qué datos van en D1 y cuáles esperan a R2 (que pide tarjeta).
2. **Cuentas para la app**: Expo, Reown (WalletConnect) y MapTiler, creadas por Maxi.
3. **Tokens de prueba USDT y DAI**: confirmar cuándo agregarlos.

### 5.2 Decisiones de producto y de valores

- Confirmar los valores iniciales de la sección 3, en especial los que salieron de los tests y no de los docs: reserva (12 h, 3 días, 2%, tope 10 USDC), costo de jurado (1 USDC), stake de jurado (10 USDC), depósito de voto (5 USDC) y tope de peso (20).
- Decidir la fecha tope para tener Sepolia lista. Si el paso 10 se complica, se publica lo ya probado y el backend arranca en paralelo.
- Confirmar el orden propuesto de la sección 4.2 o cambiarlo.
- El control de parámetros ya pasó al Timelock en Sepolia. Cambiar un parámetro o agregar una moneda requiere votar, con ventanas de minutos por el modo `DEMO`.
- Mantener o cambiar Arbitrum como red de producción (a revisar antes de salir; para el TP alcanza Sepolia).

### 5.3 Pendientes personales de Maxi (fuera del código)

- Slogan y logo del pájaro (probar a 32 px).
- Verificar el nombre Junquero: estado "NU" del registro en clase 33 de INPI, variantes parecidas, dominio .com.ar, Play Store e Instagram.
- Consultas al profesor: qué pide la entrega (demo, informe, defensa) y si la fecha del 1 de diciembre es entrega o defensa; si la consigna exige identidad con pruebas de conocimiento cero, cambio entre tokens o mezcla de tokens (hoy: lista blanca sin cambio, sin mezcla, sin ZK).
- Validación legal con un profesional (la app se declara intermediaria sin relación laboral).
- Auditoría externa de los contratos antes de usar dinero real; lo hecho hasta ahora no la reemplaza.
- Proveedor del mapa: MapLibre con MapTiler en plan gratuito, que es solo no comercial.
- Contratar o configurar: ya están Cloudflare (Workers y D1; con tarjeta cargada y alerta de presupuesto de 10 USD) y Alchemy. Faltan R2 y Durable Objects (Cloudflare), Expo, Reown (WalletConnect), MapTiler y un servicio de correo para avisos críticos.

## 6. Limitaciones conocidas de los contratos

Detalle completo en `contracts/SECURITY.md`. Las que más importan:
1. El azar del jurado se puede sesgar si un candidato elige no revelar; un oráculo de azar (VRF) lo resolvería y queda para producción.
2. El costo del arbitraje o de la apelación lo adelanta quien reclama; si gana pero quien perdió no tiene dinero en el Escrow, termina pagándolo.
3. El anticipo no tiene recuperación on-chain.
4. Mientras no se traspase el control, un solo administrador configura monedas, parámetros y conexiones.
5. El contrato de arbitraje casi llena el límite de tamaño.
6. No es una auditoría externa.

## 7. Cosas que conviene saber antes de tocar el código

- Las funciones del Escrow son una sola interfaz (`IEscrow`, más `IEscrowFull` con roles y getters) aunque vivan en siete módulos; la app y el indexador hablan con una sola dirección. Los errores y eventos se declaran en `IEscrowEvents`, no en `IEscrow`.
- `Receipt` choca de nombre con un tipo de forge-std; en los tests y el script se importa con alias (`Receipt as JunqueroReceipt`).
- En los tests, cualquier llamada auxiliar entre `vm.prank` o `vm.expectRevert` y la llamada real consume el cheatcode: calcular firmas, hashes y roles antes. Es la causa de casi todos los fallos propios de las pruebas.
- El tamaño de los contratos importa: el Escrow se parte en módulos y `Arbitration` está a 1,5 KB del límite.
- `forge clean` y Slither borran `out/`; es normal.
- Las pruebas de invariantes tardan cerca de 1 minuto y el resultado de `afterInvariant` imprime el estado de la última corrida con `-vv`.

## 8. Primer mensaje sugerido para el chat nuevo

"Leé `docs/Junquero - traspaso y plan restante.md` y `docs/Junquero - CONTEXT.md`. Los contratos están desplegados en Sepolia (`contracts/deployments/sepolia.json`) y el Worker con indexador, relayer y robot de tareas está en Cloudflare (`backend/`). Seguimos con perfiles y changas fuera de la cadena, el chat cifrado y la app. Las claves privadas no se pasan por el chat: las uso yo en mi máquina con keystores."
