# Junquero: contexto del proyecto

Archivo único de contexto para quien construya la app (persona o IA). Resume lo decidido en los documentos de diseño al 2 de noviembre de 2026. Si algo de este archivo contradice un documento, vale este archivo; los puntos abiertos están en "Conflictos entre documentos".

## Qué es

Marketplace descentralizado de changas y trabajos puntuales para Argentina, TP universitario (UNQ). Entrega: 1 de diciembre de 2026 (no se sabe si es entrega o defensa; se consulta con el profesor).

- Quien necesita algo publica una changa en un mapa, con adjuntos públicos (fotos, videos, PDF, Word, Excel, TXT, CSV).
- Quien busca trabajo ve las changas cercanas, se postula y chatea.
- Al acordar, las dos partes firman un acuerdo (EIP-712) y el pago queda en un contrato de escrow.
- Al terminar, el prestador sube evidencia; quien contrató libera el pago firmando un QR que el prestador escanea.
- Si hay desacuerdo, resuelve un jurado de usuarios con voto cifrado (commit-reveal).
- La plataforma es intermediaria: no emplea ni custodia dinero. El contrato custodia los fondos.
- Las changas a distancia existen (tipo Presencial o A distancia): sin pin en el mapa, sin check-in, evidencia como entregables con hash, sin QR; se libera con "Está todo bien" o por liberación automática; hasta 2 pedidos de cambios.

Nombre público: Junquero (pájaro de los humedales del Cono Sur, *Phleocryptes melanops*). Nombre interno de repo, paquetes y contratos: `junquero`. Slogan: a definir. Logo: el pájaro, lo dibuja Maxi.

## Reglas de trabajo

- Maxi decide qué se hace y qué no. No cerrar decisiones sin su confirmación.
- Respuestas directas, sin relleno, sin emojis, tono profesional.
- Código sin comentarios, limpio, modular, sin repeticiones, con edge cases considerados.
- Nivel avanzado en backend: no explicar conceptos básicos.
- Stack habitual de Maxi: NestJS/TypeScript, pero este proyecto usa el stack de abajo.

## Stack decidido

| Capa | Decisión |
| --- | --- |
| Red | Sepolia siempre para pruebas y desarrollo; Arbitrum en producción, a revisar antes de salir |
| Contratos | Solidity con OpenZeppelin |
| App | React Native con Expo, Android primero |
| Billetera | MetaMask por WalletConnect (SDK de Reown), viem y wagmi |
| Backend | Cloudflare Workers con Hono, Durable Objects (chat), D1 |
| Pruebas y adjuntos | R2, URLs firmadas; evidencia cifrada en el cliente; referencia y hash en D1 |
| RPC | Alchemy, plan gratuito, para despliegue, indexador y relayer (el RPC público de publicnode falló). El plan gratuito limita `eth_getLogs` a 10 bloques |
| Relayer | Cuenta dedicada, clave como secreto del Worker, poco saldo, límites por cuenta y por IP. Desplegado en Sepolia: `POST /relay` en `junquero-api` |
| Robot de tareas | Cron de un minuto en el mismo Worker: ejecuta `autoRelease`, `draw`, `finalize`, `execute`, `resolveByDefault`, `refundFunding`, `reclaim` y `autoReleaseMilestone` cuando vencen; dirigido por eventos |
| Chat | Propio, libsodium sobre Durable Objects, cifrado de punta a punta, sin vencimiento |
| Verificación | Sin teléfono: perfil con datos y selfie en vivo (nivel 0). Nivel 2 con documento (Didit) queda fuera del TP |
| Push | Expo, con vista previa descifrada en el dispositivo; avisos críticos del jurado también por correo |
| Indexador | Eventos de la cadena a D1 (solo agregar); de ahí leen push, panel, tesoro, explorador y métricas |
| Panel | Web propia para escritorio, lee de D1 |
| Tope de costo | 20 USD por mes de infraestructura |
| Privacidad | Pseudonimato: wallet dedicada; nada personal en la cadena, solo hashes, estados y montos |
| Monedas | Producción: USDC (permit), USDT y DAI (Permit2; DAI con 18 decimales); sin moneda en pesos (decidido el 7 de noviembre: los umbrales en dólares obligarían a revotarlos por inflación). Sepolia: token de prueba propio `TestUSDC` |
| Idioma | es-AR con voseo; todo el texto en archivos de traducción para una versión neutra después |

## Contratos

Diez contratos; el dinero de los usuarios vive solo en el escrow.

| Contrato | Función |
| --- | --- |
| Escrow | Custodia el dinero, guarda el estado de cada changa como registro interno (no es un NFT), libera con QR firmado EIP-712, cobra cancelaciones escalonadas, multimoneda con lista blanca de tokens (una moneda por changa) |
| Receipt | ERC-721 intransferible (ERC-5192), se emite al cerrar una changa completada, con categoría y mes y sin datos personales; opcional para el prestador |
| Treasury | Recibe comisiones; contrato aparte del escrow |
| ParameterRegistry | Parámetros con mínimo y máximo; solo el Timelock los cambia |
| Credentials | Niveles de cuenta como credenciales intransferibles |
| Reputation | Historial por persona y por rol (prestador, solicitante, testigo, jurado); lo actualizan eventos del escrow |
| Arbitration | Jurados, votos cifrados (commit-reveal), apelación, stake; sorteo por compromiso y revelación; quien no revela pierde el stake |
| VotingWeight | Peso de voto por actividad (IVotes), no se compra ni se transfiere |
| ProtocolGovernor y TimelockController | Votación con espera obligatoria; multisig del equipo al inicio |
| Forwarder | ERC2771Forwarder; los contratos usan ERC2771Context para saber quién firmó |

Transacciones por camino: 3 en changa individual con solicitante presente (publicar con depósito y permiso firmado, acordar con las dos firmas, liberar con QR que paga, califica y emite el comprobante); 4 con entrega diferida, changa grupal o disputa.

Estándares: EIP-712, EIP-2612 (permit), Permit2, ERC-20 con SafeERC20, SignatureChecker, ReentrancyGuard, ERC-721, ERC-5192, AccessControl, Governor, IVotes, ERC2771. La descripción de cada uno es de memoria y no se verificó contra la documentación de OpenZeppelin.

## Reglas de negocio

### Dinero
- Comisión de pago por la plataforma: 0% al arranque, 1% en crecimiento (piso 0,25 USDC, tope 5 USDC por changa), luego fórmula por presupuesto; tasa máxima 2% fijada en el contrato.
- Cargo de red al costo, se muestra antes de confirmar; en el arranque lo subsidia el tesoro con tope; en Sepolia es cero.
- Pago en efectivo: tarifa al publicar de piso fijo 1 USDC más 2% del monto declarado, no se devuelve; sin garantía de cobro, solo reputación.
- Cancelación: gratis sin prestador reservado; con prestador reservado, gratis dentro de un período de gracia y después una compensación lineal con máximo y tope por moneda; 10% tras acordar (mayoría para el prestador); gratis con 24 horas de anticipación en changas con fecha fija, 2 por mes por cuenta y 1 por mes por pareja.
- Compensación por no presentarse: 10% del monto.
- Tamaño de changa: chica hasta 20 USDC (disputa 50/50 automática), media 20 a 300, alta más de 300.
- Hitos opcionales: los elige quien publica, sin umbral de monto ni de plazo. La app lo sugiere en trabajos grandes o largos (más de 150 USDC o más de 5 días) pero no obliga. Anticipo para materiales: máximo 30%, con 5 changas cerradas sin disputa.
- Testigo obligatorio: más de 300 USDC.
- Changa grupal: aportes de 5% a 50% por persona; cada aportante hace su propio depósito (una transacción con permiso firmado, cargo de red a su cargo) y puede retirarse hasta el acuerdo; si vence el plazo sin completar la meta, cada uno recupera lo suyo.

### Cierre
- Silencio del solicitante tras la entrega libera el pago (calificación neutra) a las 24 horas en changas cortas y a las 72 horas por hito en las largas; rechazo explícito abre jurado.
- Si el prestador no subió todas las pruebas pedidas, el plazo no corre.
- Check-in por cercanía: radio de 150 metros, ventana de espera de 20 minutos; la app firma un atestado de proximidad, nunca se envía la ubicación.
- Una prórroga única por pedido del solicitante.

### Jurado
- Votos cifrados con commit-reveal; mayoría gana y cobra parte del costo; quien no revela pierde stake; quien pierde paga el arbitraje.
- Tamaño por monto de la changa: chica (hasta 20 USDC) se reparte 50/50 sin jurado; media (20 a 300 USDC) 3 jurados; alta (más de 300) 5 jurados. Decide la mayoría de los votos revelados.
- Jurados semilla invitados por el administrador al arranque.
- Un jurado puede tener hasta 2 casos activos; elegibles: anotados con garantía, que no sean parte ni tengan vínculo con las partes.
- Invitación con 24 horas para aceptar; reemplazo por sorteo hasta 3 rondas; si no alcanzan, resuelve un árbitro de emergencia con motivo publicado.
- Una sola apelación con costo adicional.

### Identidad, reputación y gobernanza
- Solo nivel 0 en el TP. Niveles 1 y 2 y capas contra changas falsas quedan fuera.
- Reputación por rol; sube solo si la changa pagada por la plataforma supera 5 USDC; máximo 2 changas con la misma contraparte suman.
- Voto por actividad; cualquier cambio de parámetros pasa por Timelock.
- Un solo administrador por ahora (la billetera de Maxi): modera, verifica selfies, opera el servidor y resuelve reclamos de emergencia si no hay jurado suficiente; no mueve fondos ni cambia parámetros.

## Alcance del TP

Entran 37 de 40 funciones; quedan fuera la 17 (historial y nivel 1), la 18 (nivel 2 con documento) y la 27 (capas contra changas falsas). Ocho áreas: dinero, changa, cuentas, disputas, gobernanza, app, backend, panel. Escenarios de demo: A individual completa, B efectivo, C disputa con jurado, D cancelación escalonada, E grupal, F votar un parámetro, H panel, I chat y notificaciones. El G no entra.

Preguntas pendientes para el profesor: qué pide la entrega; si la consigna exige identidad con pruebas de conocimiento cero, cambio entre tokens y mezcla de tokens (hoy: lista blanca sin cambio, sin mezcla, sin ZK).

## Pantallas

Navegación: cuatro pestañas (Mapa, Mis changas, Mensajes, Perfil) y botón Publicar siempre visible. El documento de pantallas lista 9 grupos más changa grupal (sección 11) e hitos (sección 12), con estados, errores y textos:

1. Registro y perfil: billetera, datos, selfie en vivo. Las dos opciones de bienvenida solo definen la primera pantalla.
2. Mapa y exploración: pines con zona aproximada de 300 metros hasta firmar el acuerdo; las remotas se ven con un chip "A distancia · N" que abre la lista; ver el mapa sin cuenta.
3. Publicar: asistente de cinco pantallas con adjuntos públicos y depósito del pago al publicar; el hash de los adjuntos queda fijado en el acuerdo.
4. Postulación y acuerdo: firma de las dos partes, vence a las 24 horas; el pago ya está depositado desde la publicación.
5. Chat: un chat por postulación; los chats de no elegidos pasan a solo lectura.
6. Hacer la changa y cerrarla: llegada, evidencia, terminada, revisar, QR, pago, calificar.
7. Reclamo y jurado.
8. Perfil, reputación y votación.
9. Panel de administración (web aparte).

Voz: voseo, frases cortas, sin términos de blockchain (billetera, costo de red, garantía, pago en garantía, confirmar, acuerdo, reclamo, fondo de la plataforma). Mensajes aprobados: "Quedó acordado. El pago está en garantía hasta que terminen." / "Listo, se liberó el pago." / "No pudimos confirmar. No se movió plata. Probá de nuevo."

Marca: paleta ladrillo #8F2F22, arena #E7C98B, fondo #F4EEE6, mapa #E8DFD3, tinta #231815; error magenta #A3174E (siempre con ícono y texto); éxito #1F7A45, advertencia #8A5A00, info #2B6CB0. Texto blanco solo sobre ladrillo o magenta; tinta sobre arena. Sin naranja ni azul como color de marca. Tipografía: Outfit únicamente (títulos 800/24, subtítulos 700/18, monto 800/32, texto 400/16, secundario 400/14, botón 600/16, chip 500/12).

## Conflictos entre documentos

Los documentos de diseño se escribieron en etapas. Los cuatro primeros puntos quedaron resueltos por Maxi el 2 de noviembre; los tres últimos siguen abiertos.

| # | Tema | Decisión | Estado |
| --- | --- | --- | --- |
| 1 | Cuándo se deposita el pago | Al publicar, con permiso firmado; el dinero queda en el contrato desde la publicación | Resuelto |
| 2 | Tamaño del jurado | Según el monto: chica 50/50 sin jurado, media 3 jurados, alta 5 | Resuelto |
| 3 | Liberación automática | 24 horas en changas cortas y 72 horas por hito en las largas | Resuelto |
| 4 | Poder del administrador | No mueve fondos ni cambia parámetros por su cuenta; sí resuelve reclamos de emergencia cuando no hay jurado, y el contrato aplica el reparto | Resuelto |
| 5 | Plazo para responder un reclamo | 72 horas; es un parámetro de ParameterRegistry | Resuelto |
| 6 | Gobernanza al inicio | Un solo administrador; la autoridad se implementa por roles de contrato (AccessControl), con Timelock y multisig como evolución | Resuelto |
| 7 | Pantallas de changa grupal e hitos | Entran al TP; el documento de pantallas las describe en las secciones 11 (grupal, 11.1 a 11.13) y 12 (hitos, 12.1 a 12.12) | Resuelto |

## Alcance recomendado para construir primero (propuesta, sin decidir)

Con 29 días y un desarrollador, el riesgo principal es el alcance. Orden sugerido, un camino completo por vez, con tests:

1. Escrow con changa individual: publicar, acordar con dos firmas EIP-712, depositar, liberar con QR firmado, cancelación básica. Tests en Foundry o Hardhat.
2. Indexador de eventos a D1 y API mínima (Hono): changas, postulaciones, adjuntos en R2.
3. App: registro con billetera, mapa, publicar, postularse, acordar, cerrar con QR.
4. Arbitration mínimo: reclamo, jurado fijo, commit-reveal.
5. Chat cifrado y push.
6. Panel, gobernanza, grupal e hitos, si da el tiempo.

## Pendientes de Maxi

- Slogan y logo del pájaro (probar a 32 px).
- Verificar Junquero: detalle del estado "NU" del registro en clase 33 de INPI, variantes parecidas, dominio .com.ar, Play Store, Instagram.
- Consultas al profesor y validación legal con un profesional (la app se declara intermediaria sin relación laboral; el diseño evita actuar como empleador).
- Proveedor del mapa: MapLibre con MapTiler en plan gratuito (el plan gratuito es solo no comercial).
- Recalcular la tabla de sostenibilidad del doc de confianza y economía, que usa supuestos viejos.

Supuestos de pantallas a confirmar: sin coordinador, quien publica propone al prestador de una changa grupal; el cambio de coordinador se decide por mayoría de dinero.
