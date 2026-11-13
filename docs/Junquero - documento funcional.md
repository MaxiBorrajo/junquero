# Junquero: marketplace descentralizado de changas

Documento funcional · UNQ, Seminario de Introducción a Blockchain · Maxi

Actualizado el 3 de noviembre de 2026 según el CONTEXT del proyecto, el alcance del MVP y los contratos del escrow. Entrega: 1 de diciembre de 2026 (falta confirmar con el profesor si es entrega o defensa).

## Resumen

Junquero es el nombre de la app, por un pájaro sudamericano (el junquero, *Phleocryptes melanops*) que construye su nido con paja, barro y plumas.

Proponemos un marketplace descentralizado de changas y necesidades: una persona o un grupo publica un trabajo sencillo (retirar un objeto, arreglar algo, una mudanza chica, pasear un perro) en un mapa y deposita el pago en un contrato que custodia el dinero. Quienes quieren resolverlo ven las changas cercanas, se postulan y chatean; cuando acuerdan, las dos partes firman el acuerdo y la changa pasa de pública a en proceso. Al terminar, el prestador sube pruebas, los solicitantes verifican y firman un QR que el prestador escanea para liberar el pago, con una comisión baja para la plataforma (0% en el arranque, alrededor de 1% después y 2% como máximo). Si hay desacuerdo, testigos y jurados (otras personas con reputación y stake) resuelven. La plataforma también admite acuerdos en efectivo, con una tarifa por publicar (un piso fijo más un porcentaje del monto declarado), y changas a distancia que no necesitan encuentro físico. El sistema combina tokens fungibles (pago en stablecoins, stake de jurados) y no fungibles (los comprobantes de changas cerradas y las credenciales y reputación intransferibles), con reglas de intercambio en los contratos, identidad autosoberana y gobernanza comunitaria. Busca dar acceso a trabajo simple y a ingresos inmediatos, algo muy necesario en Argentina, sin un intermediario que cobre entre 15% y 25%.

La plataforma es intermediaria: no emplea a nadie ni custodia dinero. El dinero de los usuarios vive solo en el contrato de escrow.

## Concepto

Muchas personas en Argentina necesitan ingresos inmediatos con trabajos simples, y muchas otras necesitan esos trabajos resueltos. Hoy se conectan por grupos de WhatsApp o plataformas que cobran mucho y no garantizan nada.

Qué aporta la blockchain:

- **Pago garantizado desde el inicio:** el dinero queda en un contrato; el prestador sabe que existe y el solicitante sabe que no se libera sin su firma.
- **Comisión baja:** desde 0% en el arranque y hasta 2% como máximo, fijado en el contrato, sin intermediario que retenga fondos.
- **Reputación propia:** el historial de cada persona le pertenece y no depende de una app.
- **Reseñas reales:** solo puede calificar quien cerró un pago con la otra parte.
- **Fondos grupales con devolución automática:** si la changa no se concreta, cada aportante recupera lo suyo sin que nadie lo apruebe.
- **Arbitraje entre desconocidos:** testigos y jurados con stake resuelven disputas sin una empresa en el medio.
- **Trazabilidad:** cada paso de una changa es un evento público en la cadena y de ahí sale su línea de tiempo.

## Actores

| Actor | Qué hace |
| --- | --- |
| Solicitante | Persona o grupo que publica la changa, aporta el dinero, elige al prestador, verifica y firma el QR |
| Aportante | Cada integrante de una changa grupal; pone su parte y participa en la verificación |
| Prestador | Ve el mapa, se postula, chatea, acuerda, realiza la changa, sube pruebas y escanea el QR para cobrar |
| Testigo | Persona que verifica presencialmente o revisa evidencia cuando se la pide una de las partes |
| Jurado | Grupo sorteado de personas con reputación y stake que resuelve disputas |
| Administrador | Modera, verifica selfies, opera el servidor e invita a los jurados semilla; no mueve fondos ni cambia parámetros |
| Plataforma / DAO | Cobra la comisión, administra el tesoro y define las reglas |

Una misma persona puede ser solicitante, prestador, testigo o jurado en distintas changas, nunca dos de esos roles en la misma.

## Tipos de changa

| Eje | Opciones | Efecto |
| --- | --- | --- |
| Modalidad | Presencial o a distancia | La presencial aparece como pin en el mapa y usa check-in y QR. La remota no tiene pin ni check-in: se ve con un chip "A distancia" que abre la lista, la evidencia son entregables con su hash, no usa QR y se libera con "Está todo bien" o por liberación automática, con hasta 2 pedidos de cambios |
| Pago | Por la plataforma o en efectivo | Ver Pago en efectivo y comisión |
| Tamaño | Chica (hasta 20 USDC), media (20 a 300) o alta (más de 300) | Define cómo se resuelve una disputa y si hace falta testigo |
| Duración | Corta o larga | Quien publica decide si divide en hitos; la app lo sugiere sobre 5 días o 500 USDC |
| Autoría | Individual o grupal | Ver Changa individual y grupal |

## Ciclo de vida de una changa

Una changa avanza desde pública hasta pagada, pasando por la reserva, el acuerdo, la entrega y la revisión; tiene dos salidas: cancelación con reembolso al solicitante, o disputa resuelta por jurado.

| Estado | Qué significa |
| --- | --- |
| Abierta | Publicada con el dinero ya depositado; visible en el mapa y abierta a postulaciones |
| Reservada | El solicitante apartó a un prestador de común acuerdo mientras terminan de definir los detalles |
| Acordada | Las dos partes firmaron el acuerdo; la changa deja de aparecer en el listado |
| Entregada | El prestador subió las pruebas y corre el plazo de revisión |
| En disputa | Hay una objeción o un reclamo y lo resuelve un jurado |
| Pagada | Se liberó el pago y se emitió la calificación |
| Cancelada | Se devolvió el dinero, con las compensaciones que correspondan |

En efectivo el ciclo es el mismo pero sin fondos en el contrato: se cierra cuando ambas partes confirman, sin QR ni jurado.

## Changa individual y grupal

Una changa la publica una persona o un grupo; en ambos casos el dinero queda en el contrato desde la publicación y ya no se puede retirar por fuera de las reglas.

- **Individual:** el solicitante deposita el monto completo al publicar, con un permiso firmado, en una sola transacción.
- **Grupal:** cada integrante hace su propio depósito, con un mínimo de 5% y un tope de 50% del total por persona, y la changa no se publica hasta completar el monto; si el plazo vence antes, cada aportante recupera lo suyo automáticamente. Cada aportante paga su propio cargo de red. Quien quiera poner más de la mitad publica una changa individual. El prestador no puede aportar a su propia changa.
- **Coordinador opcional:** se designa al publicar, propone al prestador y firma el QR. Sin coordinador, quien publica propone al prestador. Los demás aportantes tienen una ventana para vetar la propuesta. Cambiarlo después del acuerdo requiere mayoría de dinero.
- **Aprobación y objeción:** si nadie objeta dentro del plazo, el pago se libera. Para objetar hace falta representar al menos 25% del dinero o ser dos personas distintas; la objeción congela el pago y abre un jurado, y quien objeta paga el costo del arbitraje si resulta infundada. Un aportante puede retirarse y recuperar su parte hasta el acuerdo.
- **Moneda:** el pago se hace en una stablecoin de una lista blanca; cada changa usa una sola moneda. No hay cambio entre monedas.

## Mapa, postulación, chat y acuerdo

El mapa es el centro de la app para quien busca trabajo: muestra las changas publicadas cerca de su zona, no personas disponibles. Hasta firmar el acuerdo, cada pin muestra solo una zona aproximada de 300 metros. Se puede ver el mapa sin cuenta.

Al publicar se pueden adjuntar fotos, videos, PDF, Word, Excel, TXT y CSV. Los adjuntos son públicos para quien ve la oferta, se pueden reportar y los modera el jurado o el administrador. Su hash queda fijado en el acuerdo firmado.

Mientras está pública, cualquiera con un nivel de cuenta suficiente para esa changa puede postularse. El solicitante ve el perfil y la reputación de cada postulante y abre un chat con quien le interese. Hay un chat por postulación; los de quienes no fueron elegidos pasan a solo lectura.

1. El prestador se postula con una propuesta (puede ofrecer fecha y condiciones).
2. Se abre un chat entre solicitante y postulante para aclarar detalles.
3. **Reserva (opcional):** si necesitan más tiempo, el solicitante aparta al prestador y ambos lo firman. La changa pasa de **abierta** a **reservada**. El prestador puede retirarse de la reserva sin costo, y la changa vuelve a abierta.
4. Cuando ambos acuerdan, firman el acuerdo (EIP-712) con el precio, el hash de la oferta y el hash de las condiciones. Tiene un vencimiento de 24 horas y el pago ya está depositado desde la publicación. La changa pasa de **abierta** o **reservada** a **acordada** y deja de aparecer en el listado.
5. En ese momento se registran en la cadena las condiciones acordadas: monto, fecha límite (si hay), fecha de inicio (si es una changa con día y hora) y tipo de pruebas que se esperan. El precio acordado no puede superar lo depositado; si es menor, la diferencia vuelve al solicitante al cierre.

La fecha límite es opcional. Si existe y vence sin entrega, el solicitante puede cancelar y recuperar el dinero, y el prestador pierde reputación salvo que haya una disputa abierta.

El chat es off-chain, con cifrado de punta a punta y sin vencimiento; solo se guarda en la cadena un hash de las condiciones acordadas, para que no se puedan alterar después.

## Cancelaciones y compensaciones

| Momento | Quién cancela | Costo |
| --- | --- | --- |
| Abierta, sin prestador reservado | Solicitante | Gratis; recupera todo |
| Reservada | Solicitante | Gratis dentro de un período de gracia; después el prestador reservado recibe una compensación que crece de forma lineal hasta un máximo, con tope por moneda |
| Acordada | Solicitante | 10% del precio, repartido entre el prestador (mayoría) y el tesoro |
| Acordada, con día y hora fijados, con 24 horas de anticipación | Solicitante | Gratis, con un límite de 2 por mes por cuenta y 1 por mes por pareja de solicitante y prestador; después cuesta 10% |
| Acordada | Prestador | Sin pago para el prestador; el dinero vuelve al solicitante y baja su reputación |
| Acordada, fecha límite vencida sin entrega | Solicitante | Recupera todo y el prestador pierde reputación |

Los valores de gracia, crecimiento, máximo y tope viven en el contrato de parámetros, cada uno con su mínimo y su máximo.

Para proteger al prestador cuando el solicitante no aparece, existe además la compensación por no presentarse (ver Check-in y no presentación).

## Check-in y no presentación

En changas presenciales con día y hora fijados, la llegada se registra para proteger al prestador.

1. **Check-in:** el prestador lo marca a partir de la hora de inicio. La app firma un atestado de proximidad (radio de 150 metros) y nunca se envía la ubicación.
2. **Apretón de manos:** el solicitante confirma la llegada, idealmente escaneando el QR del otro y firmando los dos.
3. **No se presentó:** si el prestador hizo check-in, esperó una ventana de 20 minutos y el solicitante no confirmó, puede reclamar una compensación de 10% del precio; el resto vuelve al solicitante.

Un check-in unilateral verificado por la app del propio prestador se puede falsificar, por eso la compensación es baja y no carga con todo el peso.

## Entrega, verificación y QR de pago

El pago lo libera una autorización firmada por quien pagó: el QR no es un pedido de cobro, es una orden de liberación que solo puede usar el prestador asignado.

1. **Entrega:** el prestador marca la changa como terminada y sube pruebas (fotos, video, ubicación y hora); en el contrato queda el hash y el archivo va cifrado a R2, sin plazo de borrado. Sin conexión, las pruebas esperan en una cola local.
2. **Verificación:** el solicitante, o los aportantes según la regla del grupo, revisan las pruebas y confirman.
3. **QR:** quien verifica genera un QR con un mensaje firmado (EIP-712) que incluye la changa, la dirección del prestador, el monto, la calificación, el hash de las pruebas y un vencimiento corto.
4. **Cobro:** el prestador lo escanea, envía la transacción y el contrato libera el pago menos la comisión.
5. **Calificación:** va dentro del QR, así que solo existe si hubo pago real. Al cobrar se emite el comprobante intransferible, opcional para el prestador.

Si el solicitante no responde, el pago se libera solo a las 24 horas en changas cortas, o a las 72 horas por hito en changas largas, con calificación neutra. Si el prestador no subió todas las pruebas pedidas, el plazo no corre. El solicitante puede pedir una única prórroga mientras el plazo siga abierto. Si rechaza sin justificar, el prestador puede abrir una disputa (ver Testigos y jurado).

| Riesgo | Solución |
| --- | --- |
| Alguien fotografía el QR y lo cobra | El mensaje incluye la dirección del prestador; para otro no sirve |
| Se usa dos veces | La changa se cierra al pagar; no hay un segundo cobro |
| Se cobra días después | Vencimiento corto |
| Pago por etapas en changas largas | Un QR por hito con su monto parcial |
| Trabajo incompleto | El solicitante firma un monto menor y el resto vuelve a su cuenta al cerrar |

## Changas largas: hitos y término anticipado

Quien publica puede dividir el trabajo en hitos; es opcional y no hay umbral de monto ni de plazo. La app lo sugiere en trabajos de más de 5 días o más de 500 USDC, y cada changa muestra si el pago es por hitos o único. Cada hito tiene monto, criterio de aceptación verificable (por ejemplo, "pared lisa y pintada en dos manos") y evidencia pedida, y se fija al acordar, registrado como hash. El jurado juzga contra lo acordado. Las changas cortas no se dan por terminadas a mitad: solo se cancelan antes de empezar.

| Si el solicitante termina a mitad de camino | Regla |
| --- | --- |
| Hitos ya verificados | Se pagan completos |
| Hito en curso | El prestador muestra evidencia de avance y cobra una parte proporcional |
| Hitos sin empezar | Vuelven al solicitante |
| Terminar sin causa | Compensación adicional chica sobre lo que quedaba |
| Terminar con causa | Se objeta el hito y decide el jurado |

Materiales: por defecto los compra el solicitante. El anticipo para materiales queda fuera del alcance de esta versión (requiere un diseño con garantía del prestador). Si el prestador abandona, los hitos verificados se pagan, pierde el hito en curso y reputación, y la changa vuelve a publicarse con el dinero restante.

## Pago en efectivo y comisión

Hay dos modalidades; la plataforma cobra en ambas, pero el dinero se custodia solo en la primera.

| | Pago por la plataforma | Pago en efectivo |
| --- | --- | --- |
| Dinero | Queda en el contrato desde la publicación | Se arregla entre las partes, fuera de la plataforma |
| Comisión | 0% en el arranque; luego 1% con un piso de 0,25 USDC y un tope de 5 USDC por changa; después una fórmula por presupuesto. La tasa máxima es 2%, fijada en el contrato. Se cobra al liberar el pago | Piso fijo de 1 USDC más 2% del monto declarado, al publicar |
| Cargo de red | Al costo, se muestra antes de confirmar; en el arranque lo subsidia el tesoro con un tope; en Sepolia es cero | Al costo |
| Garantía de cobro | Sí | No |
| Disputas | Jurado con el dinero en juego | Solo reputación; sin dinero que resolver |
| Reputación | Se emite al cerrar el pago | Menor peso, y solo si ambas partes confirman el cierre |

La tarifa en efectivo tiene un piso fijo porque el monto declarado no se puede comprobar: un porcentaje solo se evitaría declarando un monto bajo. Se cobra al publicar y no se devuelve, incluso si la changa se cancela. La comisión del pago por la plataforma tiene tope, así que en la fase de crecimiento irse a efectivo declarando poco ahorra, como máximo, unos 4 USDC con los valores iniciales; el detalle está en el doc de confianza y economía.

La comisión va al tesoro, un contrato aparte del escrow, que financia el arbitraje y la operación. El gas lo adelanta un relayer, con una cuenta dedicada, poco saldo y límites por cuenta, y se traslada al usuario como un cargo de red al costo.

## Testigos y jurado

La verificación queda en manos de personas, no de dispositivos. Hay dos figuras con funciones distintas.

**Testigo**

- Cualquiera de las partes puede pedir uno para changas presenciales, y es obligatorio por encima de 300 USDC.
- Va al lugar o revisa las pruebas y firma un atestado de lo que vio.
- Cobra una pequeña tarifa fija, que sale de la comisión de la changa.
- No puede ser alguien con vínculo registrado con las partes.

**Jurado**

- Interviene solo si hay disputa: el solicitante rechaza la entrega o el prestador afirma que cumplió. La parte demandada tiene 72 horas para responder un reclamo.
- Se sortea entre personas anotadas con garantía y reputación mínima que no sean parte ni tengan vínculo con las partes; el sorteo se hace por compromiso y revelación entre los candidatos. Cada jurado puede tener hasta 2 casos activos.
- El tamaño depende del monto: las changas chicas (hasta 20 USDC) se reparten 50/50 sin jurado, las medias (20 a 300 USDC) tienen 3 jurados y las altas (más de 300) tienen 5. Decide la mayoría de los votos revelados.
- Cada jurado tiene 24 horas para aceptar la invitación; si no acepta, se reemplaza por sorteo hasta en 3 rondas. Si no hay jurados suficientes, resuelve un árbitro de emergencia (el administrador) con el motivo publicado; no mueve fondos: el contrato aplica el reparto.
- Votan con commit-reveal para no copiarse: primero un voto cifrado y después se revela. Quien no revela pierde el stake.
- Quienes votan con la mayoría cobran una parte del costo del arbitraje y ganan reputación; los demás pierden parte del stake.
- La parte que pierde paga el costo del arbitraje.
- Hay una sola apelación, con costo adicional.
- Al arranque, los jurados semilla los invita el administrador.

El jurado ve las pruebas y el chat que las partes decidan presentar, no los datos personales de nadie.

## Tokens y reglas de intercambio

| Token | Tipo | Transferible | Para qué |
| --- | --- | --- | --- |
| Comprobante de changa | NFT (ERC-721 con ERC-5192) | Nunca: es intransferible | Se emite al cerrar una changa completada, con categoría y mes y sin datos personales; la changa en sí es un registro del escrow, no un NFT |
| Pago | Stablecoin (ERC-20) de una lista blanca | Sí | Dinero de la changa y comisión; una moneda por changa |
| Credencial | Soulbound (ERC-5192) | No | Nivel de cuenta y habilitaciones |
| Reputación | Soulbound por rol | No | Historial como prestador, solicitante, testigo y jurado |
| Stake de jurado | ERC-20 bloqueado | No mientras está en juego | Garantía de buena fe de testigos y jurados |
| Gobernanza | Peso de voto por actividad (IVotes, soulbound) | No | Votación de los parámetros de la DAO, a partir de las changas cerradas y la reputación; no se compra |

**Reglas de intercambio**

- El pago pasa del solicitante al contrato al publicar, y del contrato al prestador al escanear el QR; nunca pasa por una cuenta de la plataforma.
- La comisión se descuenta al liberar y va al tesoro.
- La changa es un registro dentro del escrow: se vuelve de solo lectura al pasar a acordada y se cierra al pagar; su historial queda público. Al cerrar se emite un comprobante intransferible, opcional para el prestador.
- La reputación no se compra ni se transfiere; se emite o se descuenta por eventos del contrato.
- El stake de jurado se bloquea durante cada caso y se libera o se reduce según el voto.
- Con reputación baja, el prestador deposita una garantía para tomar changas de monto alto.
- No hay cambio entre monedas ni mezcla de tokens; son preguntas abiertas para el profesor.

## Contratos

Diez contratos; el dinero de los usuarios vive solo en el escrow.

| Contrato | Función |
| --- | --- |
| ChangaEscrow | Custodia el dinero, guarda el estado de cada changa, libera con QR firmado, cobra cancelaciones escalonadas y maneja varias monedas |
| Comprobante | ERC-721 intransferible emitido al cerrar |
| Treasury | Recibe las comisiones |
| Params | Parámetros con mínimo y máximo; solo el Timelock los cambia |
| Credentials | Niveles de cuenta como credenciales |
| Reputation | Historial por persona y por rol |
| DisputeCourt | Jurados, votos cifrados, apelación y stake |
| VoteWeight | Peso de voto por actividad |
| Governor y TimelockController | Votación con espera obligatoria |
| Forwarder | ERC2771Forwarder para las transacciones adelantadas por el relayer |

Una changa individual con el solicitante presente se resuelve en 3 transacciones (publicar con depósito y permiso firmado, acordar con las dos firmas, y liberar con el QR, que paga, califica y emite el comprobante); con entrega diferida, changa grupal o disputa son 4.

## Identidad autosoberana y reputación

La identidad cumple un rol acotado: evitar cuentas falsas sin que la plataforma guarde datos personales. Cada persona controla su wallet y las credenciales que recibe en ella; la plataforma solo ve el nivel, no los datos con que se obtuvo. La app es pseudónima: se usa una wallet dedicada y nada personal va a la cadena, solo hashes, estados y montos.

- **Niveles de cuenta como credenciales:** el nivel 0 (perfil con datos y selfie en vivo, sin teléfono), el nivel 1 (changas cerradas sin disputa) y el nivel 2 (documento verificado) se registran como credenciales intransferibles. Los niveles limitan qué changas puede hacer una cuenta, y el nivel 2 habilita ser jurado o verificador. **En el TP entra solo el nivel 0**; los niveles 1 y 2 y las capas contra changas falsas quedan documentados y fuera de la construcción.
- **Divulgación mínima:** cada credencial prueba solo el nivel, no el nombre, el número de documento ni la selfie. No se usan pruebas de conocimiento cero.
- **Los datos no quedan en la plataforma:** la selfie la verifica el administrador y el documento (nivel 2, a futuro) un servicio externo o un jurado de respaldo; la imagen se borra tras verificar y solo queda una marca irreversible para impedir que el mismo documento abra dos cuentas.
- **Reputación por rol:** ser buen prestador no hace a alguien buen jurado; cada rol tiene su propio historial.
- **Reputación ponderada:** pesa el monto de la changa y la diversidad de contrapartes. Sube solo si la changa pagada por la plataforma supera 5 USDC y suman como máximo 2 changas con la misma contraparte, para que dos cuentas amigas no se califiquen entre sí para inflarse.
- **Credenciales profesionales (opcional):** una matrícula emitida por un colegio habilita categorías sensibles como gas o electricidad. Queda fuera del alcance inicial y se agrega después.

## Gobernanza

Una DAO administra los parámetros del sistema; cualquier cambio pasa por un `TimelockController` antes de ejecutarse para que los usuarios puedan reaccionar. Los parámetros viven en un contrato con un mínimo y un máximo para cada valor, y la DAO no puede salirse de ese rango.

| Qué se decide | Cómo se vota |
| --- | --- |
| Comisión (piso, tope, fases y presupuesto) | Voto por actividad |
| Uso del tesoro (arbitraje, infraestructura, incentivos) | Voto por actividad |
| Tamaño del jurado, stake mínimo y reputación mínima | Voto por actividad |
| Plazos, cancelaciones y compensaciones | Voto por actividad |
| Categorías de changa permitidas o prohibidas | Voto por actividad |
| Sanciones a usuarios con abuso comprobado | Voto por actividad |

El voto es por actividad: el peso sale de las changas cerradas por la plataforma y de la reputación, no se transfiere ni se compra. Al inicio, con pocos usuarios, hay un solo administrador (la billetera de Maxi) con permisos por rol de contrato (AccessControl): modera, verifica selfies, opera el servidor y resuelve reclamos de emergencia, pero no mueve fondos ni cambia parámetros. El control pasa a la DAO, con Timelock y un multisig del equipo como evolución, al llegar a una cantidad de usuarios activos.

## Alcance del TP

Entran 37 de las 40 funciones del inventario; quedan fuera el historial y el nivel 1, el nivel 2 con documento y las capas contra changas falsas.

| Área | Se construye |
| --- | --- |
| Dinero | Escrow con depósito al publicar, efectivo con tarifa, cancelaciones, acuerdo con dos firmas, QR de pago, comprobante, varias monedas, tesoro y relayer |
| Changa | Publicar y postularse, grupal, hitos y anticipo, entrega con evidencia, revisión, check-in, adjuntos públicos |
| Cuentas | Nivel 0 y reputación por rol |
| Disputas | Jurado con votos cifrados, sorteo, apelación, tamaños por monto, jurados semilla |
| Gobernanza | Votar un parámetro con Timelock y peso por actividad |
| App y backend | App en React Native con MetaMask, mapa, cola sin conexión, chat cifrado, push, indexador y pruebas en R2 |
| Panel | Administración, tesoro, explorador, métricas y novedades |

**Escenarios de demo:** A individual completa, B efectivo, C disputa con jurado, D cancelación escalonada, E grupal, F votar un parámetro, H panel de administración e I chat y notificaciones. El G (niveles de cuenta) no entra porque el nivel 1 queda fuera.

**Stack:** red Sepolia para pruebas y desarrollo y Arbitrum en producción; Solidity con OpenZeppelin y Foundry; React Native con Expo (Android primero); Cloudflare Workers con Hono, Durable Objects y D1; R2 para las pruebas; un tope de 20 USD por mes de infraestructura.

## Decisiones y preguntas abiertas

**Decisiones tomadas**

- Solo changas y necesidades; las donaciones quedan fuera.
- La verificación de cada changa la hacen personas (solicitantes, testigos y jurados), no dispositivos.
- Una changa la publica una persona o un grupo, con coordinador opcional; todos aportan y el dinero queda en el contrato desde la publicación.
- Changas presenciales y a distancia; las remotas sin pin, sin check-in y sin QR.
- Changas con hitos opcionales y reglas de término anticipado.
- Liberación automática a las 24 horas en changas cortas y a las 72 horas por hito en las largas.
- Mapa de changas cercanas con adjuntos públicos; postulación y chat hasta acordar; reserva opcional del prestador; el acuerdo lo firman las dos partes.
- Check-in por proximidad y compensación por no presentarse.
- El prestador entrega con pruebas, los solicitantes verifican y firman un QR, el prestador lo escanea y cobra.
- Comisión por fases: 0% en el arranque, 1% en el crecimiento y luego una fórmula por presupuesto con tope de 2%; el efectivo se permite con un piso fijo más un porcentaje del monto declarado.
- Gas adelantado por un relayer y trasladado al usuario como cargo de red al costo.
- Jurado por tamaño de changa, con una apelación; un solo administrador que no mueve fondos.
- En el TP solo existe el nivel 0 de cuenta; el voto es por actividad.

**Preguntas abiertas**

| Tema | Estado |
| --- | --- |
| Qué pide la entrega y si el 1 de diciembre es entrega o defensa | Se consulta con el profesor |
| Si la consigna exige identidad con pruebas de conocimiento cero, cambio entre tokens y mezcla de tokens | Hoy: lista blanca sin cambio, sin mezcla y sin pruebas de conocimiento cero; se muestran avances al profesor |
| Validación legal (la app se declara intermediaria, sin relación laboral) | Falta la validación con un profesional |
| Verificar el nombre Junquero (INPI clase 33, dominio .com.ar, Play Store) | Pendiente de Maxi |
| Proveedor del mapa (MapLibre con MapTiler; el plan gratuito es solo no comercial) | A revisar |
| Tabla de sostenibilidad del doc de confianza y economía | A recalcular, usa supuestos viejos |
