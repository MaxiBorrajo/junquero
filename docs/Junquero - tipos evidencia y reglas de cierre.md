# Junquero: tipos, evidencia y reglas de cierre

Bloque 1 de las decisiones de diseño, actualizado el 29 de octubre de 2026 para alinearlo con el doc de stack · 2026-10-28 · @Maxi

Actualizado el 29 de octubre de 2026 con las decisiones del doc de confianza y economía.

## Resumen

Este doc fija qué tipos de changa existen, cómo se prueba cada una y qué reglas de cierre aplican cuando alguien calla, se va o discrepa. Parte de la idea cerrada en el doc anterior.

**Decisiones tomadas**

1. Todo resultado se prueba con foto, video o documento tomados desde la app; el solicitante define qué pruebas pide al publicar.
2. El silencio del solicitante tras la entrega libera el pago; el rechazo explícito abre un jurado.
3. Changa grupal: aportes libres con mínimo de 5% y tope de 50% por persona; una objeción con peso suficiente congela el pago.
4. Vínculos entre partes y jurados: protección probabilística con grafo on-chain, recusación sin causa y pool grande de jurados.
5. Aprobar es por silencio y no requiere transacción; el gas lo adelanta un relayer y se traslada al usuario como cargo de red. Coordinador opcional en grupos.
6. Pago por hitos opcional, con reglas explícitas para terminar antes de tiempo.

Además: categorías de riesgo con adicional que puede pedir el prestador, y la app declarada como intermediaria, sin relación laboral con ninguna de las partes. También se definieron el check-in por cercanía con verificación mutua, los materiales y la reposición ante abandono, y la moderación comunitaria de publicaciones prohibidas.

## Alcance y responsabilidad de la app

La app es un intermediario: conecta personas y un contrato custodia el dinero. Las condiciones, la calidad del trabajo y el cumplimiento son un acuerdo entre las partes, y la plataforma no responde por ellos.

- **El contrato custodia los fondos, no la plataforma:** ninguna cuenta de la empresa puede retener ni mover el dinero de una changa.
- **Términos de uso:** al registrarse, cada usuario acepta que actúa por cuenta propia y de forma independiente.
- **Sin órdenes de la plataforma:** la app no fija horarios, precios ni instrucciones de trabajo; lo acuerdan las partes en el chat.
- **Arbitraje por pares:** los jurados son usuarios, no empleados de la plataforma.

Una cláusula no alcanza por sí sola: lo que cuenta es cómo funciona el sistema en los hechos. Por eso el diseño evita que la plataforma actúe como empleador (ver Independencia laboral). No es asesoramiento legal; hay que validarlo con un profesional antes de operar con usuarios reales.

## Tipos de changa y evidencia

Los tipos se distinguen por una pregunta: ¿el solicitante está presente al terminar? Si está, revisa en el momento y firma el QR; si no está, el cierre depende de las pruebas.

| Tipo | Solicitante al terminar | Evidencia mínima | Hitos |
| --- | --- | --- | --- |
| Retiro de objetos y escombros | Suele estar ausente | Fotos antes y después; foto del destino o comprobante de entrega | No |
| Arreglos y reparaciones del hogar | Presente | Opcional: foto final | Según monto |
| Mudanzas y fletes | Presente | Opcional: foto de carga y de descarga | No |
| Limpieza y jardinería | Puede estar ausente | Fotos antes y después | No |
| Pintura y obras chicas | Presente o ausente | Fotos por etapa; video corto si el solicitante lo pide | Sí, obligatorios |
| Mandados y entregas | Ausente | Foto del comprobante o remito y foto de la entrega | No |
| Cuidado y paseo de mascotas | Suele estar ausente | Foto de ida y de vuelta en cada sesión | Por sesión |
| Clases y asistencia | Presente | Ninguna salvo que se pida | Por sesión |

El solicitante puede pedir evidencia adicional al publicar (por ejemplo un video corto). Lo pedido queda en las condiciones acordadas, registradas como hash, y no se puede cambiar después.

## Cómo se prueba el resultado

Todo se prueba con foto, video o documento. El tiempo y la presencia no necesitan otro método: se derivan de esas mismas pruebas.

- **Captura solo desde la app:** no se pueden subir archivos de la galería, para evitar fotos viejas o ajenas.
- **Metadatos firmados:** la app firma hora y ubicación junto con el archivo con la clave del usuario.
- **Hash on-chain:** en el contrato queda el hash de cada prueba y el archivo va cifrado a R2 y el hash garantiza que no se pueda alterar sin que se note; se conserva sin plazo de borrado (ver el doc de stack).
- **Duración y presencia derivadas:** la diferencia entre la foto de ida y la de vuelta da la duración de una sesión; la ubicación firmada, la presencia.
- **Testigo en montos altos:** sobre cierto monto, una tercera persona verifica el resultado o revisa las pruebas y firma un atestado (el umbral lo fija la DAO).
- **Documentos:** comprobantes y remitos se suben como foto tomada desde la app, no como archivo.

Limitación conocida: una foto firmada demuestra que se tomó en ese lugar y momento, no que el trabajo esté bien hecho. Por eso los criterios de aceptación se acuerdan antes, y el jurado juzga contra lo acordado.

## Plazos y desaparición

La regla central separa silencio de rechazo: callarse libera el pago, rechazar abre un jurado. Así el solicitante no puede retener el dinero ignorando al prestador, ni se le quita el derecho a objetar con motivos.

[Diagrama: tras la entrega · 3 reacciones posibles, 2 fallos del jurado]

Si el prestador no subió todas las pruebas pedidas, el plazo no corre y el flujo no avanza hasta que las suba.

| Situación | Regla |
| --- | --- |
| Solicitante presente que se niega a firmar | El prestador abre disputa en el momento, sin esperar plazo |
| Solicitante ausente que calla tras la entrega | Si el prestador subió todas las pruebas pedidas, el pago se libera solo al vencer el plazo de revisión |
| Solicitante que rechaza explícitamente | Va a jurado; no hay liberación automática |
| Prestador que llega y el solicitante no aparece | Si hizo check-in y esperó la ventana, cobra una compensación fija y el resto vuelve al solicitante (ver Cuando el solicitante no se presenta) |
| Prestador que desaparece tras acordar | Al vencer la fecha límite, el solicitante recupera todo y el prestador pierde reputación |
| Prestador que no subió todas las pruebas pedidas | No corre el plazo de aprobación automática |

**Plazos iniciales de revisión** (los ajusta la DAO)

- Changa corta con solicitante ausente: 24 horas.
- Changa larga, por cada hito: 72 horas.
- Una prórroga por única vez a pedido del solicitante, para casos de fuerza mayor.

Un pago por silencio emite una calificación neutra, no positiva, para que la reputación no premie el trabajo que nadie revisó.

**Cuando el solicitante no se presenta**

Aplica a changas donde el solicitante debe estar presente (mudanza, arreglo, clase). No aplica a retiros de objetos ni limpieza con solicitante ausente.

1. **Verificación mutua:** al encontrarse, uno escanea el QR del otro y ambos firman. Es la misma lógica del QR de pago aplicada al inicio y la señal más fuerte que tiene el sistema.
2. **Check-in unilateral:** si el solicitante no aparece no hay verificación mutua, y el prestador hace check-in por su cuenta.
3. **Espera:** el prestador espera una ventana fija (por ejemplo 20 minutos) y deja constancia de sus intentos de contacto en el chat.
4. **Cierre:** marca "no se presentó"; el contrato paga una compensación fija y el resto vuelve al solicitante.
5. **Disputa:** el solicitante puede afirmar que estaba; decide un jurado con la evidencia del check-in y del chat.

Si el solicitante cancela con 24 horas de anticipación no paga nada, pero solo en changas con fecha y hora fijadas al acordar y con un límite de 2 cancelaciones gratis por mes por cuenta y 1 por mes por pareja de solicitante y prestador; después cuesta 10%, como cualquier cancelación tras acordar. La compensación corre si cancela tarde o no aparece.

**Check-in por cercanía**

- La dirección va cifrada con la clave del prestador asignado; en el contrato solo queda un hash de la dirección con un valor aleatorio.
- Se valida con un radio de proximidad (por ejemplo 100 a 150 metros), no con ubicación exacta: el GPS tiene un error de decenas de metros, mayor en interiores.
- La app del prestador compara localmente y firma un atestado de "estuve dentro del radio" con la hora; el contrato recibe la firma, nunca la ubicación.
- Si hay disputa, la dirección se revela solo al jurado.

| Refuerzo del check-in unilateral | Qué aporta |
| --- | --- |
| Foto de la fachada o el portal tomada desde la app | Prueba más difícil de falsificar que una coordenada |
| Intentos de contacto en el chat | Muestran que el prestador avisó y esperó |
| Detección de ubicación simulada (Play Integrity, App Attest) | Bloquea el método más común |
| Compensación baja | Falsificar el check-in rinde poco |
| Disputa del solicitante | Si afirma que estaba, decide un jurado |
| Reputación y stake | Un check-in falso comprobado cuesta más de lo ganado |

Limitación: un check-in unilateral verificado por la app del propio prestador se puede falsificar. Por eso no carga con todo el peso: se apoya en estos refuerzos y en una compensación baja.

## Changa grupal

El riesgo de fondo es la difusión de responsabilidad: con varios aportantes, cada uno asume que otro va a revisar. La regla combina aportes acotados, aprobación por silencio y objeción con peso mínimo.

**Aportes**

- Cada aportante pone lo que quiera, con mínimo de 5% del total y tope de 50% por persona.
- Quien quiera poner más de la mitad tiene en realidad una changa individual con ayuda, y la publica como individual.
- Reembolsos y sobrantes se reparten proporcionalmente al aporte.
- Un aportante puede retirarse antes del acuerdo y recuperar su parte; después del acuerdo, los fondos quedan bloqueados.
- El prestador no puede aportar a su propia changa.

**Aprobación y objeción**

- Al vencer el plazo sin objeciones relevantes, el pago se libera.
- Para objetar hace falta representar al menos 25% del dinero o ser dos personas distintas, para que un aportante con poco peso no bloquee todo por capricho.
- La objeción congela el pago y abre un jurado; el que objetó paga el costo del arbitraje si el jurado la considera infundada.
- Si hay aprobaciones y objeciones, pesa el monto aportado; la minoría solo escala al jurado si llega al mínimo de objeción.
- Los valores (5%, 50%, 25%) los ajusta la DAO.

**Coordinador opcional**

- Se designa al publicar, propone al prestador y firma el QR.
- No se puede cambiar tras el acuerdo sin mayoría.
- Los demás aportantes conservan una ventana para vetar o objetar.

**Limitaciones que se aceptan**

- Quien no aporta igual se beneficia de una mejora colectiva (como el árbol de la cuadra); es inherente a la acción colectiva.
- Un coordinador puede confabularse con el prestador; la ventana de veto y el derecho a objetar lo limitan, pero no lo eliminan.

## Vínculos y conflicto de interés

No se puede probar que dos personas no se conocen. Se puede hacer que la colusión sea cara y poco probable; la protección es probabilística, no una garantía.

| Mecanismo | Qué hace |
| --- | --- |
| Grafo on-chain | Detecta wallets que se fondearon entre sí o repiten changas juntas; esos pares quedan excluidos como jurado entre sí y su calificación mutua pesa menos |
| Recusación sin causa | Cada parte puede rechazar a un número limitado de jurados sorteados sin dar razones |
| Pool grande y sorteo aleatorio | Para influir en un fallo habría que tener mayoría del jurado, no solo un amigo |
| Declaración de vínculo | Declarar un conflicto es gratis; ocultarlo y que se descubra cuesta stake y reputación |
| Niveles de cuenta (perfil, historial y documento) | Frenan la cuenta falsa, no la amistad real |

La reputación pondera por monto y por diversidad de contrapartes, así que repetir changas con las mismas personas suma cada vez menos.

## Gas

Quién paga el gas cambió respecto de la primera versión de este doc: un relayer adelanta el gas de todas las acciones y se traslada al usuario como un cargo de red al costo, en la moneda de la changa y visible antes de confirmar. En Sepolia es cero. El compromiso del grupo lo dan el dinero bloqueado y el costo de arbitraje, no el gas. El detalle está en el doc de confianza y economía.

| Acción | Transacción | Gas |
| --- | --- | --- |
| Depositar | Una por aportante | El relayer lo adelanta; el aportante paga el cargo de red |
| Aprobar | Ninguna: el silencio aprueba | Nadie |
| Objetar | Una por quien objeta | El relayer lo adelanta; quien objeta paga el cargo de red |
| Cobrar | Una del prestador | El relayer lo adelanta; el prestador paga el cargo de red |

Con esto un grupo de 30 vecinos solo genera transacciones al depositar y al objetar; no hace falta un mecanismo de lotes. Enviar por lotes queda como optimización opcional.

El relayer es un servidor que envía las transacciones que el usuario firma y paga el gas; el contrato verifica la firma, así que no puede falsificar nada.

## Changas largas: hitos y término anticipado

El trabajo puede dividirse en etapas con monto, criterio de aceptación y evidencia, fijados al acordar y registrados como hash. Los hitos son opcionales: no hay umbral de monto ni de duración, y quien publica decide. La app lo sugiere en trabajos grandes o largos.

**Antes de empezar**

- Los criterios son objetivos y verificables ("pared lisa y pintada en dos manos"), no subjetivos ("que quede lindo"). El jurado juzga contra lo acordado.
- Los materiales se resuelven al acordar: o los compra el solicitante, o se libera un anticipo al comenzar y el prestador sube los comprobantes.

**Si el solicitante quiere terminar a mitad de camino**

| Situación | Regla |
| --- | --- |
| Hitos ya verificados | Se pagan completos |
| Hito en curso | El prestador muestra evidencia de avance y cobra una parte proporcional |
| Hitos sin empezar | Vuelven al solicitante |
| Terminar sin causa | Compensación adicional chica, un porcentaje fijo de lo que quedaba, para que no sea gratis |
| Terminar con causa (incumple lo acordado) | Se objeta el hito; decide el jurado; si da la razón al solicitante, no hay compensación extra |
| Solo "no me gusta", pero cumple los criterios | Se paga lo que cumplió y el solicitante puede terminar con la compensación |

**Materiales**

Por defecto los compra el solicitante; el anticipo existe solo bajo condiciones.

| Opción | Cómo funciona | Cuándo se usa |
| --- | --- | --- |
| Los compra el solicitante | El prestador no adelanta ni maneja dinero para materiales | Por defecto |
| Anticipo acotado | Monto aparte del pago, liberado al empezar, con tope como porcentaje del total y comprobante de cada gasto tomado desde la app | Solo con reputación mínima o garantía depositada por el prestador |
| El prestador los pone | Cobra todo al terminar | Solo si el prestador lo elige; la carga financiera es suya |

**Si el prestador abandona**

Los hitos ya verificados se pagan igual. Pierde el hito en curso y reputación, salvo que muestre evidencia de avance sustancial y el jurado decida un pago parcial. Se considera abandono la renuncia explícita o la falta de actividad (sin check-in ni pruebas) pasada la fecha límite.

- Lo gastado en materiales con comprobante queda para el solicitante.
- Lo no gastado del anticipo se recupera de la garantía del prestador, o queda como deuda que bloquea su cuenta hasta saldarla.
- **Reposición:** el dinero restante queda en el contrato y la changa vuelve a pública con esos fondos; otro prestador la retoma y los hitos ya pagados quedan en el historial.

**Changas cortas, sin hitos**

No se despiden a mitad: solo se cancelan antes de empezar, con el costo pactado.

El porcentaje de compensación y el umbral de hitos figuran en el doc de confianza y economía.

## Riesgo

Cada changa pertenece a una categoría de riesgo que define si se permite, qué adicional puede pedir el prestador y qué requisitos tiene.

| Categoría | Ejemplos | Regla | Primera versión |
| --- | --- | --- | --- |
| Normal | Retiro de objetos, limpieza, mandados, paseo de mascotas, clases | Sin requisitos especiales | Permitida |
| Riesgo | Trabajos en altura, poda de árboles grandes, cargas pesadas | El prestador puede pedir un adicional por riesgo, visible antes del acuerdo | Permitida |
| Con matrícula | Gas, instalaciones eléctricas | Exige credencial profesional vigente | Fuera de alcance |
| Prohibida | Actividades ilegales, servicios que involucran a menores o salud, cualquier cosa que ponga en peligro a terceros | No se pueden publicar | Bloqueada |

**Adicional por riesgo**

- Lo propone el prestador al postularse y el solicitante lo acepta o no en el chat; queda registrado en las condiciones acordadas.
- La plataforma no lo fija ni lo recomienda, es parte del precio que acuerdan las partes.
- Lo que se permite y lo que se prohíbe lo vota la DAO.

**Moderación comunitaria de publicaciones prohibidas**

El contrato no puede saber qué es ilegal. Se combinan prevención y denuncia:

1. **Al publicar:** la categoría es obligatoria y sale de la lista permitida; "Otro" pasa por revisión antes de aparecer. Un filtro de palabras sirve de alerta, no de decisión.
2. **Denuncia:** cualquier usuario puede denunciar, depositando un stake chico que se devuelve si la denuncia es válida.
3. **Ocultamiento preventivo:** reportes de varias personas distintas, ponderadas por reputación, ocultan la publicación mientras se revisa.
4. **Revisión:** un jurado sorteado, el mismo mecanismo de las disputas, decide si es prohibida.
5. **Consecuencias si se confirma:**
  - La changa queda bloqueada y el solicitante recupera el dinero si no había acuerdo.
  - El publicador pierde reputación; ante reincidencia se bloquean la cuenta y el documento si fue verificado.
  - Los denunciantes cobran una recompensa chica; quien denuncia en falso pierde su stake.
  - Un prestador que ya trabajaba de buena fe no se penaliza: se congela la changa, se reembolsa y se paga lo hecho.

Limitaciones que se declaran:

- La blockchain no borra registros: se oculta el contenido en la app y la changa queda marcada como bloqueada, pero otra aplicación que lea el contrato podría mostrar algo.
- Los casos graves (por ejemplo, los que involucran a menores) no pueden depender solo de jurados de pares: requieren moderación humana de la plataforma y cumplir la obligación legal de reportar a las autoridades. Hay que validarlo con un profesional.

## Independencia laboral y limitaciones legales

Si una persona trabaja de forma regular para otra, con horarios impuestos, órdenes y sin poder rechazar tareas, la ley argentina puede ver una relación laboral encubierta aunque se pague por changa. Para evitarlo, el diseño se parece a trabajo independiente:

- Las partes acuerdan precio y condiciones entre ellas; la plataforma no fija horarios ni da órdenes.
- El prestador puede rechazar cualquier changa y no hay exclusividad.
- Se paga por trabajo terminado, no por hora disponible.
- La app es un intermediario, y cualquier arreglo es entre personas (ver Alcance y responsabilidad).

**Limitaciones que se declaran**

- **Changas recurrentes con la misma persona** (por ejemplo, limpieza de una casa varias veces por semana) son el caso más sensible. El trabajo doméstico en casas particulares tiene un régimen especial en Argentina (Ley 26.844). En la primera versión cada visita se trata como una changa independiente, sin prometer nada sobre este régimen.
- **Impuestos y registros del prestador** (monotributo u otros) son responsabilidad de cada usuario.
- **Las funciones de arbitraje y reputación** son las que más se parecen a un rol de la plataforma y las que más conviene revisar legalmente.
- Nada de esto es asesoramiento legal; antes de operar con usuarios reales hay que validarlo con un profesional.

## Estado de los temas pendientes

| Tema | Estado | Doc |
| --- | --- | --- |
| Efectivo | Resuelto: piso fijo más un porcentaje del monto declarado, cobrado al publicar | Confianza y economía |
| Confianza | Resuelto: niveles de cuenta, servicio de verificación con jurado de respaldo y voto por actividad | Confianza y economía |
| Moneda | Resuelto: varias monedas con stablecoins por defecto; wallet propia en el MVP | Confianza y economía |
| Gas | Resuelto: relayer y cargo de red al costo; Sepolia siempre para pruebas y desarrollo y Arbitrum en producción | Confianza y economía |
| Primer jurado | Resuelto: jurado semilla con requisitos de entrada | Confianza y economía |
| Valores concretos | Resueltos como valores iniciales, que se cambian por votación dentro de límites | Confianza y economía |
| Stack | Resuelto: React Native con Expo, por lo que Play Integrity y App Attest están disponibles; backend en Cloudflare; pruebas en R2 sin plazo de borrado y chat propio cifrado | Stack |

