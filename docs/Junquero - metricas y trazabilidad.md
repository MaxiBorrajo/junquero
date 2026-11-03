# Junquero: métricas y trazabilidad

Bloque 4 de las decisiones de diseño · cerrado · 2026-10-29 · @Maxi

## Decisiones tomadas

Todo lo decidido en este doc. Quedan abiertas dos cosas: qué funciones del panel entran en el TP, que se define en el doc de alcance, y la validación legal con un profesional.

| # | Tema | Decisión | Detalle en |
| --- | --- | --- | --- |
| 1 | Qué se mide | 22 métricas en cinco áreas, cada una atada a una decisión | Qué se mide |
| 2 | Dónde se guardan los datos | Eventos de la cadena en D1 (solo agregar), contadores en Analytics Engine, indicadores diarios en D1 y archivo diario en R2, sin SDK de terceros | De dónde salen los datos |
| 3 | Retención | Eventos y auditoría sin plazo, con archivo diario en R2 | De dónde salen los datos |
| 4 | Gas en Sepolia | Se registra como métrica; el costo real en Arbitrum se mide al salir a producción | Mínimo de medición para el TP |
| 5 | Privacidad de las métricas | Tres clases de datos: público, interno y prohibido | Privacidad de las métricas |
| 6 | Tablero | Propio, que lee de D1 | Tableros y alertas |
| 7 | Indicadores de proporción | Siempre los casos sobre el total; los mínimos para actuar se definen con el piloto | Tableros y alertas |
| 8 | Alertas | Push en la app con correo de respaldo | Tableros y alertas |
| 9 | Acceso | Cuenta de administración sin fondos, distinta de la que firma el multisig; las comisiones van al contrato Tesoro | Panel de administración |
| 10 | Indicadores públicos | Comisión, reserva y volumen | Panel de administración |
| 11 | Novedades | Feed en la app y push solo para lo importante; los cambios de parámetros votados aparecen solos y las novedades no se editan | Panel de administración |
| 12 | Panel de administración | Poder mínimo: lee, comunica, opera el servidor y propone; lo que mueve dinero o decide un caso está en la cadena | Panel de administración |
| 13 | Interruptor de emergencia | Detiene solo las changas nuevas y nunca retiene dinero ya depositado | Panel de administración |
| 14 | Moderación | Ocultar es provisorio, con motivo y reversible, hasta que decida la votación | Panel de administración |
| 15 | Tesoro | Ingresos, gastos, saldo, disponible para retirar e histórico; retiros limitados en el contrato por una reserva mínima en USDC votada | Panel de administración |
| 16 | Gastos fuera de la cadena | Se cargan a mano en un libro de solo agregar, con recordatorio mensual | Panel de administración |
| 17 | Recarga del relayer | A mano al principio: retiro del multisig, compra de ETH y envío al relayer, anotado como gasto | Panel de administración |
| 18 | Monedas que no son stablecoins | Se muestran por separado hasta decidir de dónde sale el precio | Panel de administración |
| 19 | Explorador de changas | Tabla con filtros, orden y exportación a CSV, sin consulta SQL libre; la zona se guarda por barrio o partido, nunca por dirección | Panel de administración |

## Resumen

Se mide para decidir: cada métrica de este doc está atada a una decisión de los otros docs, como la comisión, el cargo de red, el umbral de changa chica, la retención de pruebas o el tamaño del jurado. La trazabilidad tiene dos partes: seguir una changa de punta a punta y dejar registro de lo que hace el sistema. Todo cabe en las capas gratuitas de Cloudflare ya elegidas, sin herramientas de terceros que reciban datos de las personas.

| Pieza | Propuesta | Costo estimado |
| --- | --- | --- |
| Eventos de la changa | Los contratos publican cada paso como evento y el indexador los copia a una tabla de solo agregar en D1 | 0 dentro del plan gratuito de D1: 5 GB, 5 millones de filas leídas y 100.000 escritas por día ([Cloudflare](https://www.cloudflare.com/plans.md)) |
| Métricas operativas | Contadores y tiempos que escribe el Worker en Analytics Engine: gas por acción, errores, cola de verificaciones | 0 hasta 100.000 puntos escritos y 10.000 consultas por día ([Cloudflare](https://workers.cloudflare.com/pricing/.md)) |
| Indicadores por día | Una tarea programada calcula los indicadores por changa y por día y los guarda en D1 | 0 |
| Archivo histórico | Exportación diaria a R2 en JSON y CSV, porque los registros de Workers duran pocos días | Centavos |
| Auditoría de acciones | Tabla de solo agregar con quién cambió qué y cuándo | 0 |
| Tablero y alertas | Una página de administración servida por el Worker, con alertas a quien administra | A definir |

Las decisiones que quedan para vos están en Preguntas abiertas.

## Principios de medición

Siete reglas para medir sin sumar costo ni exponer datos.

- **Medir por decisión:** si una métrica no cambia ninguna decisión, no se mide.
- **Por changa antes que en total:** cada costo se guarda con el identificador de su changa, así se puede recalcular cualquier promedio.
- **Eventos antes que estados:** se guarda el hecho con su hora (acordada, entregada, objetada) y no solo el estado actual, para reconstruir la historia.
- **Solo agregar:** las tablas de eventos y de auditoría no se editan ni se borran; una corrección es un registro nuevo.
- **Datos de personas, los mínimos:** las métricas usan identificadores internos y agregados, y nunca contenido de chat, pruebas, documentos ni ubicación exacta.
- **Sin terceros:** la app no lleva SDK de analítica de terceros; las métricas salen del backend y de la cadena.
- **Medir cuesta casi nada:** capas gratuitas y, si hace falta, muestreo. No se duplica lo que los contratos ya registran: se indexa.

## Qué se mide

Veintidós métricas en cinco áreas, cada una atada a la decisión que informa. Se guardan con su fecha y su changa; los totales y los promedios se calculan, no se guardan.

| Área | Métrica | Decisión que informa | Fuente |
| --- | --- | --- | --- |
| Costos | Gas por changa y por acción (publicar, acordar, liberar, disputa) | Cargo de red y revisión de la red | Recibos de las transacciones del relayer |
| Costos | Transacciones por changa | Rediseño de contratos; el objetivo es 3 en el caso común | Eventos de la cadena |
| Costos | Almacenamiento por changa y acumulado | Pasar las pruebas viejas a la clase de acceso poco frecuente | Registro de subidas a R2 |
| Costos | Llamadas de RPC por changa | Cuándo se supera el plan gratuito de Alchemy | Contadores del Worker y panel del proveedor |
| Costos | Solicitudes, filas y operaciones de Cloudflare por día | Pasar al plan de 5 USD por mes | Contadores del Worker |
| Costos | Verificaciones adelantadas y recuperadas | Tope mensual de gasto en verificaciones | Cola y avisos de Didit |
| Embudo | Changas publicadas, con postulaciones, acordadas, entregadas y cerradas | Dónde se cae el proceso | Eventos |
| Embudo | Tiempo entre publicar y acordar, y entre entregar y cerrar | Plazos de revisión de 24 y 72 horas | Eventos |
| Embudo | Cancelaciones por momento y compensaciones cobradas | Costos de cancelar | Eventos |
| Embudo | Cierres por silencio y cierres por QR | Plazo de silencio | Eventos |
| Dinero | Volumen, monto promedio y mediana por tamaño de changa | Umbrales de chica, media y alta | Eventos del escrow |
| Dinero | Comisión efectiva y comisión recaudada | Fórmula de comisión y sostenibilidad | Eventos del escrow |
| Dinero | Reserva en meses de costos | Estados de la reserva | Tesoro y costos |
| Dinero | Pagos por la plataforma y en efectivo, con la tarifa cobrada | Piso y porcentaje de la tarifa en efectivo | Eventos y registro de efectivo |
| Confianza | Disputas por tamaño, tiempo de resolución, apelaciones y quién gana | Umbral de changa chica y tamaño del jurado | Eventos del tribunal |
| Confianza | Jurados elegibles, que no revelan y tiempo de respuesta | Stake y tamaño del grupo de jurados | Eventos y notificaciones |
| Confianza | Cuentas por nivel y personas nuevas por changa | Depósito de entrada | Credenciales |
| Confianza | Verificaciones de documento: aprobadas, rechazadas, en cola y duplicadas | Cola y crédito de Didit | Avisos de Didit |
| Confianza | Señales de changas falsas: misma contraparte repetida y montos mínimos | Capas contra changas falsas | Eventos |
| Sistema | Saldo del relayer y gasto diario | Recargas y límite diario | Cuenta del relayer |
| Sistema | Notificaciones enviadas, entregadas y abiertas | Qué avisos sirven | Respuestas de Expo |
| Sistema | Errores y tiempos de respuesta de la API | Estabilidad | Registros de Workers y Analytics Engine |

## Trazabilidad

Hay dos clases: la de la changa, que cuenta qué pasó con un trabajo de punta a punta, y la del sistema, que deja registro de quién hizo qué en la plataforma.

[Diagrama: ciclo de una changa · 4 pasos, qué queda dentro y fuera de la cadena]

Lo público alcanza para probar que algo pasó y cuándo; el detalle queda cifrado y solo lo ven las partes y, si hay disputa, el jurado, que puede comprobar que cada archivo coincide con su hash.

**Qué se traza y dónde queda**

| Qué se traza | Dónde queda | Quién lo ve | Cuánto dura |
| --- | --- | --- | --- |
| Pagos, acuerdos, liberaciones, cancelaciones, disputas y votos | En la cadena | Cualquiera, con la wallet como alias | Para siempre |
| Hash de las pruebas y de las condiciones | En la cadena | Cualquiera, sin el contenido | Para siempre |
| Cambios de parámetros | En la cadena, con la votación y la espera | Cualquiera | Para siempre |
| Pruebas y chat | R2 y Durable Objects, cifrados | Las partes y, en una disputa, el jurado | Sin plazo; se borran a pedido |
| Copia de los eventos de la cadena | Tabla de solo agregar en D1 | Quien administra | Sin plazo |
| Acciones del backend: envíos del relayer, URLs firmadas y altas de verificación | Registro de auditoría en D1 | Quien administra | Sin plazo |
| Accesos de los verificadores a documentos | Registro de auditoría en D1 | Quien administra y el verificador | Sin plazo |
| Errores y registros técnicos | Registros de Workers | Quien administra | Entre 3 y 7 días según la fuente; un resumen diario se archiva en R2 |

Para reconstruir una changa se junta, por su identificador y en orden de hora, lo que hay en la cadena, los hashes y el registro de auditoría. La app le muestra esa línea de tiempo a las partes, y al jurado en una disputa.

## De dónde salen los datos y dónde se guardan

Alcanzan las piezas de Cloudflare que ya están elegidas: el indexador alimenta D1, el Worker escribe contadores en Analytics Engine, y una tarea diaria calcula los indicadores y los archiva en R2.

| Pieza | Qué guarda | Plan gratuito | Nota |
| --- | --- | --- | --- |
| D1 | Eventos de la cadena, auditoría e indicadores diarios | 5 GB; 5 millones de filas leídas y 100.000 escritas por día ([Cloudflare](https://www.cloudflare.com/plans.md)) | Pasado el límite diario las operaciones fallan; el plan de 5 USD por mes lo sube |
| Analytics Engine | Contadores y tiempos que escribe el Worker | 100.000 puntos escritos y 10.000 consultas por día ([Cloudflare](https://workers.cloudflare.com/pricing/.md)) | Un resumen de precios le pone 0,25 USD por millón de puntos pasado el plan gratuito, pero otra fuente dice que todavía no se cobra |
| Registros de Workers | Registros técnicos del backend | 200.000 eventos por día ([Cloudflare](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)) | La retención es de 3 a 7 días según la fuente |
| R2 | Archivo diario en JSON y CSV de eventos e indicadores | 10 GB | 0,015 USD por GB-mes después |
| Grafana Cloud, opcional | Tableros ya hechos | 10.000 series, 50 GB de registros y 14 días de retención ([CostBench](https://www.costbench.com/software/observability/grafana-cloud/)) | Exige empujar los datos desde el Worker y suma una cuenta externa |

Una cuenta de escala, con un supuesto mío de unos 10 eventos por changa: 1.000 changas por mes son unas 330 filas escritas por día en D1, contra un límite de 100.000, y 10.000 changas por mes siguen en unas 3.300.

**Cómo se arma**

- Cada evento se guarda con el identificador de la changa, su tipo, la hora, el bloque y el hash de la transacción.
- El indexador espera confirmaciones antes de dar un evento por firme y es idempotente: leer dos veces el mismo bloque no duplica filas.
- Una tarea programada del Worker calcula los indicadores del día; no verifiqué los cupos de las tareas programadas.
- El archivo diario en R2 es la copia que sobrevive a los pocos días de retención de los registros técnicos.
- Los tableros leen de D1: no hace falta otra base.

## Privacidad de las métricas

Las métricas no pueden convertirse en una segunda base de datos sobre las personas. Se separan tres clases de datos.

| Clase | Regla | Ejemplos |
| --- | --- | --- |
| Público | Ya está en la cadena; se usa tal cual y no se cruza con el perfil | Montos, fechas y wallets de los pagos |
| Interno | Solo lo ve quien administra, con identificadores internos en lugar de nombres y agregados por día | Disputas por tamaño, tiempo de respuesta de los jurados |
| Prohibido | No entra nunca a métricas ni a registros | Texto del chat, contenido de las pruebas, imagen y número del documento, ubicación exacta, dirección del prestador |

- Los tableros muestran agregados. Mirar la ficha de una persona exige un motivo, como una disputa o un abuso, y queda en el registro de auditoría.
- Con pocos casos, por ejemplo un jurado por semana, se muestran rangos y no valores individuales hasta tener un mínimo de casos, que está por definir.
- La ubicación se mide como dentro o fuera del radio de check-in, no como coordenadas.
- Las notificaciones se miden por tipo de aviso y no por persona.
- Los registros técnicos se configuran para no volcar cuerpos de solicitudes ni datos de personas. No verifiqué qué campos guarda Workers por defecto.
- Qué datos de personas pueden guardarse como métricas queda para la validación legal con un profesional, junto con la Ley 25.326.

## Tableros y alertas

Cuatro tableros, cada uno con una pregunta. Todo indicador de proporción muestra los casos sobre el total, por ejemplo 3 disputas sobre 10 changas, y los mínimos para actuar se definen con el piloto. Son una página de administración servida por el Worker, que lee de D1 y a la que se entra firmando con la cuenta de administración, que no tiene fondos.

| Tablero | Qué responde | Indicadores principales |
| --- | --- | --- |
| Costos por changa | ¿Cuánto cuesta cada changa y qué cuesta más? | Gas por acción, transacciones por changa, almacenamiento acumulado, llamadas de RPC y operaciones de Cloudflare frente a sus límites diarios |
| Embudo | ¿Dónde se cae el proceso? | De publicadas a cerradas, tiempos entre pasos, cancelaciones por momento, cierres por silencio y por QR |
| Dinero y sostenibilidad | ¿Alcanza la comisión? | Volumen, monto promedio, comisión efectiva, reserva en meses, pagos por la plataforma frente a efectivo |
| Confianza y jurado | ¿Funciona el arbitraje y la verificación? | Disputas por tamaño y su resolución, jurados que no revelan, cuentas por nivel, cola de verificaciones |

**Alertas**

Los umbrales se fijan con los datos del piloto; por ahora no hay números.

| Alerta | Para qué sirve |
| --- | --- |
| Saldo del relayer bajo, medido en días de gasto | Que no se frenen las acciones de nadie |
| Gasto de verificación cerca del tope mensual | Avisar antes de que las verificaciones queden en cola |
| Operaciones de Cloudflare cerca del límite diario | Pasar al plan de 5 USD por mes antes de que las operaciones empiecen a fallar |
| Cola de verificaciones que crece | Ver si el crédito del servicio alcanza |
| Jurado sin revelar cerca del vencimiento | Reenviar el aviso antes de que pierda el stake |
| Errores del relayer o de la API por encima de lo normal | Detectar caídas |

Decidido: tablero propio, con acceso de una cuenta de administración sin fondos, distinta de la que cobra, porque las comisiones van al contrato Tesoro, y alertas por push en la misma app con correo de respaldo.

**Indicadores públicos y novedades**

Decidido: se publican a la comunidad la comisión vigente, la reserva en meses y el volumen, porque la DAO vota presupuestos y necesita esos datos. Además, quien administra puede publicar novedades y cambios para que todos los vean.

- Los indicadores públicos salen de los mismos datos de D1, en una pantalla de solo lectura de la app y sin datos de personas.
- Las novedades las publica la wallet de administración con un mensaje firmado; cada una tiene título, texto y fecha, y se guarda en D1 y en el archivo diario de R2.
- Los cambios de parámetros votados aparecen solos como novedad, tomados de los eventos de la cadena, para que no dependan de que el administrador los anuncie.
- Las novedades se ven en un feed dentro de la app. El push se reserva para lo importante, con un máximo de avisos por semana que está por definir.
- Una novedad publicada no se edita: una corrección es otra novedad, igual que en la auditoría.
- Qué se puede afirmar públicamente como administrador queda para la validación legal.

## Panel de administración

El panel vive dentro de la app y solo lo abre la cuenta de administración. La regla de diseño es el poder mínimo: lo que mueve dinero o decide un caso está en la cadena y no se maneja desde el panel; acá el administrador lee, comunica, opera el servidor y propone.

| Área | Qué puede hacer el administrador | Qué no puede |
| --- | --- | --- |
| Lectura | Ver los cuatro tableros, la línea de tiempo de cualquier changa, la cola de verificaciones, el saldo del relayer, el uso de Cloudflare frente a sus límites y la auditoría | Leer chats, pruebas ni documentos |
| Comunicación | Publicar novedades, mandar un push importante y ver el feed | Editar una novedad ya publicada |
| Relayer | Pausar y reanudar los envíos, ver y recargar su saldo, cambiar el límite diario por cuenta | Mover el dinero de las changas |
| Verificación | Ver la cola y el gasto del mes, reintentar casos y pausar las altas si se agota el crédito | Ver documentos: eso es de los verificadores |
| Jurados | Invitar o retirar a los jurados semilla y revocar una credencial si se descubre un fraude | Elegir quién juzga una disputa ni cambiar un fallo |
| Moderación | Ocultar de forma provisoria una publicación denunciada, con motivo, y revertirlo | Sancionar o bloquear una cuenta de forma definitiva sin votación |
| Parámetros | Cambiar la configuración fuera de la cadena (textos, avisos, proveedor de verificación) y, mientras rija el multisig, proponer cambios de parámetros en la cadena | Saltarse la espera del Timelock ni los mínimos y máximos del contrato |
| Tesoro | Ver el saldo, los ingresos, los gastos, el disponible para retirar y el histórico, y cargar los gastos hechos fuera de la cadena | Retirar fondos desde el panel: un retiro lo firma el multisig, tras la espera del Timelock |
| Soporte | Buscar una changa por su identificador y ver su estado y su línea de tiempo | Intervenir en una disputa |
| Exportes | Descargar los eventos y los indicadores en CSV | Descargar datos de la clase prohibida |
| Seguridad | Rotar la clave del relayer y revisar los accesos al propio panel |  |

**Resguardos**

- La cuenta de administración no tiene fondos y solo guarda el rol de administrador. La que firma el multisig es otra, y conviene que sea una wallet de hardware.
- Las acciones sensibles, como pausar el relayer, ocultar una publicación o revocar una credencial, piden confirmación doble y un motivo escrito.
- Cada acción queda en el registro de auditoría con la cuenta, la hora y el motivo. Las que afectan a la comunidad se publican solas como novedad.
- Si la cuenta de administración se pierde o se la roban, el multisig le quita el rol y se lo da a otra cuenta.
- A medida que el control pase a la DAO, las funciones de la tabla que se puedan descentralizar pasan a votación.

Decidido: el administrador publica en un feed dentro de la app y el push se usa solo para lo importante. Hay un interruptor de emergencia que detiene solo las changas nuevas y nunca retiene dinero ya depositado. Lo que oculta por su cuenta es provisorio, con motivo y reversible, hasta que decide la votación. Qué funciones del panel entran en el TP se define en el doc de alcance.

**Tesoro: ingresos, gastos y retiros**

| Qué | Qué muestra | De dónde sale |
| --- | --- | --- |
| Ingresos | Comisiones, cancelaciones y tarifa del efectivo, por mes y por tipo | Eventos del Tesoro y del escrow |
| Gastos en la cadena | Lo que el Tesoro paga por contrato, como los pagos a jurados y el subsidio del cargo de red durante el arranque | Eventos del Tesoro |
| Gastos fuera de la cadena | Infraestructura, verificaciones, tiendas y otros servicios, con concepto, monto y fecha | Libro de gastos en D1, de solo agregar, que se carga a mano |
| Saldo | Lo que hay en el Tesoro por moneda | Estado del contrato |
| Disponible para retirar | El saldo menos la reserva mínima | Cálculo del panel |
| Histórico | Mes a mes: ingresos, gastos, resultado, saldo y retiros, con filtros por período, tipo y moneda y exportación a CSV | D1 |

- La reserva mínima es un parámetro en USDC que fija la votación y que el contrato hace cumplir: sin esa regla en el contrato, la reserva sería solo una promesa. Se expresa en USDC porque el contrato no conoce los costos mensuales.
- El panel muestra además la reserva en meses, que es el saldo dividido por el gasto mensual promedio, para decidir con ese dato.
- El panel prepara la propuesta de retiro pero no la firma: la firma el multisig y el Timelock impone la espera.
- Las monedas que no son stablecoins se muestran por separado. Convertirlas a USD necesita un precio, y no investigué de dónde sacarlo.
- Los gastos de infraestructura y servicios no pasan por la cadena, así que sin el libro de gastos el resultado del mes no sería real.
- Una vez por mes el panel manda un aviso al administrador para que cargue los gastos fuera de la cadena, y lo repite hasta que el mes figure como cargado.
- Recargar el relayer con ETH se hace a mano al principio: retiro del multisig, compra de ETH y envío al relayer, anotado en el libro de gastos.

Decidido: los retiros quedan limitados en el contrato a lo que supera una reserva mínima en USDC fijada por votación; los gastos fuera de la cadena se cargan a mano en un libro de solo agregar, con recordatorio mensual; la zona de cada changa se guarda por barrio o partido y nunca por dirección; y las monedas que no son stablecoins se muestran por separado hasta decidir de dónde sale el precio.

**Explorador de changas**

Una tabla con filtros y orden, con la que se arman las métricas que se quieran sin escribir consultas.

| Elemento | Opciones |
| --- | --- |
| Filtros | Período, categoría, tamaño (chica, media o alta), modalidad (por la plataforma o efectivo), individual o grupal, estado (cerrada, cancelada o en disputa), rango de monto y zona |
| Agrupar por | Categoría, tamaño, modalidad, mes y zona |
| Columnas | Cantidad, volumen, monto promedio, comisión generada, costo directo, ganancia neta, tasa de disputa (casos sobre el total) y tiempo hasta acordar |
| Orden | Por cualquier columna, de mayor a menor o al revés |
| Salida | Tabla en pantalla y exportación a CSV para seguir en una planilla |

Preguntas que responde: qué categorías se hacen más, cuáles dejan más comisión, cuáles dejan más ganancia neta una vez descontados los costos, en qué zona crece el uso y si las changas grupales generan más disputas.

- La categoría y la zona viven fuera de la cadena, porque los eventos del escrow no las llevan por privacidad, y se unen a los eventos por el identificador de la changa. La zona se guarda por barrio o partido, nunca por dirección.
- El costo directo de una changa suma lo que la plataforma gastó por ella: gas subsidiado, arbitraje y verificaciones. Los costos fijos de infraestructura no se reparten entre changas.
- Las consultas leen una tabla de indicadores por día, categoría, tamaño y modalidad, y no cada evento. Con 120.000 changas, un barrido completo lee 120.000 filas contra un límite de 5 millones por día, o sea unos 40 barridos.
- No hay consulta SQL libre al principio: los filtros predefinidos evitan consultas pesadas y errores, y se puede sumar más adelante.

## Supuestos a validar con el piloto

Casi todos los números de los otros docs son supuestos. El piloto sirve para reemplazarlos por datos, y esta tabla dice cuáles son y cómo se miden.

| Supuesto | Valor supuesto | Dónde se usó | Cómo se mide |
| --- | --- | --- | --- |
| Monto promedio de una changa | 54 USDC | Sostenibilidad y comisión | Promedio y mediana de las changas cerradas |
| Transacciones por changa | 3 en el caso común | Cargo de red | Eventos de la cadena por changa |
| Gas por transacción en Arbitrum | 0,08 a 0,09 USD | Cargo de red y elección de red | Recibos de las transacciones del relayer |
| Personas nuevas por changa | 0,4 | Costo de verificaciones | Cuentas nuevas sobre changas cerradas por mes |
| Personas nuevas que llegan al nivel 2 | 1 de cada 10 | Costo de documentos | Credenciales de nivel 2 sobre cuentas nuevas |
| Pruebas por changa | 5 MB | Almacenamiento | Bytes subidos por changa |
| Eventos por changa | 10 | Filas de D1 | Eventos indexados por changa |
| Costo de arbitrar con tres jurados | 3 USDC, un ejemplo | Umbral de changa chica de 20 USDC | Pagos a jurados por disputa |
| Costo fijo mensual | 0 a 5 USD de infraestructura | Comisión que cubre los costos | Facturas y consumo de Cloudflare |
| Tasa de disputas | Sin dato | Tamaño del jurado y costo de arbitrar | Disputas sobre changas cerradas, por tamaño |
| Changas que se pasan a efectivo | Sin dato | Tarifa en efectivo y tope de comisión | Pagos en efectivo sobre el total publicado |
| Cierres por silencio | Sin dato | Plazos de revisión de 24 y 72 horas | Cierres por silencio sobre cierres totales |
| Cancelaciones tras acordar | Sin dato | Costo de cancelar de 10% | Cancelaciones por momento sobre acordadas |
| Tiempo entre cierre y reclamo | Sin dato | Plazo de reclamo antes de borrar a pedido | Reclamos por días desde el cierre |

La tasa de 1,67% de disputas que cita el doc de confianza y economía es de UMA, otro sistema, y no vale como dato propio.

## Mínimo de medición para el TP

Propuesta provisoria, a confirmar en el doc de alcance del MVP: para el TP alcanza con la trazabilidad de cada changa y los costos por changa, y el resto queda para después.

| Entra en el TP | Queda para después |
| --- | --- |
| Eventos de la cadena en D1, con la línea de tiempo de cada changa | Archivo diario en R2 |
| Gas consumido y transacciones por changa, medidos en Sepolia | Costos reales en Arbitrum y alertas de saldo del relayer |
| Embudo y cancelaciones por momento | Tiempos entre pasos y tasa de cierres por silencio |
| Un tablero mínimo de costos y embudo, o consultas a D1 con exportación a CSV | Los otros dos tableros y las alertas |
| Registro de auditoría de los envíos del relayer | Auditoría de accesos de los verificadores, porque el nivel 2 queda fuera del TP |

En Sepolia el gas no cuesta nada, pero el gas consumido se registra igual y se guarda como métrica. Multiplicarlo por el precio de Arbitrum da solo una estimación: allá parte del costo depende de los datos que se publican en Ethereum (de memoria), así que el costo real se mide recién al salir a producción.

## Preguntas abiertas

Las cinco preguntas de la tabla quedaron resueltas con la propuesta indicada. Sigue abierta la de qué funciones del panel entran en el TP, que se define en el doc de alcance.

| # | Pregunta | Mi propuesta | Por qué importa |
| --- | --- | --- | --- |
| 1 | ¿Los retiros del Tesoro quedan limitados en el contrato a lo que supera una reserva mínima en USDC? | Sí, con la reserva mínima como parámetro votado | Sin la regla en el contrato, la reserva es solo una promesa |
| 2 | ¿Cómo se recarga el relayer con ETH si el Tesoro cobra en stablecoins? | A mano al principio: retiro del multisig, compra de ETH y envío al relayer, anotado como gasto | El gas se paga en ETH; no investigué cómo automatizar el cambio |
| 3 | ¿Los gastos fuera de la cadena, como Cloudflare, Didit y las tiendas, se cargan a mano en el panel? | Sí, en un libro de solo agregar | Sin eso el resultado del mes no es real |
| 4 | ¿Con qué precisión se guarda la zona de cada changa? | Barrio o partido, nunca la dirección | Más precisión sirve al análisis y expone más |
| 5 | ¿Cómo se pasan a USD las monedas que no son stablecoins? | Mostrarlas por separado hasta decidir de dónde sale el precio | No investigué fuentes de precios |
|  |  |  |  |

## Fuentes consultadas

No abrí ninguna página para este doc: todos los datos salen de resultados de búsqueda y cambian.

- Cloudflare: [planes y capas gratuitas](https://www.cloudflare.com/plans.md) y [precios de Workers](https://workers.cloudflare.com/pricing/.md)
- Registros de Workers: [documentación de Cloudflare](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) y [FlareCalc](https://flarecalc.com/calculators/workers-logs)
- Analytics Engine: [FlareCalc](https://flarecalc.com/calculators/analytics-engine)
- Grafana Cloud: [CostBench](https://www.costbench.com/software/observability/grafana-cloud/) y [Last9](https://last9.io/blog/grafana-cloud-pricing/)

No se investigó: la retención real de Analytics Engine (una referencia de terceros habla de 90 días), los cupos de las tareas programadas de Workers, qué campos guardan los registros de Workers por defecto, el costo de enviar alertas por correo, las herramientas de analítica de código abierto y los servicios de indexación de terceros. Las cifras de volumen de la tabla de supuestos son supuestos, no datos.

