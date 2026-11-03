# Marketplace de changas: idea cerrada

Actualizado el 29 de octubre de 2026 para alinearlo con el doc de stack: la changa pasa a ser un registro del escrow con un comprobante intransferible al cerrar, el nivel 0 no usa teléfono y las pruebas van cifradas a R2.

Propuesta de dApp · 2026-10-28 · @Maxi

Actualizado el 29 de octubre de 2026 para alinearlo con los docs de reglas de cierre y de confianza y economía.

## Resumen

Proponemos un marketplace descentralizado de changas y necesidades: una persona o un grupo publica un trabajo sencillo (retirar un objeto, arreglar algo, una mudanza chica, pasear un perro) y deposita el pago en un contrato que custodia el dinero. Quienes quieren resolverlo se postulan y chatean; cuando acuerdan, la changa pasa de pública a en proceso. Al terminar, el prestador sube pruebas, los solicitantes verifican y firman un QR que el prestador escanea para liberar el pago, con una comisión baja para la plataforma (0% en el arranque, alrededor de 1% después y 2% como máximo). Si hay desacuerdo, testigos y jurados (otras personas con reputación y stake) resuelven. La plataforma también admite acuerdos en efectivo, con una tarifa por publicar (un piso fijo más un porcentaje del monto declarado). El sistema combina tokens fungibles (pago, reputación de jurados) y no fungibles (los comprobantes de changas cerradas y las credenciales y reputación intransferibles), con reglas de intercambio en los contratos, identidad autosoberana y gobernanza comunitaria. Busca dar acceso a trabajo simple y a ingresos inmediatos, algo muy necesario en Argentina, sin un intermediario que cobre entre 15% y 25%.

## Concepto

Muchas personas en Argentina necesitan ingresos inmediatos con trabajos simples, y muchas otras necesitan esos trabajos resueltos. Hoy se conectan por grupos de WhatsApp o plataformas que cobran mucho y no garantizan nada.

Qué aporta la blockchain:

- **Pago garantizado desde el inicio:** el dinero queda en un contrato; el prestador sabe que existe y el solicitante sabe que no se libera sin su firma.
- **Comisión baja:** desde 0% en el arranque y hasta 2% como máximo, sin intermediario que retenga fondos.
- **Reputación propia:** el historial de cada persona le pertenece y no depende de una app.
- **Reseñas reales:** solo puede calificar quien cerró un pago con la otra parte.
- **Fondos grupales con devolución automática:** si la changa no se concreta, cada aportante recupera lo suyo sin que nadie lo apruebe.
- **Arbitraje entre desconocidos:** testigos y jurados con stake resuelven disputas sin una empresa en el medio.

## Actores

| Actor | Qué hace |
| --- | --- |
| Solicitante | Persona o grupo que publica la changa, aporta el dinero, elige al prestador, verifica y firma el QR |
| Aportante | Cada integrante de una changa grupal; pone su parte y participa en la verificación |
| Prestador | Se postula, chatea, acuerda, realiza la changa, sube pruebas y escanea el QR para cobrar |
| Testigo | Persona que verifica presencialmente o revisa evidencia cuando se la pide una de las partes |
| Jurado | Grupo sorteado de personas con reputación y stake que resuelve disputas |
| Plataforma / DAO | Cobra la comisión, administra el tesoro y define las reglas |

Una misma persona puede ser solicitante, prestador, testigo o jurado en distintas changas, nunca dos de esos roles en la misma.

## Ciclo de vida de una changa

Una changa avanza por cinco estados hasta el pago; hay dos salidas: reembolso al solicitante o disputa resuelta por jurado.

[Diagrama: ciclo de vida de una changa · 5 estados y 2 salidas. Está en el documento online.]

En efectivo el ciclo es el mismo pero sin fondos en el contrato: se cierra cuando ambas partes confirman, sin QR ni jurado.

## Changa individual y grupal

Una changa la publica una persona o un grupo; en ambos casos el dinero queda en el contrato desde la publicación y ya no se puede retirar por fuera de las reglas.

- **Individual:** el solicitante deposita el monto completo al publicar.
- **Grupal:** cada integrante deposita su parte y la changa no se publica hasta completar el monto; si el plazo vence antes, cada aportante recupera lo suyo automáticamente.
- **Reparto de decisiones en un grupo:** elegir al prestador y firmar el QR requiere un mínimo de aportantes (por ejemplo, mayoría simple).
- **Cancelación por el solicitante:** gratis si no hay ningún chat abierto con un postulante; 5% del monto con un chat abierto antes de acordar; 10% después de acordar, con cancelación gratis a 24 horas dentro de límites (ver los docs de reglas de cierre y de confianza y economía).

## Postulación, chat y acuerdo

Mientras está pública, cualquiera con un nivel de cuenta suficiente para esa changa puede postularse. El solicitante ve el perfil y la reputación de cada postulante y abre un chat con quien le interese.

1. El prestador se postula con una propuesta (puede ofrecer fecha y condiciones).
2. Se abre un chat entre solicitante y postulante para aclarar detalles.
3. Cuando ambos acuerdan, el solicitante confirma al prestador y el prestador acepta: la changa pasa de **pública** a **en proceso** y deja de aparecer en el listado.
4. En ese momento se registran on-chain las condiciones acordadas: monto, fecha límite (si hay) y tipo de pruebas que se esperan.

La fecha límite es opcional. Si existe y vence sin entrega, el solicitante puede cancelar y recuperar el dinero, y el prestador pierde reputación salvo que haya una disputa abierta.

El chat es off-chain y cifrado; solo se guarda on-chain un hash de las condiciones acordadas, para que no se puedan alterar después.

## Entrega, verificación y QR de pago

El pago lo libera una autorización firmada por quien pagó: el QR no es un pedido de cobro, es una orden de liberación que solo puede usar el prestador asignado.

1. **Entrega:** el prestador marca la changa como terminada y sube pruebas (fotos, video, ubicación y hora); en el contrato queda el hash y el archivo va cifrado a R2, sin plazo de borrado (ver el doc de stack).
2. **Verificación:** el solicitante, o los aportantes según la regla del grupo, revisan las pruebas y confirman.
3. **QR:** quien verifica genera un QR con un mensaje firmado (EIP-712) que incluye la changa, la dirección del prestador, el monto, la calificación, un número de un solo uso y un vencimiento corto.
4. **Cobro:** el prestador lo escanea, envía la transacción y el contrato libera el pago menos la comisión.
5. **Calificación:** va dentro del QR, así que solo existe si hubo pago real.

Si el solicitante no responde dentro de un plazo, o rechaza sin justificar, el prestador puede abrir una disputa (ver Testigos y jurado).

| Riesgo | Solución |
| --- | --- |
| Alguien fotografía el QR y lo cobra | El mensaje incluye la dirección del prestador; para otro no sirve |
| Se usa dos veces | Número de un solo uso |
| Se cobra días después | Vencimiento corto |
| Pago por etapas en changas largas | Un QR por hito con su monto parcial |
| Trabajo incompleto | El solicitante firma un monto menor y el resto vuelve a su cuenta al cerrar |

## Pago en efectivo y comisión

Hay dos modalidades; la plataforma cobra en ambas, pero el dinero se custodia solo en la primera.

| | Pago por la plataforma | Pago en efectivo |
| --- | --- | --- |
| Dinero | Queda en el contrato desde la publicación | Se arregla entre las partes, fuera de la plataforma |
| Comisión | 0% en el arranque; luego 1% y como máximo 2%, al liberar el pago, más un cargo de red al costo | Piso fijo de 1 USDC más 2% del monto declarado, al publicar |
| Garantía de cobro | Sí | No |
| Disputas | Jurado con el dinero en juego | Solo reputación; sin dinero que resolver |
| Reputación | Se emite al cerrar el pago | Menor peso, y solo si ambas partes confirman el cierre |

La tarifa en efectivo tiene un piso fijo porque el monto declarado no se puede comprobar: un porcentaje solo se evitaría declarando un monto bajo. Se cobra al publicar y no se devuelve. La comisión del pago por la plataforma tiene tope, así que en la fase de crecimiento irse a efectivo declarando poco ahorra, como máximo, unos 4 USDC con los valores iniciales; el detalle está en el doc de confianza y economía.

La comisión va al tesoro de la DAO, que financia el arbitraje y la operación. El gas lo adelanta un relayer y se traslada al usuario como un cargo de red al costo.

## Testigos y jurado

La verificación queda en manos de personas, no de dispositivos. Hay dos figuras con funciones distintas.

**Testigo**

- Cualquiera de las partes puede pedir uno para changas presenciales o de monto alto.
- Va al lugar o revisa las pruebas y firma un atestado de lo que vio.
- Cobra una pequeña tarifa fija, que sale de la comisión de la changa.
- No puede ser alguien con vínculo registrado con las partes.

**Jurado**

- Interviene solo si hay disputa: el solicitante rechaza la entrega o el prestador afirma que cumplió.
- Se sortea entre personas con reputación mínima que depositaron stake; el sorteo se hace por compromiso y revelación entre los candidatos.
- Votan con commit-reveal para no copiarse: primero un voto cifrado y después se revela.
- Quienes votan con la mayoría cobran una parte del costo del arbitraje y ganan reputación; los demás pierden parte del stake.
- La parte que pierde paga el costo del arbitraje.

El jurado ve las pruebas y el chat que las partes decidan presentar, no los datos personales de nadie.

## Tokens y reglas de intercambio

| Token | Tipo | Transferible | Para qué |
| --- | --- | --- | --- |
| Comprobante de changa | NFT (ERC-721) | Nunca: es intransferible | Se emite al cerrar una changa completada, con categoría y mes y sin datos personales; la changa en sí es un registro del escrow |
| Pago | Stablecoin (ERC-20) | Sí | Dinero de la changa y comisión |
| Credencial | Soulbound (ERC-5192) | No | Nivel de cuenta y habilitaciones |
| Reputación | Soulbound por rol | No | Historial como prestador, solicitante, testigo y jurado |
| Stake de jurado | ERC-20 bloqueado | No mientras está en juego | Garantía de buena fe de testigos y jurados |
| Gobernanza | Peso de voto por actividad (soulbound) | No | Votación de los parámetros de la DAO, a partir de las changas cerradas y la reputación; no se compra |

**Reglas de intercambio**

- El pago pasa del solicitante al contrato al publicar, y del contrato al prestador al escanear el QR; nunca pasa por una cuenta de la plataforma.
- La comisión se descuenta al liberar y va al tesoro de la DAO.
- La changa es un registro dentro del escrow: se vuelve de solo lectura al pasar a en proceso y se cierra al pagar; su historial queda público. Al cerrar se emite un comprobante intransferible, opcional para el prestador.
- La reputación no se compra ni se transfiere; se emite o se descuenta por eventos del contrato.
- El stake de jurado se bloquea durante cada caso y se libera o se reduce según el voto.
- Con reputación baja, el prestador deposita una garantía para tomar changas de monto alto.

## Identidad autosoberana y reputación

La identidad cumple un rol acotado: evitar cuentas falsas sin que la plataforma guarde datos personales. Cada persona controla su wallet y las credenciales que recibe en ella; la plataforma solo ve el nivel, no los datos con que se obtuvo.

- **Niveles de cuenta como credenciales:** el nivel 0 (perfil con datos y selfie en vivo, sin teléfono, y un depósito de entrada solo si aparecen cuentas descartables), el nivel 1 (changas cerradas sin disputa) y el nivel 2 (documento verificado) se registran como credenciales intransferibles en la wallet de la persona. Los niveles limitan qué changas puede hacer, y el nivel 2 habilita ser jurado o verificador.
- **Divulgación mínima:** cada credencial prueba solo el nivel, no el nombre, el número de documento ni la selfie.
- **Los datos no quedan en la plataforma:** el documento lo verifica un servicio externo o un jurado de respaldo y la imagen se borra tras verificar; solo queda una marca irreversible para impedir que el mismo documento abra dos cuentas.
- **Reputación por rol:** ser buen prestador no hace a alguien buen jurado; cada rol tiene su propio historial.
- **Reputación ponderada:** pesa el monto de la changa y la diversidad de contrapartes, para que dos cuentas amigas no se califiquen entre sí para inflarse.
- **Credenciales profesionales (opcional):** una matrícula emitida por un colegio habilita categorías sensibles como gas o electricidad. Queda fuera del alcance inicial y se agrega después.

En la demo, el nivel 2 se simula con el sandbox del proveedor de verificación. El detalle está en el doc de confianza y economía.

## Gobernanza

Una DAO administra los parámetros del sistema; cualquier cambio pasa por un `TimelockController` antes de ejecutarse para que los usuarios puedan reaccionar. Los parámetros viven en un contrato con un mínimo y un máximo para cada valor, y la DAO no puede salirse de ese rango.

| Qué se decide | Cómo se vota |
| --- | --- |
| Comisión (piso, tope, fases y presupuesto) | Voto por actividad |
| Uso del tesoro (arbitraje, infraestructura, incentivos) | Voto por actividad |
| Tamaño del jurado, stake mínimo y reputación mínima | Voto por actividad |
| Categorías de changa permitidas o prohibidas | Voto por actividad |
| Sanciones a usuarios con abuso comprobado | Voto por actividad |

El voto es por actividad: el peso sale de las changas cerradas por la plataforma y de la reputación, no se transfiere ni se compra, y requiere nivel 1 y un depósito para votar. Al inicio, con pocos usuarios, rige un multisig del equipo con Timelock, y el control pasa a la DAO al llegar a una cantidad de usuarios activos. Las capas contra changas falsas están en el doc de confianza y economía.

## Decisiones y preguntas abiertas

**Decisiones tomadas**

- Solo changas y necesidades; las donaciones quedan fuera.
- La verificación de cada changa la hacen personas (solicitantes, testigos y jurados), no dispositivos.
- Una changa la publica una persona o un grupo; todos aportan al publicar y el dinero queda en el contrato.
- Postulación y chat hasta acordar; al acordar pasa de pública a en proceso.
- El prestador entrega con pruebas, los solicitantes verifican y firman un QR, el prestador lo escanea y cobra.
- Comisión por fases: 0% en el arranque, 1% en el crecimiento y luego una fórmula por presupuesto con tope de 2%; el efectivo se permite con un piso fijo más un porcentaje del monto declarado.
- Gas adelantado por un relayer y trasladado al usuario como cargo de red al costo; Sepolia siempre para pruebas y desarrollo y Arbitrum en producción.
- Niveles de cuenta (perfil, historial y documento) y voto por actividad.

**Dónde quedó cada pregunta**

| Tema | Dónde se resolvió |
| --- | --- |
| Efectivo | Doc de confianza y economía |
| Confianza y seguridad física | Doc de confianza y economía |
| Disputas | Doc de reglas de cierre |
| Pruebas | Doc de reglas de cierre |
| Moneda | Doc de confianza y economía |
| Gas | Doc de confianza y economía |
| Arranque del jurado | Doc de confianza y economía |
| Legal | Doc de reglas de cierre, con las limitaciones declaradas; falta la validación con un profesional |
| Stack | Resuelto en el doc de stack: React Native con Expo, backend en Cloudflare, pruebas en R2 y chat propio cifrado |
