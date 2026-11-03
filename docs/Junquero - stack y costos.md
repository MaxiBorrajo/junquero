# Junquero: stack y costos

Bloque 3 de las decisiones de diseño · cerrado · 2026-10-29 · @Maxi

## Decisiones tomadas

Todo lo decidido hasta ahora, para revisar antes de cerrar el doc. Sigue abierta una sola cosa: la validación legal con un profesional, en Preguntas abiertas.

| # | Tema | Decisión | Detalle en |
| --- | --- | --- | --- |
| 1 | Costo fijo | Techo de 20 USD por mes de infraestructura. El trabajo propio no se cuenta y publicar en las tiendas va aparte | Costos estimados |
| 2 | Red | Sepolia siempre para pruebas y desarrollo. Arbitrum queda documentada para producción y se revisa en detalle antes de salir | Resumen |
| 3 | App | React Native con Expo, empezando por Android | App móvil |
| 4 | Backend | Cloudflare (Workers con Hono, Durable Objects y D1), sin VPS por ahora | Backend |
| 5 | Firma | MetaMask por WalletConnect, con el SDK de Reown | Cuentas, firmas y relayer |
| 6 | Relayer | Cuenta dedicada, con la clave como secreto del Worker, poco saldo y límites | Explicaciones en simple |
| 7 | RPC | Alchemy, plan gratuito | Resumen |
| 8 | Pruebas | R2, cifradas en el cliente, sin plazo de borrado. Se borran solo a pedido de la persona y sin disputa abierta. Los archivos no van en la base | Almacenamiento de pruebas |
| 9 | Pruebas sin conexión | Cola que sube todo al recuperar la señal | App móvil |
| 10 | Chat | Propio, con libsodium sobre Durable Objects y sin vencimiento | Chat cifrado |
| 11 | Acuerdo de la changa | Siempre en cadena, con las firmas de los dos | Contratos |
| 12 | Changa y comprobante | La changa es un registro del escrow. Al cerrar se emite un comprobante intransferible, opcional para el prestador | Contratos |
| 13 | Changa grupal | Los aportes se cobran todos juntos al completar el objetivo, con permisos firmados | Contratos |
| 14 | Transacciones | Al mínimo: 3 en el caso común y 4 en entrega diferida, changa grupal y disputa | Contratos |
| 15 | Jurado | Sorteo por compromiso y revelación; quien no revela pierde el stake | Explicaciones en simple |
| 16 | Verificación | Sin teléfono. Perfil con datos y selfie en vivo, documento opcional (nivel 2, con Didit) que no se puede repetir, sin depósito de entrada por ahora. Lo paga quien se verifica y, si se agota el crédito mensual, quedan en cola hasta que se renueve | Verificación de cuentas |
| 17 | Privacidad | Pseudonimato en el MVP: wallet dedicada y wallets ocultas para otros usuarios, que solo las ven en MetaMask. Pagos privados para más adelante | Privacidad de lo que queda en la cadena |
| 18 | Notificaciones | Push con Expo y contenido genérico; los avisos se amplían sobre la marcha. Los críticos del jurado salen también por correo | Notificaciones push |
| 19 | Alcance del MVP | Se revisa en otro doc | Alcance del MVP |
| 20 | Métricas y trazabilidad | Doc aparte, después de cerrar este | Principios |

## Resumen

Propuesta actualizada: app nativa en React Native con Expo, un backend mínimo en Cloudflare (Workers, Durable Objects y D1) dentro del plan gratuito, contratos en Arbitrum, pruebas cifradas en R2 y cuentas sin verificación por teléfono. La infraestructura fija queda entre 0 y 5 dólares por mes, bajo el techo de 20 que fijaste. Los números son hipótesis.

Las decisiones tomadas están en la tabla del principio.

| Pieza | Propuesta | Costo inicial estimado | Alternativa |
| --- | --- | --- | --- |
| Red | Sepolia siempre para pruebas y desarrollo; Arbitrum en producción, a revisar en detalle antes de salir | Gas de prueba gratis; unos 0,08 a 0,09 USD por transacción en Arbitrum ([SpotedCrypto](https://www.spotedcrypto.com/defi-layer-2-comparison-guide-2026/)) | Base |
| Contratos | Solidity con OpenZeppelin; la changa es un registro del escrow y al cerrar se emite un comprobante intransferible | Sin costo de licencia |  |
| App | React Native con Expo, empezando por Android | Gratis para desarrollar; Google Play cobra 25 USD una vez y Apple 99 USD por año ([iLab](https://ilab.md/en/articles/publishing-on-the-app-store-and-google-play-in-2026-timelines-costs-and-7-hidden-requirements-that-could-derail-your-launch)) | Flutter, PWA |
| Backend y relayer | Cloudflare Workers con Hono, Durable Objects para el chat y D1 | 0 en el plan gratuito; 5 USD por mes si hace falta el plan pago ([Cloudflare](https://developers.cloudflare.com/workers/platform/pricing/)) | VPS con NestJS, unos 6 EUR por mes |
| RPC | Alchemy, plan gratuito (el RPC es la conexión con un nodo de la blockchain; ver Explicaciones) | 0 hasta 30 millones de CU por mes; después 0,45 USD por millón ([Alchemy](https://www.alchemy.com/pt-BR/overviews/blockchain-node-providers)) | Otros proveedores |
| Pruebas | R2, con archivos cifrados en el cliente y el hash en la cadena | 0 hasta 10 GB; después 0,015 USD por GB-mes, sin cargo de salida ([Cloudflare](https://developers.cloudflare.com/r2/pricing)) | IPFS |
| Chat | Cifrado propio con libsodium sobre Durable Objects | 0 dentro del plan gratuito | XMTP, Matrix |
| Verificación de cuenta | Sin teléfono: perfil con selfie en vivo y documento opcional (nivel 2) | Documento: 0,33 USD por persona, o 0,53 con RENAPER, con unas 30 gratis por mes (Didit) | Depósito de entrada |

Con esto el costo fijo de infraestructura ronda entre 0 y 5 dólares por mes, sin contar el dominio. Es menos que los unos 7 de la propuesta anterior con VPS y muy inferior a los 1.000 USDC del doc de confianza y economía; el detalle está en Costos.

## Principios para minimizar costos

El costo se controla guardando poco, usando capas gratuitas con salida y midiendo cada changa. El techo es de 20 dólares por mes de infraestructura.

- **Lo mínimo de servidor****:** funciones sin servidor en Cloudflare, dentro de la capa gratuita y sin máquinas que mantener; lo que la app pueda leer directo de la cadena no pasa por el backend.
- **Capas gratuitas con salida:** Cloudflare (Workers, Durable Objects, D1 y R2), Alchemy (30 millones de CU) y el crédito de Didit cubren el arranque. Cada pieza habla un estándar (S3, JSON-RPC, webhooks), así que se cambia sin reescribir.
- **Guardar ****livian****o:** fotos comprimidas antes de subir, límite de tamaño y de duración en los videos, y pruebas que se conservan sin borrar, porque guardarlas cuesta centavos y mantiene la trazabilidad.
- **En la cadena solo hashes y estados:** los archivos, el chat y los datos personales quedan afuera.
- **Medir por changa:** registrar desde el primer día el gas, el almacenamiento, los documentos de cada changa, para ajustar los parámetros con datos. Va a tener su propio doc de métricas y trazabilidad.
- **Cada persona paga lo suyo:** el documento lo paga quien se verifica, descontados de su primer movimiento, como quedó en el doc de confianza y economía.

## Arquitectura general

Todo el dinero pasa por los contratos; el servidor guarda índices y chat cifrado, y las pruebas viven cifradas en R2.

[Diagrama: arquitectura · 10 piezas, el dinero solo en los contratos]

El servidor, R2, el RPC y los servicios de verificación se pueden cambiar sin tocar los contratos. Si el servidor desaparece, el dinero, la reputación y los niveles siguen en la cadena.

## Contratos

Diez contratos, la mayoría armados con piezas de OpenZeppelin; los propios son el escrow, el tribunal, la reputación y el peso de voto. El dinero de los usuarios vive solo en el escrow.

| Contrato | Qué hace | Se apoya en | Nota |
| --- | --- | --- | --- |
| `ChangaEscrow` | Custodia el dinero, guarda el estado de cada changa, libera con el QR firmado (EIP-712), cobra las cancelaciones escalonadas y tiene un modo de solo cierre | `EIP712`, `SignatureChecker`, `SafeERC20`, `ReentrancyGuard` | Parte del contrato base del primer doc, ahora multimoneda con lista blanca de tokens; la changa es un registro interno, no un NFT |
| `Comprobante` | Un ERC-721 intransferible que se emite al cerrar una changa completada, con categoría y mes y sin datos personales | `ERC721` bloqueado (ERC-5192) | Una emisión por changa cerrada, dentro de la misma transacción de liberación |
| `Treasury` | Recibe las comisiones | `AccessControl` | Contrato aparte del escrow, para el cierre limpio |
| `Params` | Guarda los parámetros con mínimo y máximo | `AccessControl` | Solo el Timelock puede cambiarlos |
| `Credentials` | Niveles de cuenta como credenciales intransferibles | `ERC721` con transferencias bloqueadas (ERC-5192) | Las emite el backend con los verificadores |
| `Reputation` | Historial por persona y por rol | Propio | Lo actualizan los eventos del escrow |
| `DisputeCourt` | Jurados, votos cifrados, apelación y stake | Propio | El sorteo es una pregunta abierta |
| `VoteWeight` | Peso de voto por actividad | `IVotes` | Necesita guardar el peso en cada bloque votable |
| `Governor` y `TimelockController` | Votación y espera antes de ejecutar | `Governor`, `TimelockController` | Multisig del equipo al inicio |
| `Forwarder` | Recibe los mensajes firmados que envía el relayer | `ERC2771Forwarder` | Los contratos usan `ERC2771Context` para saber quién firmó |

**Para que cuesten poco**

- Guardar solo hashes, estados y montos; los textos, fotos y chat van fuera.
- Empaquetar los datos de cada changa en pocos slots de almacenamiento y publicar eventos para que el indexador no tenga que leer la cadena.
- Evitar bucles sobre listas que crecen: la liberación, el reembolso y el cobro de cancelación son operaciones de tiempo fijo.
- Mantener los contratos chicos y probados antes de agregar funciones: cada contrato extra suma costo de despliegue y de auditoría.

**Qué hace cada estándar**

| Estándar | Para qué sirve | Dónde se usa |
| --- | --- | --- |
| EIP-712 | Firmar mensajes con estructura que la wallet muestra legibles, en lugar de bytes ilegibles | QR de pago, acuerdos y permisos |
| EIP-2612 (permit) | Autorizar el gasto de un token con una firma, sin una transacción de aprobación aparte | Depósito en una sola transacción con USDC |
| Permit2 | Lo mismo para tokens sin permit, con una única aprobación inicial | Otras monedas de la lista blanca |
| ERC-20 y `SafeERC20` | El estándar de monedas intercambiables (USDC, USDT); `SafeERC20` evita que una transferencia falle en silencio con tokens raros | Todo el dinero |
| `SignatureChecker` | Verifica que una firma sea válida, venga de una wallet común o de un contrato | Escrow y forwarder |
| `ReentrancyGuard` | Impide que alguien vuelva a llamar a una función mientras se está pagando | Escrow |
| ERC-721 | Un token único con dueño, un NFT | Comprobantes y credenciales |
| ERC-5192 | Marca un ERC-721 como intransferible | Comprobantes y credenciales |
| `AccessControl` | Roles: quién puede cambiar parámetros o emitir credenciales | Params, Treasury y Credentials |
| `Governor` y `TimelockController` | Votaciones en la cadena y una espera obligatoria antes de ejecutar lo votado, para que haya tiempo de reaccionar | Gobernanza |
| `IVotes` | Interfaz con la que el Governor consulta cuánto pesa el voto de cada cuenta | Peso de voto por actividad |
| `ERC2771Forwarder` y `ERC2771Context` | Meta-transacciones: el relayer envía y paga, pero el contrato sabe quién firmó | Relayer |

Las descripciones son de memoria; no las verifiqué contra la documentación de OpenZeppelin en esta sesión.

**Menos transacciones por changa**

Cada transacción en Arbitrum cuesta unos 0,08 a 0,09 USD, así que cada una que se evita ahorra eso. El diseño queda así:

| Camino | Transacciones | Cuáles |
| --- | --- | --- |
| Changa individual con el solicitante presente | 3 | Publicar con depósito (permiso firmado); acordar (una sola transacción con las firmas de los dos); liberar con el QR, que paga, califica y emite el comprobante |
| Entrega sin el solicitante presente | 4 | Las anteriores más la entrega, con el hash de las pruebas |
| Changa grupal | 4, sin importar cuántos aporten | Cada aportante firma su permiso; al completar el objetivo se cobran todos en una sola transacción; siguen acordar y liberar |
| Disputa con tres jurados | 4 | Abrir; compromisos de los tres en una transacción; revelaciones de los tres en otra; resolver |

- Las postulaciones y el chat no usan transacciones: viven fuera de la cadena hasta que se elige a la persona.
- Publicar y depositar van juntos porque el permiso firmado reemplaza la aprobación del token.
- Liberar, calificar y emitir el comprobante ocurren en la misma transacción.
- Con un envío por jurado la disputa serían 8 transacciones; el relayer junta las firmas de los tres para enviar una por etapa.
- En la changa grupal hay un riesgo: si alguien gasta su saldo antes del cobro conjunto, su permiso falla y queda fuera.
- Opción más agresiva, que no recomiendo todavía: guardar el acuerdo firmado fuera de la cadena y subirlo solo si hay cancelación con compensación o disputa. El camino feliz bajaría a 2 transacciones, a costa de más casos borde, por ejemplo un solicitante que firma el QR para otra persona.

**La changa deja de ser un NFT**

Emitir un NFT al publicar cuesta gas incluso si la changa se cancela, y un NFT que nadie puede transferir mientras está abierta no aporta nada. Propongo que la changa sea un registro dentro del escrow y que el NFT sea un comprobante intransferible emitido al cerrar, solo para changas completadas: un historial de trabajo que la persona se lleva consigo. La contrapartida es que la wallet de cada persona queda ligada públicamente a la categoría y el mes de sus trabajos; por eso el comprobante no lleva descripción ni ubicación. Lo malo concreto: cualquiera puede ver que esa wallet hizo, por ejemplo, doce changas de mudanza en ciertos meses. Si la wallet se asocia a una persona real, porque cobró o por un nombre ENS, se conoce su actividad, sus ingresos aproximados y sus costumbres, lo que puede ser un riesgo de seguridad o de cara al fisco; no verifiqué el aspecto legal. Propongo que el comprobante sea opcional: el prestador elige si lo emite.

## Cuentas, firmas y relayer

En el MVP cada persona firma con MetaMask y un relayer propio envía las transacciones y paga el gas. El punto frágil es firmar desde el celular, sobre todo el QR de pago.

1. La persona inicia sesión firmando un mensaje con su wallet.
2. Cada acción (publicar, depositar, objetar, cobrar) es un mensaje EIP-712 que la persona firma sin pagar nada.
3. La app lo envía al backend; el relayer lo valida (límites por cuenta y funciones permitidas) y lo manda al `Forwarder`, pagando el gas.
4. El contrato verifica la firma y ejecuta como si lo hubiera enviado la persona; el cargo de red se descuenta en la moneda de la changa.

El QR de pago es el mensaje firmado de liberación más su firma, que cabe holgado en un QR. El prestador lo escanea y lo envía por el relayer, así que tampoco necesita ETH.

| Opción de wallet | Cómo funciona | Estado |
| --- | --- | --- |
| MetaMask por WalletConnect | La app abre MetaMask para cada firma y vuelve | Decidida para el MVP |
| Clave local en la app | La app genera una clave en el teléfono y firma sin salir | Descartada para el MVP: si se pierde el teléfono se pierde la cuenta |
| Wallet embebida con passkey | La app crea una cuenta protegida por la huella o el rostro | Para más adelante; no la investigué |

Decidido: MetaMask por WalletConnect, con el SDK de Reown (el nombre actual de WalletConnect), que tiene versión para React Native y Flutter. Es el riesgo de usabilidad más grande, así que el flujo del QR de pago se prueba antes que cualquier otra cosa.

**Controles del relayer**

- Lista de funciones permitidas por contrato; cualquier otra llamada se rechaza.
- Límite diario de transacciones por cuenta, menor en el nivel 0.
- Número de uso único y vencimiento en cada mensaje firmado.
- Alerta de saldo mínimo: la clave del relayer solo guarda el ETH para gas y no tiene acceso al dinero de los usuarios, que queda en el escrow.
- Si el relayer se cae, quien tenga ETH puede enviar el mensaje directo al `Forwarder`.

## App móvil

Propuesta: React Native con Expo, empezando por Android. Es TypeScript como el resto del proyecto, tiene cámara y ubicación nativas y sale a Android e iOS desde el mismo código. Flutter es la alternativa seria; la PWA queda descartada.

| Opción | A favor | En contra |
| --- | --- | --- |
| React Native con Expo | TypeScript; `viem` y `wagmi` funcionan y Reown publica una guía para React Native con Expo ([documentación de Reown](https://docs.reown.com/appkit/react-native/core/installation)); cámara, ubicación y archivos nativos; Android e iOS con un solo código | Algunos módulos nativos no corren en Expo Go y exigen compilar una versión de desarrollo; la documentación de Reown lo dice del SDK de Coinbase |
| Flutter | Un solo código con interfaz muy cuidada; Reown AppKit lo soporta para EVM ([cadenas soportadas](https://docs.reown.com/appkit/networks/supported-chains.md)) | Dart es un lenguaje nuevo para el proyecto y no comparte código con TypeScript; no comparé sus librerías de Ethereum |
| PWA | Sin tiendas ni cuentas de desarrollador | No puede usar Play Integrity ni App Attest ni detectar ubicación simulada; sin presencia en las tiendas; las notificaciones en iPhone no están verificadas |

Publicar cuesta 25 USD una sola vez en Google Play y 99 USD por año en Apple ([iLab](https://ilab.md/en/articles/publishing-on-the-app-store-and-google-play-in-2026-timelines-costs-and-7-hidden-requirements-that-could-derail-your-launch)). Para el TP alcanza con Android; para probar en iPhone con TestFlight hace falta la membresía de Apple. Google está implantando una verificación de identidad para desarrolladores que podría afectar las instalaciones fuera de la tienda; no verifiqué los plazos.

**Qué resuelve la app**

| Función | Cómo se resuelve |
| --- | --- |
| Captura de pruebas | Cámara nativa en vivo, sin acceso a la galería, con compresión antes de subir |
| Hora y ubicación firmadas | La ubicación del teléfono, firmada junto con el hash del archivo; el sistema marca la ubicación simulada (en Android con `isMock`, en iPhone con `isSimulatedBySoftware`, de memoria) |
| Integridad del dispositivo | Play Integrity en Android y App Attest en iPhone; no investigué sus cuotas |
| QR de pago | Se genera y se escanea con la cámara |
| Chat | WebSocket con el backend, con mensajes cifrados |
| Avisos | Notificaciones push nativas |
| Sin conexión | Cola de pruebas pendientes que se suben al recuperar la señal |

**Alternativas para validar el lugar**

| Señal | Qué prueba | Límite |
| --- | --- | --- |
| Ubicación marcada como simulada | Descarta las aplicaciones de ubicación falsa más comunes | Un teléfono con root o modificado puede ocultarla |
| Integridad del dispositivo | Que la app es la original y el teléfono no está modificado | No prueba que la persona esté en el lugar |
| Apretón de manos entre los dos teléfonos | Que ambos estuvieron cerca a la vez: intercambian un código firmado por QR | Si uno no aparece no hay apretón; si se ponen de acuerdo, lo pueden fingir |
| Foto de la fachada con hora firmada | Evidencia que el jurado puede comparar con el lugar | Subjetiva: la decide una persona |
| Plausibilidad | Descarta saltos imposibles de ubicación entre dos registros | Señal débil |

Ninguna prueba el lugar por sí sola. Se combinan, y las reglas de cierre ya agregan compensación baja y disputa para los casos dudosos.

## Backend

Casi todo el backend se puede evitar o reducir a unas pocas funciones sin servidor. Lo que queda cabe en el plan gratuito de Cloudflare y no necesita NestJS.

| Pieza | ¿Se puede obviar? | Cómo se resuelve |
| --- | --- | --- |
| Relayer (envía las transacciones y paga el gas) | No: alguien tiene que firmar y pagar | Un Worker corto con la clave guardada como secreto, o un servicio de relayer de terceros (no investigué precios) |
| Lista y búsqueda de changas | Al principio sí: la app lee los eventos directo por RPC | Con más volumen o con búsqueda por zona, un índice en D1 alimentado por una tarea programada |
| Chat | No, salvo que se use XMTP | Durable Objects con WebSocket: una sala por changa |
| Subir pruebas | No: alguien emite las URLs firmadas | Un Worker que firma las URLs de subida a R2 |
| Verificación de cuentas | No | Workers para enviar los códigos y recibir los avisos de Didit |
| Tareas con plazo, como liberar por silencio | Sí: las puede llamar cualquiera | La app ofrece un botón de reclamar; opcionalmente, una tarea programada |

**Dónde correrlo**

Los límites gratuitos salen de resultados de búsqueda de las páginas de Cloudflare, Supabase y Firebase. En Cloudflare, pasado un límite diario las operaciones fallan en lugar de cobrarse.

| Opción | Plan gratuito | Pasado el límite | Encaje |
| --- | --- | --- | --- |
| Cloudflare: Workers, Durable Objects, D1 y R2 | Workers: 100.000 solicitudes por día y 10 ms de CPU por solicitud. Durable Objects: 100.000 solicitudes por día y 5 GB. D1: 5 GB, 5 millones de filas leídas y 100.000 escritas por día. R2: 10 GB | Plan pago de 5 USD por mes | Propuesta |
| Supabase | Postgres de 500 MB, 200 conexiones en tiempo real y 50.000 usuarios; el proyecto se pausa tras 7 días sin uso | Plan Pro de 25 USD por mes, sobre el techo de 20 | Sirve para el TP, no para producción |
| Firebase | La verificación por teléfono exige el plan Blaze y se cobra por SMS | Pago por uso | Descartada |
| VPS con NestJS | Sin plan gratuito: Hetzner CX23 a 5,49 EUR más 0,50 de IPv4 por mes ([comparación de agosto de 2026](https://kimmo.suominen.com/stuff/cpc-2026-08.txt)) |  | Plan B si Cloudflare limita |
| Tu computadora | Gratis | Si se apaga, la app no funciona | Solo para desarrollar y ensayar |

**Framework: Hono en lugar de NestJS**

- Hono es un framework web de TypeScript, como Express o NestJS pero liviano, pensado para Workers: chico y sin supuestos de servidor (de memoria). NestJS asume un servidor Node que vive todo el tiempo y no es la herramienta natural en Workers.
- Con IA para escribir el código, el costo de cambiar de framework es bajo.
- Para desarrollar, los Workers corren en tu máquina con `wrangler dev` (de memoria); el TP se despliega en el plan gratuito.

**Riesgos de esta opción**

- El plan gratuito da 10 ms de CPU por solicitud, que puede quedar justo para firmar y enviar transacciones. Si pasa, el plan de 5 USD por mes sube el límite. No lo probé.
- Durable Objects es específico de Cloudflare: el chat es lo más atado. La lógica en Hono se puede llevar a un VPS.
- D1 y Durable Objects tienen límites diarios; con el chat y el indexador hay que medir cuántas operaciones usa cada changa.

## Almacenamiento de pruebas

R2 con archivos cifrados en el cliente es lo más barato y lo más privado: a 1.000 changas por mes el almacenamiento cuesta centavos. Con los supuestos de abajo, la sospecha del doc de confianza y economía de que guardar pruebas sería el costo variable más grande no se sostiene.

| Opción | Costo | Privacidad | Veredicto |
| --- | --- | --- | --- |
| Cloudflare R2 | 10 GB gratis; 0,015 USD por GB-mes; sin cargo de salida; 1 millón de escrituras gratis y después 4,50 USD por millón ([Cloudflare](https://developers.cloudflare.com/r2/pricing)) | Los archivos se cifran antes de subir, así que el operador no ve el contenido | Propuesta |
| IPFS con Pinata | Plan gratuito de 1 GB y 500 archivos; el plan de 20 USD por mes da 1 TB, según resultados de búsqueda | El contenido se direcciona públicamente y otros nodos pueden conservar copias: hay que cifrar sí o sí | Descartada para el MVP |
| Amazon S3 | 0,023 USD por GB-mes y salida desde 0,09 USD por GB, según resultados de búsqueda | Igual que R2 | Más cara que R2 |
| Disco del servidor | Incluido: 40 GB en el VPS propuesto | Igual que R2 | Se pierde si cae el servidor |

**Estimación de costo en R2**

Supuestos míos, no medidos: 5 MB por changa (ocho fotos comprimidas de unos 300 KB y, en la mitad de los casos, un video corto de unos 5 MB), sin borrado, así que lo guardado se acumula, y unas 10 escrituras por changa.

| Changas por mes | Guardado tras 1 año | Costo mensual al año | Guardado tras 3 años | Costo mensual a los 3 años |
| --- | --- | --- | --- | --- |
| 1.000 | 60 GB | 0,75 USD | 180 GB | 2,55 USD |
| 10.000 | 600 GB | 8,85 USD | 1.800 GB | 26,85 USD |

La capa gratuita de 10 GB alcanza para unas 2.000 changas en total; después el costo crece con el tiempo porque nada se borra. Con 10.000 changas por mes, el costo de los 3 años pasa el techo de 20 USD, pero a ese volumen las comisiones lo cubren de sobra.

**Cómo se protege la privacidad**

- La app genera una clave por changa y cifra cada archivo antes de subirlo; la comparten las dos partes por el chat.
- En la cadena queda el hash del archivo cifrado y la firma de la app con hora y ubicación.
- Si hay disputa, la parte que presenta la prueba le entrega la clave al jurado.
- Las pruebas se conservan sin plazo, cifradas, junto con su hash (ver Conservar y borrar).

Si hay disputa, el jurado ve las pruebas y puede denunciar material prohibido; en las changas sin disputa solo las ven las dos partes, que también pueden denunciar. Qué obligaciones tiene la plataforma como alojadora de ese contenido queda para validar con un profesional.

El doc de reglas de cierre habla de almacenamiento descentralizado; R2 es centralizado, con la integridad garantizada por el hash en la cadena. Es una pregunta abierta.

**IPFS: lo que conviene saber**

El protocolo es gratis, pero alguien tiene que mantener los archivos disponibles (pinear) y ese servicio cuesta o tiene un plan gratuito chico. Pinata, uno de los más usados, da 1 GB y 500 archivos gratis, y 1 TB cuesta 20 USD por mes. R2 da 10 GB gratis y cobra 15 USD por TB-mes.

A favor:

- La dirección es el hash del contenido, así que la integridad se verifica sola; ya la tenemos con el hash en la cadena.
- El protocolo no depende de una empresa: se puede cambiar de servicio de pinning sin cambiar las direcciones.
- Encaja con la idea de una aplicación descentralizada.

En contra:

- No es gratis: 1 GB alcanza para unas 200 changas de 5 MB.
- Es público: cualquiera con el identificador descarga el archivo cifrado, y queda disponible para siempre.
- No se puede borrar de verdad: otros nodos pueden conservar copias, lo que choca con que una persona pida eliminar sus datos.
- Depende del servicio de pinning: si cierra o cambia los precios, se pierde lo que solo él guardaba.
- La descarga puede ser lenta si el archivo no está cerca.

Mi propuesta es R2 para el MVP. IPFS solo tendría sentido si el TP exige almacenamiento descentralizado, y entonces sería solo para el paquete cifrado de las changas en disputa, que son pocas.

**Congelar las changas viejas**

R2 tiene una clase de acceso poco frecuente a 0,01 USD por GB-mes, contra 0,015 de la estándar, con un mínimo de 30 días de cobro, 0,01 USD por GB leído y sin capa gratuita ([Cloudflare](https://developers.cloudflare.com/r2/pricing)). Con 150 GB guardados pasaría de 2,10 a 1,50 USD por mes. No vale la complejidad por ahora; se reevalúa si el almacenamiento llega a decenas de dólares.

**Conservar y borrar**

Conservar las pruebas sin plazo mantiene la trazabilidad y cuesta centavos. Propuesta:

- Las pruebas se guardan cifradas y sin fecha de borrado; la plataforma no puede leerlas.
- El hash en la cadena queda para siempre.
- Quien quiera borrar las suyas lo pide: se borra el archivo cifrado y queda el hash, salvo que haya una disputa abierta o un plazo de reclamo en curso.
- El plazo de reclamo es un parámetro con mínimo y máximo, como los demás.
- Para bajar costos más adelante, las changas viejas pasan a la clase de acceso poco frecuente.

La contrapartida es la privacidad: aunque estén cifradas, una base de fotos que puede mostrar interiores de casas y crece sin límite es un riesgo si se filtra una clave. Tampoco verifiqué qué exige la Ley 25.326 sobre conservación y supresión de datos; hay que validarlo con un profesional antes de tener usuarios reales.

**¿Y guardar los archivos en la base?**

No conviene, y en este stack ni existe Postgres: la base es D1, que cobra 0,75 USD por GB-mes contra 0,015 de R2, o sea 50 veces más, y da 5 GB gratis en total ([Cloudflare](https://www.cloudflare.com/plans.md)). En un Postgres como el de Supabase el almacenamiento extra cuesta 0,125 USD por GB-mes y el plan gratuito da 500 MB ([Makerkit](https://makerkit.dev/blog/saas/supabase-pricing)). Postgres puede guardar bytes (`bytea` u objetos grandes, de memoria), pero engorda la base y sus respaldos y no sirve archivos por URL. En la base alcanza con guardar la ruta y el hash.

## Chat cifrado

Para el MVP conviene un chat cifrado propio y simple, armado con libsodium y con mensajes firmados; Matrix queda como camino de migración si el chat crece.

| Opción | Cómo funciona | A favor | En contra |
| --- | --- | --- | --- |
| Propio simple con libsodium | Cada persona tiene un par de claves de chat; los mensajes se cifran de punta a punta y el servidor solo reenvía y guarda texto cifrado | Sin costo extra y poco código; los mensajes firmados sirven de prueba en una disputa | Sin secreto hacia adelante: si se filtra una clave se leen los mensajes pasados; el diseño necesita revisión antes de producción |
| Matrix | Protocolo abierto con cifrado de punta a punta que se puede alojar uno mismo ([AlternativeTo](https://alternativeto.net/list/35480/secure-and-private-chat/)) | Maduro y con clientes ya hechos | Exige operar un servidor propio, más trabajo que el resto del backend; no lo medí |
| Protocolo de Signal u OMEMO | Doble trinquete, el mismo esquema de Signal y de XMPP | Muy probado | Algunas librerías de JavaScript son GPLv3, según la documentación de Converse.js: hay que revisar la licencia |

**Cómo funcionaría el chat propio**

- La wallet no expone su clave privada para descifrar, así que la app genera una clave de chat aparte y la vincula a la wallet con una firma.
- Cada mensaje va cifrado y firmado con esa clave; el servidor lo guarda cifrado y sin vencimiento, igual que las pruebas.
- En una disputa, la parte entrega al jurado la conversación con las firmas, que se pueden verificar.
- Si alguien pierde el dispositivo pierde el chat anterior: se acepta, porque el chat no es un registro permanente.
- Antes de acordar hay contacto entre desconocidos, así que hacen falta límites de mensajes por minuto, bloqueo y denuncia.

La regla es no inventar criptografía: solo se combinan primitivas estándar de libsodium, y el diseño completo se hace revisar antes de usarlo con gente real.

**Por qué es así**

- **Cifrado de punta a punta:** en el chat se intercambian direcciones, horarios y teléfonos. Con este cifrado solo las dos personas pueden leerlo: ni la plataforma ni quien robe la base de datos.
- **Una clave de chat aparte:** MetaMask no está pensada para descifrar mensajes (de memoria, retiró sus funciones de cifrado). La app crea una clave propia y la wallet firma una vez que esa clave es suya, para atarla a la cuenta.
- **Firmar cada mensaje:** en una disputa cualquiera podría inventar una captura de pantalla. Con las firmas, el jurado verifica que cada mensaje lo escribió quien dice.
- **Sin vencimiento****:** el chat es evidencia en una disputa y guardarlo cuesta casi nada; lo único que lo abre es la clave de cada persona.
- **Simple y no Matrix:** Matrix pide operar un servidor completo; para dos personas por changa alcanza con un reenvío cifrado.
- **No inventar criptografía:** un error en un diseño casero no se ve y lo expone todo. Libsodium ya trae las piezas probadas y se usan tal cual.
- **Durable Objects:** una sala por changa que guarda los mensajes cifrados y los entrega en tiempo real, dentro del plan gratuito.

Una alternativa es XMTP: mensajes cifrados entre wallets, con un SDK para React Native, sin servidor de chat propio. Las apps pagan cada mensaje en USDC y no encontré el precio por mensaje ([documentación de XMTP](https://docs.xmtp.org/fund-agents-apps/calculate-fees)). Mientras el chat propio entre en la capa gratuita, XMTP no parece ahorrar nada.

## Verificación de cuentas

Decisión: sin verificación por teléfono. La confianza se arma con señales que ve quien contrata, y el documento queda como verificación opcional que no se puede repetir.

| Señal | Cómo se obtiene | Costo |
| --- | --- | --- |
| Perfil completo | Nombre, zona, categorías y una selfie tomada en vivo dentro de la app, sin acceso a la galería | 0 |
| Historial | Changas cerradas sin disputa, calificaciones y comprobantes en la cadena | 0 |
| Documento verificado (nivel 2) | Didit; el número se guarda solo como huella, para que un documento no sirva en dos cuentas | 0,33 USD por persona, o 0,53 con RENAPER; unas 30 verificaciones por mes cubiertas por el crédito gratuito de Didit |
| Revisión humana de respaldo | Dos verificadores revisan el documento y una selfie; un tercero desempata | Tiempo de personas |

**Cómo decide quien contrata**

- La ficha del prestador muestra qué señales tiene y cuáles le faltan, con etiquetas claras como perfil sin documento.
- Quien contrata decide con esa información: si el prestador tiene pocos datos, puede no contratarlo.
- Las changas grandes exigen nivel 2, como ya estaba definido; el nivel 0 queda limitado a changas chicas.

**Qué hay gratis**

- El sandbox de Didit y su crédito mensual, que alcanza para unas 30 verificaciones completas (cifras del doc de confianza y economía).
- El perfil con datos y la selfie en vivo, sin verificación automática: la evalúan las personas.
- No encontré un servicio gratuito y sin límite que pruebe que alguien es una persona única y real. No investigué soluciones de código abierto para comparar rostros.

Sin teléfono ni documento, crear una cuenta falsa es gratis. Los frenos son el límite de las changas chicas, la reputación que se construye de a poco y, si aparece abuso, un depósito de entrada reembolsable que se puede activar como parámetro. Por ahora no lo propongo.

**Cómo paga cada persona su verificación**

Se cobra del primer movimiento de dinero de la persona. Ejemplo: Ana verifica su documento y la plataforma adelanta 0,33 USD. Cuando cobra su primera changa de 30 USDC, el contrato descuenta la comisión, el cargo de red y ese costo, lo manda al tesoro y le paga el resto. Quien publica paga lo mismo, descontado del depósito de su primera changa.

El riesgo es que alguien verifique y nunca mueva dinero: la plataforma pierde ese costo. Por eso el documento es optativo, se pide solo para llegar al nivel 2 y hay un tope mensual: cuando se agota el crédito gratuito de Didit, las verificaciones quedan en una cola y se procesan cuando el crédito se renueva.

Descartado: verificar por teléfono. Costaba unos 0,15 USD por SMS con Twilio, 0,01 con Telegram y entre 0,02 y 0,035 con WhatsApp; las fuentes quedan documentadas por si hace falta más adelante.

**Documento (nivel 2)**

- Vía principal: Didit, con el sandbox gratuito para probar (el nivel 2 queda fuera del TP) y el costo por persona descontado del primer movimiento, como quedó en el doc de confianza y economía.
- Respaldo: un panel simple dentro del backend con la lista de pendientes; las imágenes se guardan cifradas en R2 con URLs de acceso corto, las revisan dos verificadores y se borran apenas se decide.
- Quedan registrados quién vio qué documento, para auditar a los verificadores.
- La marca antiduplicado se calcula con una clave secreta del servidor y se guarda en la base; el número de documento no se guarda.

## Privacidad de lo que queda en la cadena

La cadena es pública: aunque el comprobante sea opcional, los pagos del escrow muestran qué wallet pagó y cuál cobró, cuánto y cuándo. El riesgo real aparece cuando alguien liga esa wallet con una persona.

| Dato público | Qué revela | ¿Se puede evitar? |
| --- | --- | --- |
| Pagos y depósitos del escrow | Wallet que paga, wallet que cobra, monto, moneda y fecha de cada changa | No, salvo con pagos privados, que no investigué |
| Saldo y movimientos de la wallet | Todo lo que tiene y mueve esa wallet, no solo lo de la app | Sí: usar una wallet dedicada a la app |
| Reputación y niveles | Cantidad de changas, calificaciones y nivel de cuenta por wallet | En parte: contadores en lugar de una lista por changa, pero los pagos siguen visibles |
| Comprobante | Categoría y mes de cada trabajo | Sí: es opcional y sin descripción ni ubicación |
| Votos de gobernanza | Cómo votó cada wallet | Votos secretos exigen otro diseño; no lo investigué |
| Hash de pruebas y chat | Solo una huella | Ya resuelto |

**Cómo se liga una wallet con una persona**

- Por la app: el perfil con nombre y selfie lo ve quien contrata. Vive en nuestra base y no en la cadena, pero la ficha asocia la wallet a una cara.
- Por un exchange: al retirar USDC a una app como Lemon o Belo, la wallet queda ligada a la identidad que esa app verificó.
- Por nombres públicos, como ENS, o por mostrar la dirección en redes.
- Por cualquiera que haya enviado o recibido dinero de esa wallet y la conozca.

**Qué riesgo concreto genera**

- Seguridad física: quien liga una wallet a una persona ve su saldo completo y puede apuntarle a ella o a su familia.
- Hábitos: horarios y zonas de trabajo a partir de las fechas de pago.
- Ingresos visibles para terceros y para el fisco; no verifiqué el aspecto legal.

**Qué propongo**

- Una wallet dedicada a la app, con un aviso en el alta para no mezclarla con la personal ni con la del exchange.
- La ficha pública no muestra la dirección, sino un alias.
- Comprobante opcional, ya decidido, y sin categoría en los eventos del escrow.
- Reputación como contadores y promedio por rol, no una lista por changa. Ayuda poco mientras los pagos sean públicos, pero no suma exposición.
- Para más adelante, pagos privados. Es el tema de token mixing de la consigna del TP. No los investigué y los mezcladores tienen riesgos legales (de memoria).

La trazabilidad que pide la consigna es justamente que los pagos sean públicos; el costo es esta exposición, y la defensa principal es separar la wallet de la identidad. Decidido: se acepta el pseudonimato en el MVP, con las wallets ocultas para otros usuarios de la app, que solo las ven en MetaMask. Siguen siendo públicas para cualquiera que mire la cadena, y los pagos privados quedan para más adelante.

## Notificaciones push

Las notificaciones salen del backend por el servicio de push de Expo, que no cobra nada, y llegan por FCM en Android y por APNs en iPhone ([Expo](https://docs.expo.dev/push-notifications/faq/)). Costo: 0. Lo que exige cuidado es el contenido y no depender de ellas para los plazos.

| Aviso | Para quién | Urgencia |
| --- | --- | --- |
| Nueva postulación a mi changa | Solicitante | Alta |
| Me eligieron o acordaron la changa | Prestador | Alta |
| Mensaje nuevo en el chat | Ambos | Media |
| Recordatorio de una changa con fecha y hora | Ambos | Alta |
| Entrega registrada, con el plazo de silencio por vencer | Solicitante | Alta: si no responde, se aprueba |
| Cancelación | Ambos | Alta |
| Pago liberado | Prestador | Media |
| Me sortearon como jurado, con la fecha límite para votar y revelar | Jurado | Crítica: no revelar pierde el stake |
| Verificación de documento aprobada o en cola | Persona verificada | Baja |
| Votación abierta | Votantes | Baja |

**Cómo salen**

- La app registra su token de notificación en el backend al iniciar sesión, y se guarda en D1 por cuenta y dispositivo.
- Los avisos que vienen de la cadena (acordada, liberada, jurado sorteado) los dispara el indexador cuando ve el evento.
- Los del chat salen del Durable Object cuando la otra persona no está conectada.
- Los recordatorios y los plazos salen de una tarea programada del Worker.
- El Worker los manda por lotes a Expo, que los entrega por FCM o APNs.

**Qué contenido llevan**

Los avisos pasan por servidores de Google y Apple, así que van genéricos: tenés un mensaje nuevo, o tu changa fue acordada. Sin direcciones, montos ni texto del chat; al abrir, la app trae el detalle. El chat es cifrado de punta a punta, así que el servidor no podría mandar el texto aunque quisiera.

**Costo y requisitos**

- Expo Push y FCM no cobran; APNs tampoco, pero exige la membresía de Apple de 99 USD por año ([Appy Pie](https://www.appypie.com/blog/?p=2795971)). En el TP alcanza con Android.
- Probar push exige una versión de desarrollo: según un artículo, Expo Go en Android no soporta push remoto desde el SDK 53 ([Sequenzy](https://www.sequenzy.com/best-push-notification-services-for-react-native)).
- OneSignal es gratis hasta 1.000 usuarios activos y después cuesta 19 USD por mes más 0,012 por usuario; no ofrece nada que necesitemos.

**Riesgos**

- La entrega no está garantizada: es de mejor esfuerzo. Ningún plazo puede depender solo del push; los plazos del jurado y del silencio viven en la cadena y se ven al abrir la app, y el aviso se repite antes del vencimiento.
- El token de Expo solo funciona con el servicio de Expo. Para poder cambiar de servicio, se guarda también el token nativo, que la propia librería permite obtener.
- Los tokens ligan un dispositivo con una cuenta: se guardan en D1, nunca en la cadena y sin la wallet.
- La persona puede negar el permiso, así que la app tiene que funcionar sin push.
- Los avisos críticos del jurado salen también por correo, como respaldo. El correo se pide solo a quien se postula como jurado, y no investigué el servicio de envío ni su costo.

## Costos estimados por mes

Con Cloudflare la infraestructura fija cuesta entre 0 y 5 dólares por mes, muy por debajo del techo de 20. Lo que más pesa por changa es el gas, que pagan los usuarios; la infraestructura casi no cuenta. Todas las cifras son hipótesis armadas con los precios de este doc.

Supuestos: 0,4 personas nuevas por changa, 3 transacciones por changa, un gas de 0,08 a 0,09 USD por transacción en Arbitrum, 1 de cada 10 personas nuevas llega al nivel 2 y 5 MB de pruebas por changa. Importes en USD.

| Concepto | 100 changas por mes | 1.000 | 10.000 | Quién lo paga |
| --- | --- | --- | --- | --- |
| Cloudflare (Workers, Durable Objects y D1) | 0 | 0 | 5, si se supera la capa gratuita | Plataforma |
| RPC (Alchemy) | 0 | 0 | A medir | Plataforma |
| Almacenamiento (R2), acumulado tras un año | 0 | 0,75 | 8,85 | Plataforma |
| Gas | 24 a 27 | 240 a 270 | 2.400 a 2.700 | Los usuarios, como cargo de red; en el arranque, el tesoro |
| Documento (nivel 2), con 30 verificaciones gratis por mes | 0 | 3 a 5 | 120 a 200 | Quien se verifica |

Sin gas ni documento, la plataforma gasta casi nada: 0 USD con 100 changas, alrededor de 1 con 1.000 y unos 14 con 10.000, con un año de pruebas acumuladas. El costo variable queda en menos de 0,01 USD por changa, muy por debajo de los 0,10 USD que usó el doc de confianza y economía.

**Lo que cambia respecto de ese doc**

- **Costo fijo:** entre 0 y 5 USD por mes de infraestructura, contra los 1.000 USDC que ese doc supuso y con un techo acordado de 20 USD. El trabajo propio no se cuenta por ahora. Con una comisión de 2% y 54 USDC por changa, la infraestructura se paga con unas 5 changas por mes en el peor caso.
- **Cargo de red:** ese doc lo calculó con 0,15 USDC por changa, a 0,05 por transacción en Base. En Arbitrum, con 3 transacciones, son 0,24 a 0,27 USDC, más de 2,4% del monto en una changa de 10 USDC. Queda documentado y se corrige cuando se decida la red.

Publicar en las tiendas va aparte del techo: 25 USD una sola vez en Google Play y 99 USD por año en Apple.

**Dónde saltan los costos**

- **Cloudflare:** el plan gratuito corta por día; si el chat o el indexador lo superan, el plan de 5 USD por mes sube los límites sin migrar nada.
- **R2:** pasadas unas 2.000 changas acumuladas sale de la capa gratuita y el costo crece con el tiempo porque nada se borra; son dólares, no decenas, salvo con muchísimo volumen.
- **RPC:** depende de cómo consulte el indexador; hay que medirlo antes de confiar en la capa gratuita.
- **Verificación de documento****:** el documento de nivel 2 cuesta unos 0,33 a 0,53 USD por persona y lo paga quien se verifica.
- **Gas:** crece con las transacciones por changa; el rediseño de Contratos las baja al mínimo.

## Alcance del MVP y de la demo (provisorio: se revisa en otro doc)

El TP corre entero en Sepolia con tokens de prueba y muestra el ciclo completo de una changa, la disputa y una votación; lo que depende de dinero real o de terceros se simula.

| Función | En el TP | Queda para después |
| --- | --- | --- |
| Publicar, depositar, postularse, acordar, entregar, firmar el QR y cobrar | Completo |  |
| Cancelación escalonada y compensaciones | Completo |  |
| Changa grupal con aportes y objeción | Completo |  |
| Hitos y anticipo de materiales | Un caso con hitos | El resto de los casos |
| Disputa con jurado y apelación | Tres jurados simulados | Sorteo con aleatoriedad verificable |
| Niveles de cuenta | Niveles 0 y 1; el nivel 2 queda fuera | Nivel 2 con Didit y código de verificación real |
| Panel de verificadores | Fuera del TP | Panel con dos revisores y auditoría de accesos |
| Pruebas | Cámara de la app, cifrado y R2 | Pasar las pruebas viejas a almacenamiento frío |
| Chat | Versión cifrada simple | Revisión criptográfica o Matrix |
| Monedas | Dos stablecoins de prueba y WETH | Lista blanca real, con USDT |
| Efectivo | Tarifa con piso fijo y porcentaje |  |
| Gobernanza | Votar un parámetro con peso por actividad y Timelock | Traspaso del multisig a la DAO |
| Anti-fraude de changas falsas | Las seis capas del MVP | Grupos cerrados y auditoría aleatoria |
| Gas | Relayer con límites; cargo de red en cero | Cargo de red real y subsidio acotado |

La demo en vivo necesita dos celulares con MetaMask y tres cuentas de jurado, todo sobre Sepolia.

## Explicaciones en simple

**RPC.** Es la forma en que un programa le habla a la blockchain. Ni la app ni el backend guardan una copia de la cadena: le preguntan a un nodo (para leer saldos o eventos) y le entregan las transacciones firmadas para que las difunda. Alchemy opera esos nodos y da acceso gratis hasta 30 millones de CU por mes; una CU es su unidad de medida y cada tipo de llamada gasta una cantidad distinta. También hay RPC públicos gratuitos, con límites de uso; no verifiqué los de Arbitrum. Los SDK como `viem` o `ethers` ya hacen las llamadas por vos, pero necesitan una URL de RPC detrás: cuando una dapp usa MetaMask, la wallet pone la suya sin que lo notes; en el backend hay que ponerla a mano.

**Wallet, ****`wagmi`**** y ****`viem`****.** La wallet es la aplicación de cada persona, MetaMask, que guarda su clave y firma. Nuestra app no la contiene: se conecta por WalletConnect. `viem` es una librería de TypeScript para hablar con Ethereum: leer contratos, armar mensajes y verificar firmas. `wagmi` son componentes de React que usan `viem` para conectar la wallet y pedir firmas. En el celular se usan las mismas con el SDK de Reown para React Native. Si ya conectaste MetaMask con `ethers`, RainbowKit o similar, hacen el mismo trabajo (RainbowKit está construido sobre `wagmi` y `viem`, de memoria); cualquiera sirve y propongo estas porque Reown las usa en su guía para React Native.

**La clave del relayer.** El relayer es un programa con su propia cuenta, que guarda un poco de ETH para pagar el gas de todos. Esa cuenta tiene una clave privada, y quien la robe puede gastar ese ETH y mandar transacciones basura, pero no puede tocar el dinero de las changas, que está en el escrow. Es como una tarjeta de combustible de la empresa: lo que importa es el tope. Propuesta: la clave como secreto del Worker, con poco saldo, recargas con tope y el forwarder aceptando solo las funciones permitidas. Un servicio de claves (HSM) es más seguro y cuesta más; no investigué el precio. Sí se puede usar una cuenta de MetaMask, pero una nueva y dedicada, no la personal: MetaMask pide tu aprobación en el navegador y el servidor necesita firmar solo, a cualquier hora, así que se exporta la clave de esa cuenta y se carga como secreto. En Sepolia se fondea gratis con faucets (de memoria).

**El sorteo del jurado.** Hay que elegir jurados al azar entre los habilitados sin que nadie pueda manipular quién sale. En una blockchain eso es difícil porque todo es determinista: usar datos del bloque, como la hora o su hash, deja que quien produce el bloque influya. Hay dos caminos. El primero es compromiso y revelación (commit-reveal): cada candidato aporta un secreto y el azar sale de combinarlos; es honesto mientras uno de ellos lo sea, pero se traba si alguien no revela. El segundo es un oráculo de aleatoriedad verificable, que se paga por pedido y cuyo precio no investigué. Para el TP alcanza con el primero, con jurados simulados. Fuera de ese no conozco otro mecanismo gratuito que sea seguro. Para el que no revela está el stake del jurado: pierde el stake y se lo reemplaza, lo que resuelve que se trabe.

## Preguntas abiertas

Solo sigue abierta la validación legal; las demás decisiones están en la tabla del principio.

| # | Pregunta | Mi propuesta | Por qué importa |
| --- | --- | --- | --- |
| 1 | Validación legal: borrado a pedido, moderación de pruebas, datos personales y fisco | Consultar a un profesional antes de tener usuarios reales | La Ley 25.326 y las obligaciones de la plataforma no están verificadas |

## Fuentes consultadas

Páginas abiertas y leídas (de acá salen los precios):

- [Cloudflare R2, precios](https://developers.cloudflare.com/r2/pricing), actualizada el 26 de octubre de 2026
- [Alchemy, guía de proveedores de nodos](https://www.alchemy.com/pt-BR/overviews/blockchain-node-providers), 24 de agosto de 2026: la publica uno de los proveedores comparados
- [Twilio, SMS a Argentina](https://www.twilio.com/sms/pricing/ar), octubre de 2026
- [Twilio Verify, precios](https://static0.twilio.com/en-us/verify/pricing), agosto de 2026
- [Cloud Pricing Comparison, agosto de 2026](https://kimmo.suominen.com/stuff/cpc-2026-08.txt): compilación personal de un tercero, sin IVA; los precios de Hetzner cambiaron dos veces en 2026
- [Precios de Didit](https://docs.didit.me/getting-started/pricing)
- [DeFi Layer 2 Comparison Guide 2026, SpotedCrypto](https://www.spotedcrypto.com/defi-layer-2-comparison-guide-2026/), 8 de mayo de 2026

Vistas solo en resultados de búsqueda, sin abrir la página:

- Pinata: [plan gratuito](https://pinata.cloud/blog/pinatas-new-free-plan/) y [planes pagos](https://freedom251.com/apps/pinata/)
- Amazon S3: [comparación de precios](https://www.spendbase.co/es/?p=35561)
- Chat: [lista de mensajería privada](https://alternativeto.net/list/35480/secure-and-private-chat/), [Converse.js](https://docsearch.algolia.com/mcp/docs/repo/conversejs/converse.js) sobre la licencia de las librerías de Signal y [XMTP, cálculo de tarifas](https://docs.xmtp.org/fund-agents-apps/calculate-fees)
- Cloudflare: [límites de Workers](https://developers.cloudflare.com/workers/platform/limits), [precios de Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing), [planes y capas gratuitas](https://www.cloudflare.com/plans.md) y [precios de Workers](https://developers.cloudflare.com/workers/platform/pricing/)
- Supabase: [CloudZero](https://www.cloudzero.com/blog/supabase-pricing/)
- Reown: [instalación en React Native](https://docs.reown.com/appkit/react-native/core/installation) y [cadenas y plataformas soportadas](https://docs.reown.com/appkit/networks/supported-chains.md)
- Tiendas de apps: [iLab](https://ilab.md/en/articles/publishing-on-the-app-store-and-google-play-in-2026-timelines-costs-and-7-hidden-requirements-that-could-derail-your-launch) y [Magora](https://magora-systems.com/google-play-developer-account-cost/)
- Códigos de verificación: [Telegram Gateway](https://core.telegram.org/gateway), [tarifas de WhatsApp de Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing), [tabla de un tercero](https://chatalog.ai/en/pricing-whatsapp-conversation-fees/), [lista de Gupshup de enero de 2026](https://www.gupshup.ai/resources/wp-content/uploads/2025/12/IDR_Jan2026.pdf), [Firebase según Logto](https://blog.logto.io/it/firebase-authentication-pricing) y [Firebase según Magora](https://magora-systems.com/firebase-pricing/)

- Notificaciones: [Expo, preguntas frecuentes](https://docs.expo.dev/push-notifications/faq/), [Sequenzy](https://www.sequenzy.com/best-push-notification-services-for-react-native) y [Appy Pie](https://www.appypie.com/blog/?p=2795971)

No se investigó: el dominio, la tarifa oficial de WhatsApp para Argentina (solo fuentes secundarias que no coinciden), oráculos de aleatoriedad, servicios de claves, servicios de relayer y de indexación de terceros, el precio de los mensajes de XMTP, si Firebase Phone Number Verification cubre Argentina, los plazos de la verificación de desarrolladores de Android y las cuotas de Play Integrity y App Attest. Van de memoria: las descripciones de los estándares de OpenZeppelin, las APIs de ubicación simulada, que MetaMask retiró sus funciones de cifrado, qué es Hono, `wrangler dev` y si los 10 ms de CPU del plan gratuito alcanzan para firmar y enviar transacciones.

