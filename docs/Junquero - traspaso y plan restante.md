# Junquero: traspaso y plan restante

Escrito el 7 de noviembre de 2026. Está pensado para pegarlo entero al empezar un chat nuevo de Claude. Es autosuficiente: dice qué está hecho, qué falta, qué necesita Claude de Maxi y en qué orden se sigue. Reemplaza al documento `Junquero - traspaso.md`, que quedó desactualizado.

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

Ruta `/home/maxi/Documents/junquero`, rama `dev`, 16 commits por delante de `origin/dev` (`https://github.com/MaxiBorrajo/junquero.git`). **No se hizo push todavía.** El último commit es `7da44ae`. Estructura:
- `contracts/`: proyecto Foundry (Solidity 0.8.28, OpenZeppelin 5.7.0, Permit2). Submódulos en `contracts/lib/`.
- `docs/`: documentos de diseño.
- No existen todavía backend, app ni panel.

Foundry está en `~/.foundry/bin` y no está en el `PATH` de la shell: antes de cualquier comando, `export PATH=$PATH:$HOME/.foundry/bin`.

Comandos habituales (desde `contracts/`): `forge build`, `forge test` (tarda cerca de 1 minuto por las invariantes), `forge fmt --check`, `forge coverage --report summary --no-match-coverage "(test|script|lib)"`. Slither se instaló en un entorno aislado dentro del directorio temporal de la sesión; para repetirlo ver `contracts/SECURITY.md`.

## 3. Contratos: todo está hecho (sin desplegar)

Estado verificado: 754 tests en verde, cobertura 98,8% de líneas y 91,9% de ramas, formato limpio, sin hallazgos nuevos de Slither.

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

## 4. Lo que haré yo (Claude), en orden

### 4.1 Paso 10 de contratos: Sepolia

1. Pruebas con copia (fork) de Sepolia contra Permit2 y USDC reales, no los mocks. Se saltan solas si no hay URL de RPC. Es la única parte del plan de pruebas que no pude ejecutar.
2. Simulación local del script completo con esa copia.
3. Despliegue real (lo ejecuta Maxi, ver sección 5): `Forwarder`, `ParameterRegistry`, `Treasury`, los siete módulos y el router del Escrow, `Credentials`, `Reputation`, `Receipt`, `Arbitration`, `VotingWeight`, `TimelockController` y `ProtocolGovernor`.
4. Verificación del código en Etherscan.
5. Script de comprobación posterior que revisa roles, parámetros, módulos bloqueados y conexiones entre contratos.
6. Prueba de humo en Sepolia: escenario A (individual con comprobante) y B (efectivo) con cuentas de prueba.
7. Carga inicial: moneda de la lista blanca, credenciales nivel 0 de las cuentas de demo, jurados semilla con su stake, fondos de prueba en el tesoro para tarifas de testigo.
8. Archivo `contracts/deployments/sepolia.json` con direcciones, bloques de despliegue y ABI completos (con las firmas de los módulos unidas en una sola interfaz). De ahí leen el indexador, el backend y la app.
9. El traspaso al Timelock (`GOVERNANCE`) se hace al final, después de la demo o cuando Maxi lo decida, no en el primer despliegue.

### 4.2 Backend y app (todavía sin empezar)

Orden propuesto, sin decidir (Maxi decide):

1. **Indexador y API mínima** (Cloudflare Worker con Hono, base D1): lee los eventos del Escrow, `Arbitration`, `Reputation`, `Receipt`, `VotingWeight` y el Governor, y los guarda solo agregando. De ahí salen el listado y el mapa de changas, las líneas de tiempo, las novedades y las métricas. La lista de eventos está en `contracts/src/interfaces/IEscrowEvents.sol`, `IArbitrationEvents.sol` y `IReputation.sol`.
2. **Relayer** (Worker con clave como secreto, poco saldo, límites por cuenta): recibe los mensajes firmados y los envía por el `Forwarder`, con una lista de funciones permitidas. Traslada el gas al usuario como cargo de red al costo (cero en Sepolia).
3. **Robot de tareas que cualquiera puede ejecutar** (cron del Worker): varias acciones las puede lanzar cualquier cuenta y alguien tiene que hacerlo cuando vencen los plazos: `autoRelease`, `autoReleaseMilestone`, `draw`, `finalize`, `execute`, `resolveByDefault`, `refundFunding` y `claimWitnessFee`. Sin este robot las changas y los casos quedan trabados esperando.
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

### 5.1 Para el despliegue en Sepolia (bloquea el paso 10)

1. **URL de RPC de Sepolia**, por ejemplo la de Alchemy (plan gratuito).
2. **Una cuenta con ETH de Sepolia** para pagar el despliegue. **Nunca pasar la clave privada por el chat.** El plan es que Maxi ejecute él mismo el comando final de despliegue en su máquina con la clave en una variable de entorno o en un keystore de Foundry, y que Claude prepare y revise el comando.
3. **Clave de API de Etherscan** para verificar los contratos.
4. **Moneda**: dirección de USDC en Sepolia. Opciones: el USDC oficial de Circle (confirmar la dirección vigente en la documentación de Circle y conseguir fondos en su faucet) o desplegar un token de prueba propio con permiso. Sin dirección no se puede correr el script. USDT no tiene versión oficial en Sepolia; es opcional y se puede omitir.
5. **Administrador inicial** (`FINAL_ADMIN`): la billetera de Maxi u otra. Esa cuenta modera, emite credenciales nivel 0, siembra jurados y resuelve emergencias.
6. **Modo del despliegue**: `DEMO=true` (ventanas de minutos, para mostrar disputas, votaciones y apelaciones en vivo) o tiempos de producción. Recomendado: `DEMO=true` en Sepolia.
7. **Cuentas de prueba para la demo**: dos celulares con MetaMask (solicitante y prestador), tres a cinco jurados semilla, tres o más aportantes para la changa grupal, un testigo y un votante con historial.

### 5.2 Decisiones de producto y de valores

- Confirmar los valores iniciales de la sección 3, en especial los que salieron de los tests y no de los docs: reserva (12 h, 3 días, 2%, tope 10 USDC), costo de jurado (1 USDC), stake de jurado (10 USDC), depósito de voto (5 USDC) y tope de peso (20).
- Decidir la fecha tope para tener Sepolia lista. Si el paso 10 se complica, se publica lo ya probado y el backend arranca en paralelo.
- Confirmar el orden propuesto de la sección 4.2 o cambiarlo.
- Decidir cuándo pasa el control de parámetros al Timelock (variable `GOVERNANCE`): al terminar la demo o en el primer despliegue.
- Mantener o cambiar Arbitrum como red de producción (a revisar antes de salir; para el TP alcanza Sepolia).

### 5.3 Pendientes personales de Maxi (fuera del código)

- Slogan y logo del pájaro (probar a 32 px).
- Verificar el nombre Junquero: estado "NU" del registro en clase 33 de INPI, variantes parecidas, dominio .com.ar, Play Store e Instagram.
- Consultas al profesor: qué pide la entrega (demo, informe, defensa) y si la fecha del 1 de diciembre es entrega o defensa; si la consigna exige identidad con pruebas de conocimiento cero, cambio entre tokens o mezcla de tokens (hoy: lista blanca sin cambio, sin mezcla, sin ZK).
- Validación legal con un profesional (la app se declara intermediaria sin relación laboral).
- Auditoría externa de los contratos antes de usar dinero real; lo hecho hasta ahora no la reemplaza.
- Proveedor del mapa: MapLibre con MapTiler en plan gratuito, que es solo no comercial.
- Contratar o configurar: cuenta de Cloudflare (Workers, D1, R2, Durable Objects), Alchemy, Expo, Reown (WalletConnect), MapTiler, y un servicio de correo para avisos críticos.

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

"Leé `docs/Junquero - traspaso y plan restante.md` y `docs/Junquero - CONTEXT.md`. Los contratos están hechos y probados. Vamos a hacer el paso 10 (Sepolia). Estos son mis datos: RPC de Sepolia, dirección de USDC, administrador inicial, modo DEMO. Prepará y revisá el comando de despliegue; la clave privada la uso yo en mi máquina."
