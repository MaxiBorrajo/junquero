# Junquero: traspaso a otro chat

Escrito el 4 de noviembre de 2026. Está pensado para pegarlo entero al empezar un chat nuevo. Reúne el contexto del proyecto, el estado real del código verificado ese día, lo que falta y el orden recomendado para seguir.

Orden de lectura si hace falta más detalle: `docs/Junquero - CONTEXT.md` (decisiones), `docs/Junquero - documento funcional.md` (funcional actualizado), y el resto de `docs/` solo para el tema puntual.

## 1. Qué es el proyecto

Junquero es un marketplace descentralizado de changas y trabajos puntuales para Argentina. Es un TP universitario de la UNQ (Seminario de Introducción a Blockchain). Entrega: 1 de diciembre de 2026; no se sabe si es entrega o defensa y se consulta con el profesor.

- Quien necesita algo publica una changa en un mapa y deposita el pago en un contrato de escrow.
- Quien busca trabajo ve las changas cercanas, se postula y chatea.
- Al acordar, las dos partes firman un acuerdo (EIP-712).
- Al terminar, el prestador sube evidencia y quien contrató libera el pago firmando un QR que el prestador escanea.
- Si hay desacuerdo, resuelve un jurado de usuarios con voto cifrado (commit-reveal).
- La plataforma es intermediaria: no emplea ni custodia dinero. El contrato custodia los fondos.
- Existen changas a distancia: sin pin en el mapa, sin check-in, sin QR, evidencia como entregables con hash, hasta 2 pedidos de cambios.

Nombre público: Junquero (pájaro *Phleocryptes melanops*). Nombre interno de repo, paquetes y contratos: `junquero`.

## 2. Reglas de trabajo con Maxi

- Maxi decide qué se hace y qué no. No cerrar decisiones sin su confirmación.
- Respuestas directas, sin relleno, sin emojis, tono profesional.
- Código sin comentarios, limpio, modular, sin repeticiones, con casos borde considerados.
- Nivel avanzado en backend: no explicar conceptos básicos.
- Su stack habitual es NestJS/TypeScript, pero este proyecto usa el stack de la sección 3.
- Idioma de la app: es-AR con voseo, todo el texto en archivos de traducción.
- Los docs están en español.

## 3. Stack decidido

| Capa | Decisión |
| --- | --- |
| Red | Sepolia para pruebas y desarrollo; Arbitrum en producción, a revisar antes de salir |
| Contratos | Solidity 0.8.28 con OpenZeppelin v5.7.0, Foundry, EVM cancun |
| App | React Native con Expo, Android primero |
| Billetera | MetaMask por WalletConnect (SDK de Reown), viem y wagmi |
| Backend | Cloudflare Workers con Hono, Durable Objects (chat), D1 |
| Pruebas y adjuntos | R2 con URLs firmadas; evidencia cifrada en el cliente; referencia y hash en D1 |
| RPC | Alchemy, plan gratuito |
| Relayer | Cuenta dedicada, clave como secreto del Worker, poco saldo, límites por cuenta |
| Chat | Propio, libsodium sobre Durable Objects, cifrado de punta a punta, sin vencimiento |
| Verificación | Nivel 0 sin teléfono: perfil con datos y selfie en vivo. Nivel 2 con documento (Didit) fuera del TP |
| Push | Expo, con vista previa descifrada en el dispositivo; avisos críticos del jurado también por correo |
| Indexador | Eventos de la cadena a D1 (solo agregar); de ahí leen push, panel, tesoro, explorador y métricas |
| Panel | Web propia para escritorio, lee de D1 |
| Mapa | MapLibre con MapTiler (el plan gratuito es solo no comercial) |
| Tope de costo | 20 USD por mes de infraestructura |
| Privacidad | Pseudonimato: wallet dedicada; nada personal en la cadena, solo hashes, estados y montos |

## 4. Reglas de negocio vigentes

**Dinero**
- Comisión por la plataforma: 0% al arranque, 1% en crecimiento (piso 0,25 USDC, tope 5 USDC por changa), luego fórmula por presupuesto; tasa máxima 2% fijada en el contrato.
- Efectivo: tarifa al publicar de piso fijo 1 USDC más 2% del monto declarado, no se devuelve; sin garantía de cobro.
- Cargo de red al costo, se muestra antes de confirmar; el tesoro lo subsidia con tope en el arranque; en Sepolia es cero.
- Una moneda por changa, de una lista blanca; sin cambio entre monedas.
- Tamaños: chica hasta 20 USDC (disputa 50/50 sin jurado), media 20 a 300, alta más de 300.
- Hitos obligatorios: más de 5 días o más de 150 USDC. Anticipo para materiales: máximo 30% y 5 changas cerradas sin disputa.
- Testigo obligatorio por encima de 300 USDC.
- Grupal: aportes de 5% a 50% por persona; cada aportante hace su propio depósito y puede retirarse hasta el acuerdo; si vence el plazo sin completar, cada uno recupera lo suyo.

**Cancelación**
- Abierta sin prestador reservado: gratis.
- Reservada: gratis dentro de un período de gracia; después compensación lineal al prestador reservado, con máximo y tope por moneda.
- Acordada: el solicitante paga 10% (la mayoría va al prestador); gratis con 24 horas de anticipación en changas con fecha fija, 2 por mes por cuenta y 1 por mes por pareja.
- Prestador que cancela tras acordar: el dinero vuelve completo al solicitante.
- No presentación: tras check-in y 20 minutos de espera, el prestador cobra 10% del precio.

**Cierre**
- Silencio del solicitante tras la entrega libera el pago con calificación neutra: 24 horas en changas cortas, 72 horas por hito en las largas. Si faltan pruebas, el plazo no corre.
- Una sola prórroga del solicitante.
- Check-in por cercanía: radio de 150 metros; la app firma un atestado de proximidad y nunca se envía la ubicación.

**Jurado**
- Votos cifrados con commit-reveal; la mayoría de los votos revelados gana y cobra parte del costo; quien no revela pierde stake; quien pierde paga el arbitraje.
- Tamaño por monto: chica sin jurado (50/50), media 3, alta 5.
- Elegibles: anotados con garantía, que no sean parte ni tengan vínculo con las partes; hasta 2 casos activos por jurado.
- Invitación con 24 horas para aceptar; reemplazo por sorteo hasta 3 rondas; si no alcanzan, resuelve un árbitro de emergencia (el administrador) con motivo publicado y el contrato aplica el reparto.
- Una sola apelación con costo adicional. La parte demandada tiene 72 horas para responder un reclamo.
- Jurados semilla invitados por el administrador al arranque.

**Identidad, reputación, gobernanza**
- Solo nivel 0 en el TP. Niveles 1 y 2 y las capas contra changas falsas quedan fuera.
- Reputación por rol (prestador, solicitante, testigo, jurado); sube solo si la changa pagada por la plataforma supera 5 USDC y suman como máximo 2 changas con la misma contraparte.
- Voto por actividad; todo cambio de parámetros pasa por Timelock.
- Un solo administrador (la billetera de Maxi), con permisos por AccessControl: modera, verifica selfies, opera el servidor y resuelve reclamos de emergencia. No mueve fondos ni cambia parámetros.

## 5. Alcance del TP

Entran 37 de 40 funciones; quedan fuera la 17 (historial y nivel 1), la 18 (nivel 2 con documento) y la 27 (capas contra changas falsas).

Escenarios de demo: A individual completa, B efectivo, C disputa con jurado, D cancelación escalonada, E grupal, F votar un parámetro, H panel, I chat y notificaciones. El G (niveles) no entra.

Preguntas pendientes para el profesor: qué pide la entrega; si la consigna exige identidad con pruebas de conocimiento cero, cambio entre tokens o mezcla de tokens (hoy: lista blanca sin cambio, sin mezcla, sin ZK).

## 6. Estado del repositorio

Ruta: `/home/maxi/Documents/junquero`. Es un repo git con una sola rama, `dev`, y dos commits (`95a2edf` y `f94e4b0`). No hay remote configurado. El árbol de trabajo estaba limpio hasta que se agregaron los dos docs nuevos (`documento funcional` y este `traspaso`), que están sin commitear.

Estructura:
- `contracts/`: proyecto Foundry. Dependencias en `contracts/lib/` como submódulos del repo exterior: `forge-std`, `openzeppelin-contracts` y `permit2`.
- `docs/`: nueve documentos de diseño más los dos nuevos.
- No existen todavía `app/`, `backend/` ni `panel/`.

Historia del git: `contracts/` tenía un repo propio vacío (de `forge init`). Se borró su `.git` y se registraron los submódulos en el repo exterior, reubicando sus gitdirs. Funciona, pero si algún comando de submódulos falla, mirar las rutas `gitdir` dentro de `contracts/lib/*/.git`.

Foundry está instalado en `~/.foundry/bin`, que no está en el `PATH` de la shell. Hay que ejecutar `export PATH=$PATH:$HOME/.foundry/bin`.

## 7. Estado de los contratos (verificado)

**Actualización del 5 de noviembre (tarde):** ya están hechos los pasos 1 a 9 y la apelación, salvo el fork de Sepolia (754 tests en verde; el 9 son invariantes, escenarios, vectores de firma, cobertura y análisis estático). Antes, al 4 de noviembre, estaban los pasos 1 a 4 del plan de contratos (ver `docs/Junquero - especificacion de contratos y pruebas.md`, sección 0): el Escrow ahora es un router con módulos, y existen `Credentials`, `Reputation`, `Receipt` y `Arbitration`, con 413 tests en verde. Faltan hitos, grupal, testigo, votación (`VotingWeight`, Governor, Timelock), apelación, pruebas finales y el despliegue en Sepolia. La tabla de abajo describe el estado anterior y está desactualizada.


`forge test` el 4 de noviembre de 2026: 112 tests pasan, 0 fallan, en 8 suites (el 4 de noviembre, con el test de despliegue).

**Hecho**

| Archivo | Qué tiene |
| --- | --- |
| `src/Escrow.sol` | El escrow completo de la changa individual y de efectivo, con ReentrancyGuard, EIP-712, ERC2771 y AccessControl |
| `src/ParameterRegistry.sol` | Parámetros con mínimo y máximo; roles `DEFINER_ROLE` y `SETTER_ROLE` |
| `src/Treasury.sol` | Retiro por `SPENDER_ROLE` |
| `src/Forwarder.sol` | `ERC2771Forwarder` de OpenZeppelin |
| `src/libraries/` | `OrderTypes`, `EscrowHashes`, `ParameterKeys` |
| `src/interfaces/` | `IEscrow`, `IParameterRegistry` |
| `test/` | Suites de Create, Agree, Cancel, Lifecycle, Settle, ParameterRegistry y Treasury, más mocks de token con permit, permit2 y token con comisión |

**Funciones del Escrow**

`createOrder`, `reserve`, `withdrawReservation`, `agree`, `deliver`, `release`, `autoRelease`, `cancel`, `reclaim`, `checkIn`, `confirmArrival`, `claimNoShow`, `extendReview`, `configureToken`, más las vistas `getOrder`, `tokenConfig`, `reservationCompensation`, `freeCancelsUsed` y `domainSeparator`.

**Cómo funciona hoy**
- Dominio EIP-712: nombre `Escrow`, versión `1`.
- Tipos firmados:
  - `Reservation(uint256 orderId,address payer,address payee,uint40 expiry)`
  - `Agreement(orderId, payer, payee, price, specHash, termsHash, expiry)`
  - `Release(orderId, payee, amount, rating, evidenceHash, expiry)`
- Depósito con tres métodos: `Permit` (EIP-2612, tolera que el permit falle y sigue con la transferencia), `Permit2` y `Allowance`. Rechaza tokens con comisión por transferencia.
- Estados: `None, Open, Reserved, Agreed, Delivered, Disputed, Settled, Cancelled`.
- `agree` devuelve al solicitante la diferencia entre lo depositado y el precio acordado, y clasifica el tamaño (chica, media, alta) según los umbrales del token.
- `release` lo llama el prestador con la firma del solicitante. En efectivo solo cierra y emite el evento, sin mover dinero.
- `TokenConfig` por moneda: lista blanca, método de depósito, umbrales de tamaño, monto de hito, monto de testigo, reputación mínima, piso y tope de comisión, piso de tarifa en efectivo y tope de compensación de reserva.
- Roles: `DEFAULT_ADMIN_ROLE` y `TOKEN_ADMIN_ROLE`.
- Parámetros definidos en los tests (son valores de prueba, no valores finales): comisión 0–200 bps (0 por defecto), liberación automática corta de 1 hora a 7 días (24 h), gracia de reserva 12 h, crecimiento de reserva 3 días, máximo de reserva 200 bps, comisión de efectivo 0–1000 bps (500 en los tests, mientras el diseño dice 2%), cancelación tras acordar 10%, parte del prestador 80%, no presentación 10%, espera de 20 minutos, aviso de cancelación gratis 24 h, 2 por cuenta y 1 por pareja por mes.

**Falta en los contratos**

| Contrato o pieza | Estado |
| --- | --- |
| Changa grupal (aportes, retiro, coordinador, veto, objeción) | Sin empezar; el Escrow solo tiene un pagador por changa |
| Hitos y anticipo de materiales | Sin empezar |
| Liberación automática por hito (72 h) | Sin empezar; hoy solo existe la ventana corta |
| Pedidos de cambios en changas a distancia (hasta 2) | Sin empezar |
| Disputa: pasar a `Disputed` y aplicar el reparto | El estado existe pero no hay función que lo use |
| `DisputeCourt` | Sin empezar |
| `Comprobante` (ERC-721 intransferible, ERC-5192) | Sin empezar; OpenZeppelin no trae ERC-5192 |
| `Credentials`, `Reputation`, `VoteWeight` | Sin empezar |
| `Governor` y `TimelockController` | Sin empezar |
| Testigos (atestado y tarifa) | Sin empezar |
| Despliegue real en Sepolia | Sin hacer; el script `contracts/script/Deploy.s.sol` existe y tiene test |
| Despliegue en Sepolia y direcciones | No hecho; falta la dirección de Permit2 en Sepolia y Arbitrum |
| Cobro de comisión de plataforma al liberar | El cálculo existe (`_protocolFee`); revisar los tests antes de darlo por cerrado |

**Inconsistencias a resolver con Maxi**
1. **Resuelto el 4 de nov:** nombres de contratos. Se usan los del código: `Escrow`, `ParameterRegistry`, `Treasury`, `Forwarder` y, para lo nuevo, `Receipt`, `Arbitration`, `VotingWeight`, `ProtocolGovernor`. CONTEXT ya está actualizado.
2. **Resuelto el 4 de nov:** cancelación antes de acordar. Vale la regla del código (gratis sin prestador reservado; con reserva, gratis en la gracia y luego compensación lineal). CONTEXT y el doc de confianza ya están actualizados; `idea cerrada.md` es la versión vieja y no se tocó.
3. **Número de un solo uso del QR:** los docs de diseño lo mencionan, el struct `Release` no tiene nonce; la protección es que la changa se cierra al pagar. Confirmar que alcanza.
4. **Comisión de efectivo:** el diseño dice 2% más un piso de 1 USDC; los tests de ejemplo definen 5%. Definir los valores iniciales reales al desplegar.
5. **Reserva del prestador:** existe en el código y en el documento funcional, pero no en `CONTEXT.md` ni en los docs de pantallas. Falta definir cómo se ve en la app.

## 8. Plan de construcción recomendado

Propuesta del CONTEXT, sin decidir por Maxi. Con unos 27 días y un solo desarrollador, el riesgo es el alcance. Un camino completo por vez, con tests.

1. **Escrow de changa individual:** hecho en lo esencial (publicar, reservar, acordar con dos firmas, depositar, entregar, liberar con QR, cancelar, check-in, no presentación). Falta cerrar los puntos de la sección 7 que afecten a este camino y escribir los scripts de despliegue.
2. **Indexador de eventos a D1 y API mínima en Hono:** changas, postulaciones y adjuntos en R2. Las firmas de los eventos ya están definidas en `IEscrow.sol`.
3. **App:** registro con billetera, mapa, publicar, postularse, acordar y cerrar con QR.
4. **DisputeCourt mínimo:** reclamo, jurado fijo y commit-reveal, más la función de disputa en el Escrow.
5. **Chat cifrado y push.**
6. **Panel, gobernanza, grupal e hitos**, si da el tiempo.

Para cada etapa: definir primero la interfaz y los eventos, escribir los tests, y recién después la implementación.

## 9. Próximos pasos inmediatos

1. Resolver con Maxi las inconsistencias 3, 4 y 5 de la sección 7 (la 1 y la 2 ya están resueltas).
2. Commitear los dos docs nuevos y definir el remote del repo.
3. Revisar `.gitignore` de `contracts/` para confirmar que `out/` y `cache/` no se commitearon (el commit inicial incluyó `contracts/foundry.lock`, pero no se verificó el resto).
4. Hecho: `contracts/script/Deploy.s.sol` despliega `Forwarder`, `ParameterRegistry`, `Treasury` y `Escrow`, define los 13 parámetros que lee el escrow y configura USDC (permit) y USDT (Permit2) si se pasan por entorno (`USDC`, `USDT`, `PERMIT2`, `FINAL_ADMIN`). Falta correrlo en Sepolia y asignar `SETTER_ROLE` (el script no lo da; hoy solo lo tendría el Timelock futuro o un administrador).
5. Siguiente construcción a decidir: empezar la etapa 2 del plan (indexador y API) o el contrato siguiente, según lo que decida Maxi.

## 10. Pendientes de Maxi (fuera del código)

- Slogan y logo del pájaro, probado a 32 px.
- Verificar el nombre Junquero: estado "NU" del registro en clase 33 de INPI, variantes parecidas, dominio .com.ar, Play Store e Instagram.
- Consultas al profesor y validación legal con un profesional (la app se declara intermediaria sin relación laboral).
- Recalcular la tabla de sostenibilidad del doc de confianza y economía, que usa supuestos viejos.
- Confirmar el supuesto de pantallas: sin coordinador, quien publica propone al prestador de una changa grupal; el cambio de coordinador se decide por mayoría de dinero.

## 11. Mapa de documentos

| Archivo | Contenido |
| --- | --- |
| `docs/Junquero - CONTEXT.md` | Decisiones consolidadas al 2 de noviembre; el más importante |
| `docs/Junquero - documento funcional.md` | Documento funcional actualizado el 3 de noviembre |
| `docs/Junquero - idea cerrada.md` | Versión anterior del funcional, del 29 de octubre |
| `docs/Junquero - alcance del MVP y de la demo.md` | Inventario de 40 funciones, escenarios de demo y consigna |
| `docs/Junquero - confianza y economia.md` | Efectivo, comisión por fases, sostenibilidad, jurado y reputación |
| `docs/Junquero - tipos evidencia y reglas de cierre.md` | Evidencia, check-in, hitos, cierre y disputas |
| `docs/Junquero - stack y costos.md` | Stack y costos de infraestructura |
| `docs/Junquero - diseno de pantallas.md` | Todas las pantallas, estados, errores y textos |
| `docs/Junquero - marca.md` | Marca, paleta y tipografía |
| `docs/Junquero - metricas y trazabilidad.md` | Indexador, métricas y panel |
| `contracts/STANDARDS.md` | Piezas de OpenZeppelin y Permit2 usadas, verificadas contra el código instalado |

Voz de la app: voseo, frases cortas, sin términos de blockchain (billetera, costo de red, garantía, pago en garantía, confirmar, acuerdo, reclamo, fondo de la plataforma). Marca: paleta ladrillo `#8F2F22`, arena `#E7C98B`, fondo `#F4EEE6`, mapa `#E8DFD3`, tinta `#231815`; error magenta `#A3174E`; tipografía Outfit únicamente.
