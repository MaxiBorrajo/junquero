# Junquero: diseño de pantallas (borrador)

2026-10-30 · @Maxi

## Decisiones tomadas

| Tema | Decisión |
| --- | --- |
| Navegación | Cuatro pestañas (Mapa, Mis changas, Mensajes, Perfil) y botón Publicar siempre visible |
| Registro | Billetera, datos y selfie en vivo; sin mail ni contraseña; las dos opciones de la bienvenida solo definen la primera pantalla |
| Ver sin cuenta | Se puede ver el mapa y el detalle; el registro se pide al postularse o publicar |
| Vocabulario | "Changa" en es-AR; versión neutra después desde los archivos de traducción |
| Mapa | Pines con zona aproximada de unos 300 metros hasta firmar el acuerdo; MapLibre con MapTiler gratuito para el TP |
| Changas a distancia | Tipo Presencial o A distancia; chip fijo "A distancia · N" sobre el mapa; entregables con hash; sin QR; hasta 2 pedidos de cambios |
| Publicar | El pago en garantía se deposita al publicar |
| Acuerdo | Firma de las dos partes; vence a las 24 horas sin confirmación; contraoferta como propuesta aparte |
| Garantía del postulante | Sí; el monto se define en la especificación |
| Chat | Un chat por postulación; vista previa del mensaje descifrada en el dispositivo |
| Cierre | QR en persona; liberación automática a las 24 horas en changas cortas y a las 72 horas por hito en las largas; calificación con estrellas y comentario opcional |
| Reclamo | Acuerdo amistoso antes del jurado; una sola apelación |
| Jurado | 3 jurados en changas medias y 5 en las altas (las chicas se reparten 50/50), reemplazo hasta 3 rondas, árbitro de emergencia, tope de 2 casos activos |
| Administración | Un solo administrador (tu billetera) por ahora |
| Selfie | Verificación manual por el administrador |
| Plazo de respuesta a un reclamo | 72 horas |
| Gobernanza | Por rol de contrato; un solo administrador por ahora, sin cambios en las pantallas |
| Changa grupal | Entra al TP; pantallas 11.1 a 11.13; aportes de 5% a 50%, objeción desde 25% del dinero o dos personas |
| Hitos | Entran al TP; pantallas 12.1 a 12.12; opcionales; la app los sugiere sobre 5 días o 500 USDC |

## Navegación

La app tiene cuatro pestañas fijas abajo y un botón Publicar siempre visible sobre el mapa. Todo lo demás se abre desde ahí, sin menús ocultos.

| Pestaña | Para qué sirve | Pantallas que contiene |
| --- | --- | --- |
| Mapa | Encontrar changas cerca y postularse | Mapa, lista, filtros, detalle de la changa, postulación |
| Mis changas | Seguir lo que publiqué y lo que me tocó hacer | Publicadas, postulaciones, en curso, terminadas, reclamos |
| Mensajes | Hablar con la otra parte de cada acuerdo | Lista de chats, chat, adjuntos del chat |
| Perfil | Mi cuenta, mi reputación y la plataforma | Perfil, billetera, garantía, jurado, votaciones, ajustes |

Reglas de navegación:

- El botón Publicar abre el flujo de publicación desde cualquier pestaña y vuelve a donde estabas.
- Una changa tiene una sola pantalla de detalle; cambia de estado (abierta, acordada, en curso, cerrada, en reclamo) y muestra la acción que toca en cada uno.
- Cada notificación abre directo la pantalla de la changa que la generó.
- Sin cuenta se puede ver el mapa y el detalle; registrarse se pide recién al postularse o publicar.
- El panel de administración es una web aparte, no está en la app.

## Registro y perfil

Registrarse son cuatro pasos y tarda menos de dos minutos: billetera, datos, selfie en vivo y listo. No se pide mail ni contraseña; la identidad es la billetera.

| # | Pantalla | Qué muestra | Acción principal | Estados y errores |
| --- | --- | --- | --- | --- |
| 1.1 | Bienvenida | Logo y nombre, slogan a definir, dos botones: Quiero una mano / Quiero dar una mano | Continuar | Sin conexión: aviso y reintento |
| 1.2 | Conectar billetera | Explicación en una línea de qué es la billetera, botón Conectar MetaMask, enlace "No tengo billetera" | Conectar | Rechazada: "No pudimos conectar. No se movió plata. Probá de nuevo." |
| 1.3 | Confirmar que sos vos | Texto a firmar en lenguaje simple, sin mostrar hex | Confirmar | Firma cancelada: vuelve a 1.2 |
| 1.4 | Tus datos | Nombre, zona de trabajo (mapa con radio), foto de perfil opcional | Siguiente | Zona fuera de cobertura: se permite igual |
| 1.5 | Selfie en vivo | Cámara frontal con guía de encuadre, sin acceso a galería | Sacar selfie | Poca luz, rostro no detectado, cámara denegada |
| 1.6 | Revisión de selfie | Vista previa, repetir o enviar | Enviar | Subida fallida: guarda y reintenta |
| 1.7 | Listo | Perfil creado, estado de verificación de la selfie, acceso al mapa | Ir al mapa | Selfie pendiente: se puede explorar, no postularse |

Decisiones de diseño:

- Las dos opciones de la bienvenida solo definen la primera pantalla después de registrarse (Quiero una mano abre Publicar, Quiero dar una mano abre el mapa) y no se guardan como rol. Ambos roles conviven en la misma cuenta y el rol se define por changa.
- La selfie se guarda en R2 con acceso restringido; solo el jurado y el administrador la ven, y solo en un reclamo.
- "No tengo billetera" abre una guía de tres pasos para instalar MetaMask y vuelve a 1.2.
- Costos de red: en esta etapa no aparecen porque el relayer los cubre; se muestran solo si el usuario paga uno.

## Mapa y exploración

El mapa es la pantalla de inicio: muestra changas, no personas. Quien busca trabajo ve pines de las changas publicadas cerca y elige.

| # | Pantalla | Qué muestra | Acción principal | Estados y errores |
| --- | --- | --- | --- | --- |
| 2.1 | Mapa | Mapa a pantalla completa, pines con el monto, agrupación de pines al alejar, botón Publicar, botón Lista, botón Filtros | Tocar un pin | Sin ubicación: pide zona manual. Sin changas: "Todavía no hay changas acá. Publicá la primera." |
| 2.2 | Vista previa | Tarjeta inferior con título, monto, distancia y tipo, sobre el mapa | Abrir detalle | Changa tomada mientras se miraba: la tarjeta se marca como no disponible |
| 2.3 | Lista | Mismas changas en lista, orden por cercanía, monto o fecha | Abrir detalle | Carga paginada |
| 2.4 | Filtros | Tipo de changa, rango de monto, distancia, fecha, con adjuntos | Aplicar | Sin resultados: sugiere ampliar distancia |
| 2.5 | Detalle de la changa | Título, descripción, monto en garantía, fecha y horario, zona aproximada, adjuntos públicos, reputación de quien publica, botón Postularme, botón Reportar | Postularme | Ver estados abajo |
| 2.6 | Adjuntos | Galería de fotos y videos, visor de PDF y documentos, descarga | Abrir archivo | Archivo no soportado: se ofrece descargar |

Estados del detalle (2.5), con la acción que toca en cada uno:

| Estado | Lo ve quien busca | Lo ve quien publicó |
| --- | --- | --- |
| Abierta | Postularme | Ver postulaciones, editar, cancelar |
| Con postulación propia | Ver mi propuesta, retirarla | Comparar propuestas |
| Acordada | No disponible | Ir al chat, ver el acuerdo |
| En curso | No disponible | Ir a cerrar |
| Cerrada | Ver resumen | Ver resumen y calificar |
| En reclamo | Ver el reclamo | Ver el reclamo |

Decisiones de diseño:

- El pin muestra la zona aproximada (círculo de unos 300 metros) hasta que el acuerdo esté firmado; la dirección exacta se revela recién ahí.
- Los pines se agrupan con un número; al acercar se abren.
- El monto del pin es el que queda en garantía, nunca uno estimado.
- Proveedor del mapa pendiente (ver Preguntas abiertas).

## Publicar una changa

Publicar es un asistente de cinco pantallas con barra de progreso. El borrador se guarda solo y se puede retomar.

| # | Pantalla | Qué se completa | Estados y errores |
| --- | --- | --- | --- |
| 3.1 | Qué necesitás | Título, tipo de changa, descripción | Título vacío o muy corto: mensaje debajo del campo |
| 3.2 | Dónde y cuándo | Ubicación en el mapa, fecha, franja horaria, duración estimada | Fecha pasada no permitida |
| 3.3 | Fotos y archivos | Fotos, videos, PDF, Word, Excel, TXT, CSV; vista previa y orden | Archivo muy pesado, formato no admitido, subida con reintento |
| 3.4 | Cuánto pagás | Monto, qué evidencia se pide al cerrar, desglose de comisión y garantía | Monto menor al mínimo |
| 3.5 | Revisar y publicar | Resumen completo tal como lo va a ver quien busca, y depósito del pago en garantía con un permiso firmado | Publicar |
| 3.6 | Publicada | Confirmación, cómo se ve en el mapa, compartir | Ir a Mis changas |

Decisiones de diseño:

- En 3.4 el desglose es una línea por concepto: monto de la changa, comisión de la plataforma, total. Sin términos técnicos.
- El pago en garantía se deposita al publicar (pantalla 3.5), con un solo permiso firmado, y queda en el contrato hasta el cierre.
- Los adjuntos son públicos para cualquiera que vea la oferta; 3.3 lo avisa antes de subir.
- El hash de los adjuntos queda fijado en el acuerdo firmado; cambiarlos después invalida la oferta.
- Editar una changa con postulaciones avisa a los postulados y reinicia sus propuestas.
- Cancelar una changa abierta no tiene costo; una acordada pasa por el flujo de reclamo.

## Postulación y acuerdo

Quien busca trabajo se postula con una propuesta; quien publicó elige. El acuerdo se confirma con las dos partes y recién ahí se deposita el pago en garantía.

| # | Pantalla | Quién la ve | Qué muestra | Estados y errores |
| --- | --- | --- | --- | --- |
| 4.1 | Postularme | Quien busca | Monto propuesto (igual o contraoferta), mensaje, adjuntos opcionales, garantía requerida | Selfie sin verificar: bloquea con aviso |
| 4.2 | Garantía del postulante | Quien busca | Cuánto queda retenido y cuándo se libera, botón Confirmar | Saldo insuficiente: indica cuánto falta |
| 4.3 | Postulaciones recibidas | Quien publicó | Lista con reputación, monto, mensaje, distancia | Sin postulaciones: "Todavía nadie se postuló." |
| 4.4 | Perfil del postulante | Quien publicó | Reputación, changas hechas, reclamos, reseñas, botón Elegir y botón Hablar | Postulación retirada: se marca |
| 4.5 | Acuerdo | Ambas partes | Resumen: qué, dónde, cuándo, monto, evidencia pedida, adjuntos fijados, reglas de cancelación; botones Confirmar y Rechazar | Una sola parte confirmó: queda en espera con tiempo límite |
| 4.6 | Pago en garantía | Quien publicó | Ya depositado al publicar; muestra el monto en garantía y el estado | Fallo: "No pudimos confirmar. No se movió plata. Probá de nuevo." |
| 4.7 | Acordada | Ambas partes | "Quedó acordado. El pago está en garantía hasta que terminen.", dirección exacta, acceso al chat | Depósito pendiente de red: estado "Confirmando" |

Decisiones de diseño:

- La confirmación del acuerdo es la firma EIP-712 de las dos partes, presentada como un solo botón Confirmar sin mostrar datos técnicos; el detalle técnico queda en un enlace "Ver acuerdo completo".
- Si la otra parte no confirma en 24 horas, el acuerdo vence y la changa vuelve a estar abierta.
- Una vez confirmado por ambas partes, el acuerdo no se edita; cualquier cambio es un acuerdo nuevo.
- Las contraofertas se tratan como una propuesta distinta, no como cambio del monto publicado.

## Chat

Hay un chat por cada postulación, disponible desde que alguien se postula y hasta el cierre. Quien publica tiene un chat con cada postulante; quien busca tiene uno solo por changa. Los mensajes van cifrados de punta a punta.

| # | Pantalla | Qué muestra | Acción principal | Estados y errores |
| --- | --- | --- | --- | --- |
| 5.1 | Lista de chats | Un chat por postulación, agrupados por changa, con título, último mensaje, no leídos y estado de la changa | Abrir chat | Sin chats: "Cuando te postules o te postulen, hablan acá." |
| 5.2 | Chat | Mensajes, encabezado con la changa y su estado, campo de texto, adjuntar, acceso al detalle | Enviar | Enviando, enviado, sin conexión con reintento |
| 5.3 | Adjuntos del chat | Fotos y archivos privados entre las dos partes | Enviar archivo | Archivo pesado o no admitido |
| 5.4 | Acciones rápidas | Compartir ubicación exacta, "Ya llegué", "Necesito más tiempo" | Elegir | Solo disponible con acuerdo firmado |
| 5.5 | Reportar conversación | Motivo y mensajes elegidos para compartir con el jurado | Enviar reporte | Confirmación de que se comparte solo lo elegido |

Decisiones de diseño:

- El cifrado usa libsodium con claves ligadas a la billetera; se explica una sola vez con "Solo ustedes dos pueden leer esto."
- Los mensajes viajan por un Durable Object y se guardan cifrados; el servidor no puede leerlos.
- En un reclamo, cada parte decide qué mensajes descifrar y aportar; el jurado solo ve eso.
- Antes del acuerdo, el chat no muestra la dirección exacta ni permite compartirla.
- Al acordarse la changa, los chats con los postulantes no elegidos pasan a solo lectura y se les avisa. Un chat cerrado queda de solo lectura.

## Hacer la changa y cerrarla

El cierre es el momento más delicado: libera plata. Por eso es un flujo lineal, con una acción por pantalla y confirmación explícita.

| # | Pantalla | Quién | Qué muestra | Estados y errores |
| --- | --- | --- | --- | --- |
| 6.1 | Changa en curso | Ambas | Estado, cuenta regresiva a la fecha, dirección exacta, chat, acciones | Retraso: aviso a la otra parte |
| 6.2 | Llegada | Quien trabaja | Botón "Llegué" que registra hora y ubicación | Fuera de zona: advierte y deja continuar con motivo |
| 6.3 | Evidencia | Quien trabaja | Fotos o videos del trabajo según lo pedido en el acuerdo, con hash fijado al subir | Falta evidencia pedida: no deja cerrar. Subida con reintento |
| 6.4 | Marcar como terminada | Quien trabaja | Resumen, evidencia cargada, botón Terminé | Cancelable antes de confirmar |
| 6.5 | Revisar el trabajo | Quien publicó | Evidencia, acuerdo, botones Está todo bien y Tengo un problema | Sin respuesta en 24 horas (changa corta) o 72 horas por hito (changa larga): se libera solo |
| 6.6 | QR de liberación | Quien publicó | Código QR firmado, válido por tiempo limitado, para mostrar en persona | QR vencido: se genera otro |
| 6.7 | Escanear QR | Quien trabaja | Cámara que lee el QR y confirma | QR inválido o vencido; sin cámara: ingreso manual de código |
| 6.8 | Pago liberado | Ambas | "Listo, se liberó el pago.", monto recibido, garantía devuelta, botón Calificar | Confirmando en red: estado intermedio |
| 6.9 | Calificar | Ambas | Estrellas y comentario opcional | Se puede omitir |

Decisiones de diseño:

- El QR contiene la firma de quien publicó para liberar el pago; quien trabaja lo envía al contrato con el relayer. Es el camino feliz y no depende de que ambos estén conectados al mismo tiempo, salvo para mostrar y leer el código.
- Si no pueden verse en persona, "Está todo bien" en 6.5 libera el pago a distancia.
- Sin acción de quien publicó, el pago se libera automáticamente a las 24 horas en changas cortas o a las 72 horas por hito en changas largas; el plazo se muestra siempre.
- "Tengo un problema" abre el flujo de reclamo (sección siguiente) y congela el pago.
- La evidencia queda en R2; su hash se registra on-chain al cierre o al abrirse un reclamo.

### Changas a distancia

Una changa puede ser presencial o a distancia (una página web, un diseño, una traducción). Cambian estas pantallas:

| Pantalla | Cambio en una changa a distancia |
| --- | --- |
| 3.1 | Se elige Presencial o A distancia |
| 3.2 | Sin ubicación; se pide plazo de entrega en lugar de franja horaria |
| 2.1 y 2.3 | No tiene pin. El mapa muestra un chip fijo arriba, "A distancia · N", que abre la lista de remotas; la lista también se alcanza con el filtro A distancia |
| 2.5 y 4.7 | Sin zona ni dirección; muestra el plazo de entrega |
| 6.2 | No existe Llegada; se reemplaza por un Empecé opcional |
| 6.3 | La evidencia son entregables: archivos subidos con hash, y enlaces guardados con captura |
| 6.5 | Quien publica puede pedir cambios (hasta 2 rondas) antes de aprobar o reclamar |
| 6.6 y 6.7 | El QR no aplica; el pago se libera con Está todo bien o por liberación automática |

## Reclamo y jurado

Un reclamo congela el pago y lo resuelve un jurado de usuarios con votación en dos fases (commit y reveal). Las dos partes aportan pruebas; el jurado no ve identidades hasta el veredicto.

| # | Pantalla | Quién | Qué muestra | Estados y errores |
| --- | --- | --- | --- | --- |
| 7.1 | Abrir reclamo | Cualquiera de las partes | Motivo, descripción, evidencia, mensajes del chat a compartir, costo de garantía del reclamo | Plazo vencido: no permite abrir |
| 7.2 | Reclamo abierto | Ambas | Estado, pago congelado, tiempos de cada etapa, botón Responder | Sin respuesta de la otra parte en el plazo: sigue igual |
| 7.3 | Responder reclamo | La otra parte | Versión propia, evidencia, mensajes a compartir | Cierre del plazo: cuenta regresiva visible |
| 7.4 | Acuerdo amistoso | Ambas | Propuesta de división del pago antes del jurado | Aceptada: se libera según lo acordado |
| 7.5 | Convocatoria al jurado | Jurado | Aviso de que fue sorteado, resumen sin identidades, garantía para participar | Rechazo o ausencia: se sortea otro |
| 7.6 | Revisar el caso | Jurado | Acuerdo, evidencia de ambas partes, mensajes compartidos, hashes verificados | Archivo que no coincide con el hash: alerta visible |
| 7.7 | Votar | Jurado | Opciones de veredicto y botón Confirmar voto (commit) | Voto ya enviado: espera el reveal |
| 7.8 | Revelar voto | Jurado | Botón Revelar dentro de la ventana de tiempo | No revelar: pierde garantía |
| 7.9 | Veredicto | Ambas partes y jurado | Resultado, reparto del pago, pago liberado, enlace a la apelación | Apelación disponible por un plazo corto |
| 7.10 | Apelación | Ambas partes | Nuevo jurado ampliado, costo adicional | Una sola apelación por reclamo |

Decisiones de diseño:

- El jurado ve evidencia con nombres reemplazados por Parte A y Parte B; las identidades se revelan al cerrar.
- Quien gana recupera la garantía del reclamo; quien pierde la cede al jurado y al fondo de la plataforma.
- Los jurados que votan con la mayoría ganan una recompensa; los que no revelan pierden garantía.
- Si el reclamo se originó por contenido de la oferta (adjuntos denunciados), el jurado o el administrador pueden bajar la oferta sin abrir un reclamo de pago.
- La interfaz explica el commit-reveal como "Primero guardás tu voto en secreto. Después lo mostrás."

### Reglas del jurado

- Tamaño según el monto: changa chica (hasta 20 USDC) se reparte 50/50 sin jurado; media (20 a 300 USDC), 3 jurados; alta (más de 300 USDC), 5 jurados. Decide la mayoría de los votos revelados.
- Elegibles: jurados anotados con garantía depositada, que no sean parte y que no hayan tenido changas con ninguna de las dos partes.
- Aceptación: 24 horas por invitación; si rechazan o no responden, se sortea un reemplazo, hasta 3 rondas.
- Sin jurados suficientes: si tras 3 rondas quedan menos de 3, resuelve un árbitro de emergencia (administrador) con motivo publicado; la resolución es apelable cuando haya jurado disponible.
- Un jurado puede estar en varios reclamos a la vez, con un tope de 2 casos activos.
- Al lanzamiento hay pocos jurados: se define un mínimo de jurados anotados para activar el sistema; por debajo, todos los reclamos van al árbitro de emergencia.

## Perfil, reputación y votación

La pestaña Perfil junta lo propio (cuenta, billetera, garantía) y lo comunitario (jurado y votaciones de la plataforma).

| # | Pantalla | Qué muestra | Acción principal | Estados y errores |
| --- | --- | --- | --- | --- |
| 8.1 | Mi perfil | Foto, nombre, reputación, changas hechas y publicadas, reclamos, insignias | Editar | Selfie sin verificar: aviso fijo |
| 8.2 | Perfil público | Lo que ve otro usuario: reputación, reseñas, changas, zona general | Reportar usuario | Cuenta suspendida: aviso |
| 8.3 | Reseñas | Lista de calificaciones y comentarios, filtros por rol | Ver detalle | Sin reseñas: "Todavía no tiene reseñas." |
| 8.4 | Billetera | Saldo, movimientos en lenguaje simple (cobro, garantía, devolución), dirección | Copiar dirección | Movimiento pendiente: estado Confirmando |
| 8.5 | Mi garantía | Cuánto está retenido, en qué changas, cuándo se libera | Retirar lo libre | Nada libre: botón deshabilitado con motivo |
| 8.6 | Ser jurado | Requisitos, garantía, recompensas, historial como jurado | Anotarme | No cumple requisitos: indica cuáles faltan |
| 8.7 | Votaciones de la plataforma | Propuestas abiertas de parámetros y fondo, peso del voto, plazo | Votar | Peso de voto cero: explica por qué |
| 8.8 | Detalle de propuesta | Qué cambia, quién lo propone, resultado parcial, espera antes de aplicarse | Votar a favor, en contra o abstenerse | Cierre de votación: resultado final |
| 8.9 | Ajustes | Idioma, notificaciones, zona de trabajo, cerrar sesión, borrar datos del dispositivo | Guardar | Cambio de zona con changas en curso: advierte |

Decisiones de diseño:

- La reputación se muestra como un número y un nivel con nombre, y se puede abrir para ver de dónde sale (cierres, reclamos ganados y perdidos, antigüedad).
- El saldo se muestra en la moneda del pago con equivalencia en pesos solo como referencia.
- La votación de la plataforma explica cada propuesta en una frase antes del detalle técnico.
- El idioma arranca en español de Argentina; todos los textos están en archivos de traducción para sumar una versión neutra después.

## Panel de administración

Es una web aparte, para escritorio, con acceso solo para billeteras autorizadas. Sirve para moderar y observar; no mueve fondos.

| # | Pantalla | Qué muestra | Acción principal |
| --- | --- | --- | --- |
| 9.1 | Ingreso | Conexión con billetera autorizada y firma | Entrar |
| 9.2 | Resumen | Changas por estado, volumen en garantía, reclamos abiertos, usuarios nuevos, salud del relayer y del indexador | Abrir sección |
| 9.3 | Changas | Lista con filtros, detalle, adjuntos, historial | Bajar oferta |
| 9.4 | Reportes de contenido | Cola de adjuntos y ofertas denunciadas, con vista previa | Aprobar o bajar |
| 9.5 | Usuarios | Búsqueda, reputación, estado de verificación, reclamos | Suspender o reactivar |
| 9.6 | Verificación de selfies | Cola de selfies pendientes o dudosas | Aprobar o rechazar |
| 9.7 | Reclamos y jurados | Reclamos por etapa, jurados sorteados, plazos vencidos | Ver caso, reasignar jurado |
| 9.8 | Fondo y parámetros | Saldo del fondo de la plataforma, parámetros vigentes, propuestas en espera | Ver propuestas |
| 9.9 | Métricas | Los indicadores definidos en el documento de métricas, con rango de fechas | Exportar |
| 9.10 | Registro de acciones | Qué hizo cada administrador y cuándo | Filtrar |

Decisiones de diseño:

- Toda acción de moderación queda registrada con billetera, fecha y motivo obligatorio.
- Bajar una oferta no borra el archivo: lo oculta y conserva el hash.
- El administrador no mueve fondos ni cambia parámetros por su cuenta; solo puede resolver un reclamo sin jurado como árbitro de emergencia, y el contrato aplica el reparto.
- La interfaz usa la misma paleta y Outfit, con densidad de tabla pensada para escritorio.

### Quién administra

- Por ahora hay un solo administrador: tu billetera, definida en el despliegue de los contratos.
- Cumple las dos funciones: moderación y árbitro de emergencia.
- El panel pide firmar con esa billetera y el backend verifica la dirección en cada acción.
- Sumar más administradores queda para después, por gobernanza.

## Notificaciones

Cada notificación abre la pantalla de la changa que la generó. Los textos usan el vocabulario de marca.

| Evento | Para quién | Texto |
| --- | --- | --- |
| Nueva postulación | Quien publicó | Alguien se postuló a tu changa. |
| Te eligieron | Quien busca | Te eligieron para una changa. Confirmá el acuerdo. |
| Acuerdo por vencer | Ambas | El acuerdo vence en 2 horas. |
| Pago en garantía | Ambas | Quedó acordado. El pago está en garantía hasta que terminen. |
| Mensaje nuevo | Ambas | Nombre: primeras palabras del mensaje. (el texto se descifra en el dispositivo) |
| Marcada como terminada | Quien publicó | Terminaron tu changa. Revisá el trabajo. |
| Liberación automática próxima | Quien publicó | En 6 horas se libera el pago si no respondés. |
| Pago liberado | Ambas | Listo, se liberó el pago. |
| Reclamo abierto | Otra parte | Abrieron un reclamo. Tenés 72 horas para responder. |
| Fuiste sorteado | Jurado | Te tocó ser jurado en un caso. |
| Revelar voto | Jurado | Es hora de mostrar tu voto. |
| Veredicto | Ambas | El jurado resolvió tu reclamo. |
| Nueva votación | Con voto | Hay una propuesta para votar. |
| Aporte registrado | Aportantes y quien publica | Sumaron un aporte. Falta N% para la meta. |
| Prestador propuesto | Aportantes | Propusieron a alguien para la changa. Podés vetar hasta mañana. |
| Objeción en curso | Aportantes | Alguien objetó el trabajo. Podés sumarte. |
| Hito para revisar | Quien publicó | Terminaron un hito. Revisalo antes de que se libere solo. |
| Changa terminada antes de tiempo | Quien trabaja | Terminaron la changa. Subí tu avance para cobrar lo que corresponde. |

Decisiones de diseño:

- Push como canal principal; el mail es opcional y se activa en Ajustes, sin contenido sensible.
- La vista previa del mensaje se descifra en el dispositivo; el push viaja cifrado y el servidor nunca ve el texto. Si no se puede descifrar, se muestra "Tenés un mensaje nuevo." La vista previa se puede apagar en Ajustes.
- Hay un centro de notificaciones con historial dentro de la app, accesible desde el ícono de campana en el mapa.

## Changa grupal

Varias personas juntan dinero para un mismo trabajo (arreglar la plaza, pintar el frente de la cuadra). Se elige Grupal al publicar. Las pantallas de postulación, chat, evidencia y reclamo son las mismas que en una changa individual; acá van solo las que cambian o se agregan.

| # | Pantalla | Quién | Qué muestra | Estados y errores |
| --- | --- | --- | --- | --- |
| 11.1 | Elegir tipo | Quien publica | En 3.1, junto a Presencial y A distancia: Individual o Grupal. Grupal pide la meta total | Si quiere aportar más de la mitad: sugiere publicarla como individual |
| 11.2 | Datos de la changa grupal | Quien publica | Campos de 3.x más meta total, aporte propio opcional y coordinador opcional | Aporte propio fuera de 5% a 50% de la meta: error con el rango |
| 11.3 | Juntando aportes | Aportantes y quien publica | Barra de progreso hacia la meta, aportantes con su porcentaje, enlace para compartir, botón Aportar | La changa no es pública ni recibe postulaciones hasta alcanzar la meta |
| 11.4 | Aportar | Aportante | Monto con mínimo 5% y tope 50% de la meta, firma del permiso, cargo de red al costo, visible antes de confirmar | Monto fuera de rango; saldo insuficiente; si queda poco para la meta, ofrece el monto restante |
| 11.5 | Retirar aporte | Aportante | Monto a recuperar y aviso de que, si la meta deja de cumplirse, la changa vuelve a Juntando aportes | Después del acuerdo: botón deshabilitado, "Los fondos quedan bloqueados" |
| 11.6 | Elegir prestador | Coordinador, o quien publicó si no hay | Postulaciones recibidas y botón Proponer | El prestador no puede estar entre los aportantes |
| 11.7 | Propuesta de prestador | Aportantes | Prestador propuesto, reputación, precio y plazo; botón Vetar durante la ventana | Veto: se descarta la propuesta y se vuelve a las postulaciones. Sin veto al vencer la ventana: pasa al acuerdo |
| 11.8 | Acuerdo grupal | Prestador y coordinador (o quien publicó) | Acuerdo con la lista de aportantes y montos; firma de ambas partes | Vence igual que el acuerdo individual |
| 11.9 | Revisión grupal | Aportantes | Evidencia, plazo de revisión, dinero aprobado y dinero objetado hasta ahora; botones Está todo bien y Objetar | Sin objeciones relevantes al vencer el plazo: se libera el pago |
| 11.10 | Objetar | Aportante | Motivo obligatorio, evidencia opcional, aviso de que si el jurado la considera infundada paga el costo del arbitraje | Con menos de 25% del dinero y sin otra persona: se guarda como objeción pendiente y se invita a otros a sumarse |
| 11.11 | Sumarme a una objeción | Aportante | Objeción abierta, motivo, dinero acumulado y personas | Al llegar a 25% del dinero o a dos personas: se congela el pago y se abre el reclamo con jurado |
| 11.12 | Cambiar coordinador | Aportantes | Propuesta de nuevo coordinador y votación por dinero | Requiere mayoría; hay ventana de veto; solo si no hay un reclamo abierto |
| 11.13 | Pago liberado grupal | Todos | Monto pagado, sobrantes devueltos en proporción al aporte, botón Calificar | Confirmando en red: estado intermedio |

### Decisiones de diseño

- Cada aportante hace su propio depósito en una transacción con permiso firmado y paga su cargo de red. El dinero queda en el contrato desde el aporte, por eso puede retirarse hasta el acuerdo.
- Cada aportante ve su parte como porcentaje y monto; el resto de los aportantes se muestra con nombre público y porcentaje.
- Quien aporta recibe las mismas notificaciones de revisión y liberación que quien publica, con el plazo siempre visible (24 horas en changas cortas, 72 horas por hito en largas).
- El QR de liberación lo firma el coordinador; sin coordinador, quien publicó. Si nadie lo escanea, rige la liberación automática.
- Los valores 5%, 50% y 25% se leen del contrato de parámetros; las pantallas nunca los escriben fijos.
- Propuesta a confirmar: sin coordinador, quien publicó propone al prestador. El cambio de coordinador se decide por mayoría de dinero, no de personas.

## Hitos y término anticipado

Aplica a las changas con hitos, que son opcionales (la app los sugiere sobre 5 días o 500 USDC). Las changas cortas no tienen estas pantallas y no se despiden a mitad: solo se cancelan antes de empezar. Funciona igual en changas individuales y grupales.

| # | Pantalla | Quién | Qué muestra | Estados y errores |
| --- | --- | --- | --- | --- |
| 12.1 | Plan de hitos | Quien publica | En 3.x: lista de hitos con nombre, monto, criterio de aceptación verificable, evidencia pedida y fecha. Ejemplo de redacción objetiva: "pared lisa y pintada en dos manos" | La suma de montos debe dar el total; criterio o evidencia vacíos: no avanza. Si la changa lo exige y no hay hitos: no se publica |
| 12.2 | Materiales | Quien publica | Dos opciones: los compra quien publica (por defecto) o los pone el prestador | El anticipo acotado quedó fuera del alcance |
| 12.3 | Ajustar el plan | Ambas partes | En la postulación, el prestador propone cambios a hitos, montos y materiales; se comparan con el plan original | Todo se fija al firmar el acuerdo; después no se edita |
| 12.4 | Acuerdo con hitos | Ambas partes | Resumen del plan, criterios, materiales y tabla de término anticipado; los criterios se registran como hash al firmar | Igual que el acuerdo común |
| 12.5 | Tablero de hitos | Ambas partes | Hitos con estado (pendiente, en curso, en revisión, pagado, reclamado), dinero pagado y dinero restante | Retraso: aviso a la otra parte |
| 12.6 | Comprobantes de materiales | Quien trabaja | Fuera del alcance: depende del anticipo | |
| 12.7 | Entregar hito | Quien trabaja | Criterios del hito junto a la evidencia a subir, botón Terminé el hito | Falta evidencia pedida: no deja entregar |
| 12.8 | Revisar hito | Quien publicó | Criterios acordados al lado de la evidencia, botones Está todo bien y Tengo un problema | Sin respuesta en 72 horas: el hito se libera solo. Un reclamo congela solo ese hito |
| 12.9 | Terminar la changa | Quien publicó | Elegir motivo (sin causa, o porque no cumple lo acordado) y ver el resultado: hitos verificados se pagan, hito en curso proporcional, hitos sin empezar vuelven, compensación adicional si es sin causa | Con causa: se objeta el hito y decide el jurado. Si solo dice "no me gusta" y el hito cumple los criterios, se trata como sin causa |
| 12.10 | Cobrar avance | Quien trabaja | Aviso de término anticipado, carga de evidencia de avance del hito en curso para el pago proporcional | Sin evidencia: no cobra por el hito en curso y puede reclamar |
| 12.11 | Abandono | Ambas partes | Se detecta por renuncia explícita o por inactividad (sin check-in ni pruebas) pasada la fecha límite; muestra qué se paga, qué se pierde | El prestador puede mostrar avance sustancial y pedir pago parcial al jurado |
| 12.12 | Reponer la changa | Quien publicó | Dinero restante, hitos pagados en el historial y botón Volver a publicar | La changa vuelve a pública con esos fondos; sin fondos restantes no aparece |

### Decisiones de diseño

- Los criterios de aceptación se muestran siempre junto a la evidencia, porque el jurado juzga contra lo acordado.
- La compensación por término sin causa se muestra como monto antes de confirmar; nunca se descuenta por sorpresa.
- Los umbrales de hitos y el porcentaje de compensación se leen del contrato de parámetros.

## Preguntas abiertas

Todas las preguntas quedaron resueltas; las decisiones están al inicio del documento.

| # | Pregunta | Pantallas afectadas | Mi propuesta |
| --- | --- | --- | --- |
| 1 | Proveedor del mapa | 2.1, 2.2, 3.2 | MapLibre con MapTiler en plan gratuito para el TP; revisar si hay uso comercial |
| 2 | Zona aproximada hasta firmar el acuerdo | 2.1, 2.5, 4.7 | Sí, círculo de unos 300 metros |
| 3 | Pago en garantía se deposita al publicar | 3.4, 4.6 | Al publicar, como en el diseño original: el prestador ve que el dinero existe |
| 4 | Plazo de liberación automática tras marcar terminada | 6.5 | 24 horas en changas cortas y 72 horas por hito en las largas |
| 5 | Vencimiento del acuerdo sin confirmación de la otra parte | 4.5 | 24 horas |
| 6 | Garantía también para quien busca trabajo (no solo para el jurado) | 4.2 | Sí, para desalentar abandonos; el monto lo definimos en la especificación |
| 7 | Un solo rol por cuenta o ambos | 1.1 | Ambos, definido por changa |
| 8 | Acuerdo amistoso antes del jurado | 7.4 | Incluirlo; reduce carga al jurado |
| 9 | Apelación del veredicto | 7.10 | Una sola, con costo adicional |
| 10 | Ingreso sin cuenta para ver el mapa | 1.1, 2.1 | Sí, registro al postularse o publicar |
| 11 | Calificación con estrellas y comentario | 6.9 | Estrellas obligatorias, comentario opcional |
| 12 | Verificación de selfie: manual por el administrador o con el jurado | 1.6, 9.6 | Manual por el administrador en el MVP |

| # | Pregunta | Mi propuesta |
| --- | --- | --- |
| 13 | Vocabulario: "changa" dentro de la app | Sí en es-AR, que es el idioma decidido; la versión neutra usará "trabajo" o "tarea" desde los archivos de traducción |
| 14 | Las dos opciones de la bienvenida | Solo definen la primera pantalla, sin guardarse como rol |
| 15 | Changas a distancia | Como en la sección Changas a distancia |
| 16 | Reglas del jurado | 3 o 5 jurados según el monto, reemplazo hasta 3 rondas, árbitro de emergencia, tope de 2 casos |
| 17 | Roles de administrador | Moderador y Árbitro de emergencia en el contrato, cambios por gobernanza |

No hay un cambio pendiente sobre la vista previa de mensajes: quedó con descifrado en el dispositivo.

Después de tu revisión, el siguiente documento sería la especificación técnica (contratos, tablas de D1 y API), antes de empezar el código.

