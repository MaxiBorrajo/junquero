# Junquero: confianza y economía

Bloque 2 de las decisiones de diseño · 2026-10-28 · @Maxi

## Resumen

Este doc propone cómo se genera confianza entre desconocidos y cómo circula el dinero, apoyándose en mecanismos que ya existen en blockchain. Quedó cerrado el 28 de octubre de 2026 y se actualizó el 29 de octubre para alinearlo con el doc de stack, que lo cierra: la tabla resume lo acordado y el doc de stack resolvió lo que había quedado pendiente.

| Tema | Acordado |
| --- | --- |
| Efectivo | Se permite con un piso fijo de 1 USDC más 2% del monto declarado, cobrado al publicar; el tope de la comisión del pago por la plataforma acota la tentación de irse a efectivo |
| Pago por la plataforma y contacto | Publicar con pago por la plataforma exige depositar el monto; el chat y los contactos quedan dentro de la app; cancelar es gratis sin prestador reservado, tiene una compensación creciente con prestador reservado y cuesta 10% tras acordar, con cancelación gratis a 24 horas dentro de límites |
| Comisión | Tres fases: 0% en el arranque, 1% en el crecimiento y luego una fórmula por presupuesto entre un piso y un tope de 2%, con rampa publicada y límite de variación |
| Sostenibilidad | La comisión recupera costos; la reserva se mide en meses y define cuatro estados (normal, alerta, austeridad, crítico); el dinero de los usuarios queda en un contrato aparte para un cierre limpio |
| Cargo de red y gas | Un relayer adelanta el gas y el usuario paga un cargo de red al costo; en el MVP es cero y con Arbitrum rondaría 0,24 a 0,27 USDC por changa |
| Red | Sepolia siempre para pruebas y desarrollo; Arbitrum para producción, a revisar en detalle antes de salir |
| Confianza | Jurados con stake que votan sin ver los votos ajenos, silencio que aprueba y reputación guardada en el propio contrato; sin pasaporte ni pruebas de conocimiento cero |
| Niveles de cuenta | Nivel 0 sin teléfono, con perfil de datos y selfie en vivo (depósito de entrada solo si aparecen cuentas descartables); nivel 1 por historial; nivel 2 con documento, solo para jurado, verificador y montos altos |
| Verificación de documentos | Servicio externo (Didit) como vía principal y jurado de respaldo; paga la persona, descontado de su primer movimiento; la IA propia queda fuera del MVP; si se agota el crédito mensual del servicio, las verificaciones quedan en cola hasta que se renueve |
| Quién vota | Voto por actividad, no transferible, con capas contra changas falsas; multisig con Timelock al inicio y traspaso gradual a la DAO |
| Seguridad física | Se mitiga con nivel de cuenta y reputación visibles, dirección solo para el prestador asignado y check-in; la blockchain no la garantiza |
| Primer jurado | Jurado semilla que al inicio también verifica documentos; changas chicas, medias y altas con distinto tratamiento de disputas |
| Monedas | Varias, con stablecoins por defecto; una moneda por changa; en el MVP cada persona usa su wallet (MetaMask) y compra y vende por fuera |
| Valores | Tabla de valores iniciales, que se cambian por votación dentro de límites fijados en el contrato |

## Efectivo y contacto: que salirse de la plataforma convenga menos

Lo que pasa fuera de la app no se puede observar ni impedir. Lo que sí se puede es encarecerlo y no dejar huecos en el propio diseño. Las dos modalidades de pago se comportan distinto.

**Pago por la plataforma: el monto se bloquea al publicar**

Publicar con pago por la plataforma exige depositar el monto desde el inicio. Eso es lo que permite ocultar teléfonos y mails y dejar toda la conversación dentro de la app: sin dinero bloqueado, dos personas podrían chatear y arreglar por fuera sin perder nada.

Queda un hueco que hay que cerrar: si cancelar es gratis hasta acordar, dos personas pueden chatear en la app, cancelar sin costo y pagar por fuera. El contrato no puede saber si hay un chat abierto, así que la regla se apoya en la reserva del prestador: el solicitante aparta a un postulante y ambos lo firman. La regla es escalonada:

| Momento | Costo de cancelar | Adónde va |
| --- | --- | --- |
| Sin prestador reservado | Gratis |  |
| Con prestador reservado, dentro del período de gracia | Gratis |  |
| Con prestador reservado, pasado el período de gracia | Compensación que crece de forma lineal hasta un máximo (porcentaje del monto bloqueado, con tope por moneda) | Prestador reservado |
| Después de acordar | 10% del monto bloqueado | Prestador y tesoro |

El porcentaje funciona acá porque el monto está bloqueado en el contrato y no se puede declarar de menos. Quien se va por fuera termina pagando mucho más que la comisión que evitaba.

**En efectivo: piso fijo más porcentaje, al publicar**

Sin dinero bloqueado, el monto que se declara no se puede comprobar. Un porcentaje solo se evitaría declarando un monto bajo y pagando el real en efectivo, y una tarifa solo fija casi no aportaría en las changas grandes. Por eso la tarifa tiene dos partes: un piso fijo, que no se evita declarando de menos, y un porcentaje del monto declarado.

- Se cobra al publicar y no al acordar: si se cobrara al acordar, dos personas podrían chatear y arreglar sin marcar nunca el acuerdo.
- No se devuelve: es el precio de usar la conexión y la reputación.
- Ocultar los contactos protege poco en esta modalidad: el chat va cifrado y no se puede filtrar.

| Aspecto | Pago por la plataforma | En efectivo |
| --- | --- | --- |
| Dinero | Bloqueado en el contrato al publicar | Fuera de la plataforma |
| Tarifa | 1% del monto (piso de 0,25 y tope de 5 USDC) más cargo de red | Piso fijo de 1 USDC más 2% del monto declarado, al publicar |
| Cancelar | Escalonado, según la tabla de arriba | Sin costo extra: la tarifa ya se pagó |
| Disputas | Jurado | No hay |
| Reputación | Plena | Menor peso, y solo si ambos confirman |
| Visibilidad en el listado | Primero | Después |

**Cuánto cuesta cada modalidad**

Con los valores de la fase de crecimiento, que son hipótesis (en el arranque la comisión es 0% y el pago por la plataforma es todavía más barato), y un cargo de red de 0,15 USDC (el cálculo con Base; con Arbitrum sería de 0,24 a 0,27) (sin contar el gas de publicar en efectivo). Todos los importes en USDC:

| Monto de la changa | Pago por la plataforma | Efectivo declarando el monto real | Efectivo declarando 1 USDC |
| --- | --- | --- | --- |
| 10 | 0,40 | 1,20 | 1,02 |
| 30 | 0,45 | 1,60 | 1,02 |
| 100 | 1,15 | 3,00 | 1,02 |
| 500 | 5,15 | 11,00 | 1,02 |

- El pago por la plataforma es más barato que el efectivo declarado con honestidad en todos los montos.
- Declarando un monto bajo, el efectivo le gana recién desde unos 100 USDC, y la ventaja máxima ronda los 4 USDC: el tope de la comisión es lo que la acota. Sin tope, la tentación de irse a efectivo crecería con el monto.
- Esa ventaja se compara con lo que se pierde: el pago asegurado, el jurado y la reputación plena, que importan más cuanto más grande es la changa.

**Lo que no se resuelve**

- Cuando dos personas ya se conocen y confían, pueden seguir por fuera después de la primera changa. Es un problema típico de los marketplaces y no hay mecanismo técnico que lo evite; la defensa es seguir aportando valor (reputación, pago por la plataforma, jurado, historial), no bloquear.
- No hay datos todavía sobre cuánto va a pasar. Es una hipótesis para validar con una prueba piloto.

## Confianza entre desconocidos

Se combinan mecanismos ya probados con una verificación de cuentas que no deje afuera a nadie por no tener pasaporte.

| Mecanismo | Qué resuelve | Cómo funciona | Ejemplos | Qué usamos |
| --- | --- | --- | --- | --- |
| Jurados con stake | Disputas subjetivas | Los jurados depositan tokens y se sortean; votan sin ver el voto de los demás; quienes votan con la mayoría cobran y la minoría pierde parte del stake; las apelaciones suman jurados y costos ([Oxford Law Blogs](https://blogs.law.ox.ac.uk/oblb/blog-post/2026/06/guessing-not-judging-why-crowdsourced-blockchain-decisions-are-not-arbitral)) | Kleros | Nuestro jurado sigue este modelo; los votos se envían cifrados y se revelan al final (commit-reveal) |
| Oráculo optimista | Dar por cierto un hecho salvo que alguien lo discuta | Se afirma algo y se da un plazo para discutirlo; si nadie lo discute queda aceptado, y si alguien lo discute se resuelve con una votación. UMA informa más de 22.000 afirmaciones con 1,67% de disputas ([UMA](https://blog.uma.xyz/articles/what-is-a-prediction-market-dispute)) | UMA, usado por Polymarket | La regla "el silencio aprueba y la objeción congela el pago" sigue el mismo patrón |
| Servicio externo de verificación | Cuentas falsas o duplicadas | La persona hace el trámite en el servicio: foto del documento, prueba de vida y comparación con la selfie; en Argentina puede validar además el DNI contra RENAPER ([Didit](https://didit.me/blog/argentina-renaper-dni-verification-api/)) | Didit | Vía principal para el nivel 2, con costo |
| Documento verificado por jurado | Cuentas falsas o duplicadas | La persona sube una foto de su documento y una selfie; un jurado de verificación las revisa y habilita el nivel 2 | Sin ejemplos investigados | Respaldo del servicio |
| Reputación en el propio contrato | Historial de cumplimiento | Un registro por persona y por rol, actualizado con los eventos del escrow | Más adelante se puede publicar como attestations (EAS) para que otras plataformas la lean ([Spark](https://www.spark.money/glossary/reputation-system)) | MVP: contrato propio |
| Stake o garantía | Desalentar el fraude | Quien puede perder dinero se comporta mejor | Kleros, UMA | Stake de jurados, verificadores, denunciantes y prestadores con anticipo |

**El oráculo optimista, con un ejemplo**

El prestador dice "terminé" y sube las pruebas. El sistema da la entrega por buena. Si el solicitante no objeta dentro del plazo (24 o 72 horas), se paga. Si objeta, el pago se congela y decide un jurado. Se llama "optimista" porque supone que casi nadie va a discutir: UMA informa que solo 1,67% de sus afirmaciones se disputaron. En los protocolos de este tipo quien afirma suele depositar una fianza; acá el prestador no deposita nada, y el costo de discutir lo paga quien objeta sin razón.

**Niveles de verificación**

| Nivel | Requisito | Qué permite |
| --- | --- | --- |
| 0 | Perfil con datos y selfie en vivo, sin teléfono; un depósito de entrada solo si aparecen cuentas descartables | Changas chicas; no puede ser jurado ni votar |
| 1 | Un mínimo de changas cerradas sin disputa | Changas medias y voto por actividad, con un depósito para votar |
| 2 | Documento verificado, por el servicio o por un jurado | Changas altas, jurado y verificador |

Los niveles se alinean con los tamaños de changa (ver Primer jurado). El documento se pide solo donde importa que sea una persona única: jurado, verificador y montos altos. El depósito de entrada vale 0 al inicio y se activa por votación si aparecen cuentas descartables.

**Verificación de cuentas: servicio externo o jurado**

Se buscó un servicio que ya lo resuelva, gratis o con límite. El candidato es Didit, que hace documento, prueba de vida y comparación con la selfie, y valida el DNI contra RENAPER:

- Hasta el 31 de octubre de 2026 el plan gratuito da 500 verificaciones por mes en cada función ([precios de Didit](https://docs.didit.me/getting-started/pricing)).
- Desde el 1 de noviembre de 2026 pasa a ser un crédito de 10 dólares por mes, unas 30 verificaciones completas a 0,33 dólares cada una; el sandbox sigue siendo gratuito e ilimitado ([anuncio de Didit](https://didit.me/blog/new-pricing-november-2026/)).
- La validación del DNI contra RENAPER se cobra aparte, a 0,20 dólares por consulta concluyente ([blog de Didit](https://didit.me/blog/argentina-renaper-dni-verification-api/)); la página de precios deja las validaciones de bases de datos fuera de la capa gratuita.
- Otros proveedores que vi tienen cupos gratuitos chicos (ID Analyzer, Kairos) o exigen mínimos mensuales (Sumsub, iDenfy). No abrí esas páginas ni verifiqué si soportan el DNI argentino.
- Los precios son los que publica la propia empresa y cambian: el cambio de noviembre es un ejemplo.

| Opción | Costo | Ventajas | Problemas |
| --- | --- | --- | --- |
| Solo servicio externo | Unos 0,33 dólares por persona, o 0,53 con RENAPER, pasadas las 30 gratis por mes | Automático; valida contra el registro oficial; sin revisores humanos viendo documentos | Costo por persona; un proveedor del exterior procesa los documentos; depende de un tercero y de que mantenga su plan |
| Solo jurado de verificación | Sin costo directo | Sin proveedor externo | Los verificadores ven documentos; más lento; más fácil de engañar con un documento falso |
| Servicio como vía principal y jurado de respaldo | Costo del servicio | Los casos en revisión van al jurado; quien no puede usar el servicio igual accede | Dos sistemas para mantener |

Propuesta: el servicio como vía principal y el jurado de respaldo, solo para el nivel 2 (jurado, verificador y montos altos). En el TP se usa el sandbox gratuito del proveedor, así que no se manejan documentos reales. Paga la persona que se verifica, con el costo descontado de su primer movimiento: el primer cobro del prestador o la primera publicación del solicitante, así nadie paga por adelantado. El tesoro cubre los primeros casos con el crédito gratuito mensual del proveedor (unos 30 por mes), y verificarse es opcional: el nivel 0 funciona sin hacerlo.

**Cómo se verifica un documento sin servicio (respaldo)**

1. La persona sube una foto del documento y una selfie desde la app.
2. Dos verificadores independientes la revisan; si coinciden, queda resuelta, y si discrepan decide un tercero.
3. Si se aprueba, se emite la credencial de nivel 2 en el contrato, sin datos personales, y se borra la imagen.
4. El sistema conserva solo una marca irreversible del número de documento, calculada con una clave secreta del servidor, para impedir que el mismo documento abra dos cuentas. Un hash simple no alcanzaría: los números de documento tienen pocas combinaciones posibles y se podrían reconstruir.

Una automatización con IA propia que lea el documento y lo compare con la selfie podría aliviar a los verificadores, pero queda fuera del MVP y habría que evaluar su calidad y sus sesgos antes.

**Limitaciones que hay que declarar**

- **Los jurados predicen, no deliberan.** En Kleros y UMA se premia votar como votará la mayoría, y la probabilidad de ser elegido crece con el stake. Un análisis de Oxford de junio de 2026 sostiene que por eso sus decisiones no son laudos arbitrales; hay una réplica publicada en septiembre de 2026 ([réplica](https://blogs.law.ox.ac.uk/oblb/blog-post/2026/09/guessing-really-not-judging-reply-eidenmuller-and-hochgurtel)). Nuestras mitigaciones: sorteo uniforme entre jurados elegibles (no proporcional al stake), un solo voto por persona verificada y criterios de aceptación acordados antes de la changa, para que el jurado juzgue contra algo concreto.
- **Los documentos son datos sensibles.** Un verificador humano o un proveedor externo ve el documento de otra persona. Con el servicio externo, además, una empresa del exterior procesa los documentos: es una transferencia internacional de datos personales que hay que validar con un profesional (Ley 25.326), y no se investigó. Con el jurado de respaldo se mitiga con pocos verificadores de confianza al inicio, acceso temporal y cifrado, y borrado de la imagen tras verificar.
- **Un revisor humano puede aceptar un documento falso.** El servicio externo lo reduce porque valida contra el registro oficial. En el respaldo ayudan la selfie junto al documento, la doble revisión y la reputación del verificador.
- **Un verificador puede ser corrupto.** Se limita con stake, doble revisión por revisores distintos y posibilidad de revocar una credencial si después se descubre el fraude.

## Seguridad física

La blockchain puede dar información confiable sobre una persona antes del encuentro, pero no protege a nadie durante él. La seguridad física se apoya sobre todo en medidas que no son blockchain.

| Riesgo | Mitigación | ¿La resuelve la blockchain? |
| --- | --- | --- |
| Ir a una casa de un desconocido | Nivel de cuenta, reputación y calificaciones visibles antes de aceptar; documento verificado en changas altas | Sí, parcialmente: da una cuenta verificada e historial verificable |
| Recibir a un desconocido | Mismo perfil visible para el solicitante, con reputación por rol | Sí, parcialmente |
| Exposición de la dirección | Se cifra con la clave del prestador asignado y solo la ve después del acuerdo | Sí |
| Algo sale mal durante la changa | Ubicación compartida opcional con un contacto de confianza y botón de ayuda que avisa a contactos | No: es una función de la app |
| Reincidencia de un mal actor | Reputación negativa persistente y bloqueo de la cuenta y del documento verificado | Sí |
| Conflicto el día de la changa | Check-in y check-out con verificación mutua, y evidencia disponible para el jurado | Parcialmente |

Lo que no se puede prometer: que nada malo pase. Las medidas bajan el riesgo y dejan un registro para sancionar, pero no lo eliminan. Para changas de mayor riesgo (ver el doc anterior) conviene sugerir que haya otra persona presente.

Para el TP alcanza con implementar el perfil verificable, la dirección cifrada y el check-in, y dejar el botón de ayuda y la ubicación compartida como trabajo futuro.

## Primer jurado: arranque sin reputación previa

Para ser jurado hace falta reputación, y la reputación se gana cerrando changas: al principio nadie la tiene. Es un problema de arranque en frío, y tiene salidas conocidas.

| Opción | Cómo funciona | Ventaja | Riesgo |
| --- | --- | --- | --- |
| Jurado semilla | El equipo invita a un grupo inicial de personas con documento verificado y les da una reputación inicial | Hay jurado desde el primer día | Centralización transitoria: el equipo elige |
| Requisitos de entrada | Para ser jurado: un mínimo de changas cerradas sin disputa y un stake igual para todos | El jurado se renueva solo con gente que ya demostró cumplir | Tarda en haber suficientes elegibles |
| Changas chicas sin jurado | En las changas chicas (se definen abajo) las disputas se resuelven con una regla automática | No hace falta jurado cuando arbitrar costaría más que lo discutido | Resultados menos justos en casos particulares |
| Árbitro externo | Integrar un protocolo existente como Kleros mientras no hay masa crítica propia | Jurado ya probado | Depende de un tercero y de su token |

Propuesta: **jurado semilla más requisitos de entrada**, con salida gradual del jurado semilla a medida que haya jurados con reputación propia, y evaluar un árbitro externo si el sistema sale de la etapa de prueba. En el TP alcanza con tres a cinco cuentas simuladas.

Al inicio, el mismo jurado semilla cumple dos funciones: resolver disputas y verificar documentos. Conviene separar ambos roles apenas haya suficientes personas, porque ven datos distintos: el verificador ve documentos personales y el jurado de disputas ve evidencia de changas.

**Qué es una changa chica**

Una changa es chica cuando arbitrarla cuesta más de lo que vale discutirla. Por eso el umbral se deriva del costo de un jurado y no se elige al azar: si tres jurados cuestan, por ejemplo, 3 USDC en total, una changa de 20 USDC ya pagaría el 15% solo en arbitraje. Con ese razonamiento, tres tamaños:

| Tamaño | Monto | Si hay disputa | Otras reglas |
| --- | --- | --- | --- |
| Chica | Hasta 20 USDC | Regla automática, sin jurado | Sin testigo ni hitos |
| Media | De 20 a 300 USDC | Jurado de 3 | Hitos si dura más de 5 días o supera 150 USDC |
| Alta | Más de 300 USDC | Jurado de 5 | Testigo y hitos obligatorios |

Regla automática en las changas chicas: si el solicitante rechaza la entrega, el prestador cobra 50% y el resto vuelve al solicitante, y cada uno suma una disputa a su historial. El reparto 50/50 deja un incentivo a rechazar para pagar la mitad; se compensa con el registro de disputas en la reputación de cada rol y con un tope de disputas por mes y por cuenta. Los umbrales son hipótesis: dependen del costo real de arbitrar y de los precios de las changas, que no relevamos.

**Tamaño y apelación**

- Jurados en cantidad impar: 3 en las changas medias y 5 en las altas.
- Una parte puede apelar una vez, con más jurados y a su costo; si pierde, paga el costo de la apelación (mecanismo que usa Kleros).
- Quien tenga vínculo registrado con alguna de las partes queda excluido, según las reglas del doc anterior.

## Monedas

Propuesta: aceptar varias monedas, con las stablecoins como opción por defecto y reglas distintas según el tipo de activo. Cada changa se fija en una sola moneda al publicar; el escrow, la comisión y los reembolsos son en esa moneda, así el contrato no hace conversiones. Las monedas aceptadas forman una lista blanca que la DAO puede ampliar.

| Moneda | Tipo | Cómo se maneja | Riesgo | MVP |
| --- | --- | --- | --- | --- |
| USDC, USDT y otras stablecoins en dólares | Estable | Tokens ERC-20 en la red elegida | Riesgo del emisor | Sí, por defecto; en Sepolia, tokens de prueba equivalentes |
| Stablecoin atada al peso | Estable en pesos | Mismo contrato; hay emisores locales, no investigados | Menos liquidez y riesgo del emisor | A evaluar |
| ETH | Activo nativo de la red | Se acepta envuelto (WETH) para usar el mismo contrato | Cambia de valor mientras el dinero está bloqueado | Sí, con aviso |
| Bitcoin | No es nativo de redes EVM | Solo mediante una versión envuelta, que depende de un custodio o un puente | Volatilidad y riesgo del puente | Fuera del MVP |
| Tron (TRX, USDT en Tron) | Red distinta | Un contrato en otra red no puede custodiar fondos de Tron sin un puente; soportarla implicaría un puente o una segunda implementación, que no se investigó | Duplica la complejidad | Fuera del MVP; a evaluar porque es la red más usada en el mercado P2P argentino |

**Qué hacer con la volatilidad**

| Opción | Cómo funciona | Problema |
| --- | --- | --- |
| Monto fijo en unidades del activo | Se bloquean N unidades; su valor en dólares cambia mientras dura la changa | El riesgo recae en una de las partes, así que hace falta un aviso claro |
| Precio en dólares convertido por un oráculo | Al publicar se calcula cuántas unidades equivalen al precio acordado | Suma un oráculo de precios y una dependencia externa; no se investigó |

Para el MVP: monto fijo en unidades, con aviso visible y limitado a changas cortas, y stablecoins por defecto. La app puede mostrar el equivalente en pesos, solo como referencia.

**Ingreso y salida de dinero real**

- En el MVP cada persona usa su propia wallet (por ejemplo MetaMask), compra stablecoins por fuera, en una app o exchange local o por P2P, y las envía a esa wallet. Es incómodo, pero evita integrar servicios externos y que la plataforma maneje pesos.
- El prestador hace lo mismo a la inversa: recibe tokens en su wallet y los vende por fuera.
- Los contratos solo ven tokens; la plataforma nunca toca pesos.
- Esto exige que cada persona tenga una wallet instalada. Es una barrera que se acepta para el MVP; la wallet embebida con passkey queda para más adelante.
- Hoy el público compra dólares digitales con apps locales como Lemon, Belo y Buenbit, registradas como PSAV ante la CNV ([Spark](https://www.spark.money/research/stablecoin-argentina-peso-crisis-adoption)). Integrar una de ellas como puerta de entrada y salida es una mejora posterior; qué servicio usar, si ofrece integración y qué exige la regulación queda pendiente: no se investigó.

**Costo de pasar dólares digitales a la wallet**

Depende de la red por la que se retira. Estos datos salen de resultados de búsqueda, sin abrir las páginas, y cambian:

- En Ethereum principal, retirar stablecoins de un exchange cuesta entre 1 y 5 dólares ([Spark](https://www.spark.money/tools/crypto-exchange-withdrawal-fee-comparison)).
- Binance cobra 0,3 USDT por retirar en Arbitrum, con un mínimo de 3 ([comparación de fees](https://teamorouter.com/blogs/usdt-withdrawal-fees-by-exchange)), y Coinbase no cobra los retiros de USDC en Base ni en Arbitrum ([Spark](https://www.spark.money/tools/crypto-exchange-withdrawal-fee-comparison)).
- No encontré qué redes soportan Lemon, Belo y Buenbit para retirar. La app ARQ, por ejemplo, retira USDC solo por Ethereum y Polygon, con comisión de hasta 3 USDC y mínimo de 5 ([ARQ](https://www.arqfinance.com/es-BR/help/articles/withdraw-crypto-from-your-account)).
- Los costos fijos pesan en montos chicos: 0,3 sobre 10 USDC es 3%. Conviene cargar y retirar en montos más grandes.
- Decisión: producción en Arbitrum, sujeto a confirmar antes de lanzar que las apps locales retiran por esa red.

**Contexto argentino**

- En el mercado minorista y P2P domina USDT, con entre 5 y 10 veces más ofertas que USDC en Binance P2P de Latinoamérica; por eso USDT tiene que estar en la lista blanca de producción ([Spark](https://www.spark.money/research/stablecoin-argentina-peso-crisis-adoption)).
- Las stablecoins son el 94% del volumen cripto operado contra pesos según a16z (agosto de 2026) y rondaron el 62% del volumen entre julio de 2023 y junio de 2024 según Chainalysis, citados por Spark, una empresa del rubro.
- La inflación anual bajó a 31,8% en noviembre de 2025 y la mensual ronda el 2% a mediados de 2026, pero el uso de stablecoins no cayó en proporción: es un hábito instalado.
- Esas apps son custodiales: ellas tienen las claves de los usuarios, un riesgo que la misma fuente señala.
- Si el solicitante paga en dólares y el prestador gasta en pesos, la conversión es un costo que cae sobre el prestador; su cálculo queda pendiente.
- No se investigó la regulación ni los impuestos de operar con stablecoins en Argentina.

## Gas

Propuesta: el usuario nunca necesita ETH ni firma pagos de gas. Un relayer envía las transacciones y adelanta el gas; el costo se traslada al usuario como un cargo de red al costo, en la moneda de la changa, que se muestra antes de confirmar. En Sepolia el gas no cuesta nada, así que en el MVP el cargo de red es cero. Una cadena propia se evaluó y se deja para más adelante.

**Opciones evaluadas**

| Opción | Cómo funciona | Ventajas | Problemas | Veredicto |
| --- | --- | --- | --- | --- |
| Sepolia | Red de prueba de Ethereum con ETH gratuito y sin valor | Sin costo; es el estándar para un trabajo práctico | Los tokens no valen nada: no puede mover dinero real | Pruebas y desarrollo, siempre |
| Relayer que paga el gas | El usuario firma mensajes y el servidor envía y paga las transacciones | El usuario no tiene ETH ni ve gas; sirve en cualquier red | La plataforma adelanta el gas; hay que limitar el abuso | MVP y producción |
| Red de segunda capa pública (Base o Arbitrum) | Transacciones de centavos: unos 0,05 dólares en Base y 0,08 a 0,09 en Arbitrum y Optimism, según una comparación de mayo de 2026 ([SpotedCrypto](https://www.spotedcrypto.com/defi-layer-2-comparison-guide-2026/)) | Seguridad heredada de Ethereum; permite dinero real | Costo por transacción; en Base, Coinbase opera el único secuenciador | Producción |
| Cadena propia | Una cadena EVM operada por la plataforma, con gas gratuito o en la moneda que se elija | Control total del gas | Ver abajo | Fuera del MVP |

**Decisión de red.** Sepolia siempre para pruebas y desarrollo, y Arbitrum para producción, a revisar en detalle antes de salir. Sepolia es gratis porque sus tokens no valen nada: nadie puede depositar dólares reales ahí. Ethereum ya discontinuó otras redes de prueba, como Ropsten, Rinkeby, Goerli y Kiln ([The Block](https://www.theblock.co/news/ecosystems/2025-03-19-ethereum-holesky-testnet-346973)) y Holesky, y hoy recomienda Sepolia para probar aplicaciones ([Ethereum Foundation](https://blog.ethereum.org/2025/09/01/holesky-shutdown-announcement)). Al pasar a producción se redespliegan los mismos contratos en Arbitrum, donde el gas ronda los 0,08 a 0,09 dólares por transacción. Queda pendiente verificar en qué redes retiran las apps locales (ver Monedas).

**Por qué una cadena propia no es una buena primera opción**

Es razonamiento sobre el diseño, no datos investigados:

- Quien opera la cadena puede cambiar el estado, censurar o revertir: los fondos bloqueados pasarían a depender de la confianza en la plataforma. Se pierde el argumento del primer doc de que el contrato custodia el dinero y la plataforma solo intermedia.
- Para usar dinero real hay que traerlo a esa cadena con un puente o un custodio, y ese custodio sería la plataforma, con implicancias regulatorias que no se investigaron.
- Correr y asegurar una cadena (validadores, monitoreo, respaldos) tiene un costo fijo que, a bajo volumen, probablemente supera los centavos de una red pública. Es una estimación sin datos.
- Variantes para evaluar más adelante: una cadena de consorcio con validadores de organizaciones distintas (universidades, ONGs) reduce el problema de confianza pero suma coordinación, y un rollup propio sobre Ethereum hereda su seguridad pero es más complejo. Ninguna se investigó.

**Quién paga el gas**

- El relayer adelanta el gas de todas las acciones del usuario: publicar, depositar, objetar y cobrar.
- La plataforma lo recupera con un cargo de red al costo, descontado en la moneda de la changa y visible antes de confirmar. Así la comisión no tiene que cubrir el gas y puede ser baja.
- Para evitar abuso hay un límite diario de transacciones por cuenta, menor en el nivel 0.
- Esto reemplaza lo que dice el doc de reglas de cierre, donde cada uno pagaba su gas al depositar y objetar. El compromiso lo dan el dinero bloqueado y el costo de arbitraje que paga quien objeta sin razón, no el gas.
- Si más adelante se prefiere que cada usuario pague su gas con su propia wallet, el paymaster de Circle permite pagarlo en USDC con un recargo de 10% en Arbitrum y Base ([Circle](https://developers.circle.com/paymaster)).

**Cuentas del margen**

Con 0,05 dólares por transacción en Base y unas tres transacciones por changa, el cargo de red rondaría 0,15 USDC; en Arbitrum, a 0,08 o 0,09 por transacción, ronda 0,24 a 0,27 USDC. Con Arbitrum, sobre una changa de 10 USDC pesa más de 2,4%, y sobre una de 30 USDC, entre 0,8% y 0,9%. La comisión (1%, con piso de 0,25 y tope de 5 USDC) queda libre para financiar el arbitraje y a los jurados. Las cifras son una hipótesis: hay que medir cuántas transacciones usa una changa y los montos reales.

## Valores iniciales acordados

Ninguno sale de datos reales: son valores de partida que se cambian por votación dentro de límites (ver la sección siguiente). Los montos en USDC dependen de cuánto cuestan las changas en Argentina, que todavía no relevamos.

| Parámetro | Valor inicial | Nota |
| --- | --- | --- |
| Comisión del pago por la plataforma, arranque | 0% | Hasta llegar al volumen que se defina al lanzar |
| Comisión, crecimiento | 1% del monto, con piso de 0,25 USDC y tope de 5 USDC por changa | El tope acota cuánto conviene irse a efectivo. El piso de 0,25 supera el 2% en changas menores a 12,5 USDC: queda por revisar |
| Comisión, madurez | Fórmula por presupuesto, entre un piso y un tope | El piso es el costo variable por changa dividido el monto promedio, cerca de 0,2% con los supuestos de este doc |
| Tope de la tasa de comisión | 2% | Fijado en el contrato |
| Variación máxima de la comisión | A definir por trimestre, con semanas de espera | Evita subas bruscas |
| Cargo de red | Al costo; con Arbitrum, unos 0,24 a 0,27 USDC por changa (hipótesis; el cálculo anterior usaba Base) | Se muestra antes de confirmar; en el arranque lo subsidia el tesoro con tope; en Sepolia es cero |
| Tarifa por changa en efectivo | Piso fijo de 1 USDC más 2% del monto declarado, al publicar | El piso no se evita declarando de menos; no se devuelve |
| Cancelar sin prestador reservado | Gratis |  |
| Cancelar con prestador reservado, pasado el período de gracia | Compensación lineal hasta un máximo, con tope por moneda | Va al prestador reservado |
| Cancelar tras acordar | 10% del monto bloqueado | Mayoría para el prestador, por ejemplo 80%, y el resto al tesoro |
| Cancelar tras acordar con 24 horas de anticipación | Gratis, con límites | Solo en changas con fecha y hora fijadas al acordar; 2 por mes por cuenta y 1 por mes por pareja de solicitante y prestador; después cuesta 10% |
| Compensación por no presentarse | 10% del monto | Igual que cancelar tarde |
| Compensación por terminar sin causa | 10% de lo que quedaba por pagar | Solo en changas con hitos |
| Tamaño de la changa | Chica hasta 20 USDC, media de 20 a 300, alta más de 300 | Derivado del costo de arbitraje; ver Primer jurado |
| Disputa en una changa chica | Reparto 50/50 automático | Cada disputa queda en la reputación de cada rol |
| Ventana de espera del prestador | 20 minutos |  |
| Radio de check-in | 150 metros | El GPS tiene error de decenas de metros, mayor en interiores |
| Hitos obligatorios | Más de 5 días o más de 150 USDC |  |
| Testigo obligatorio | Más de 300 USDC |  |
| Tope de anticipo para materiales | 30% del monto total |  |
| Reputación mínima para anticipo | 5 changas cerradas sin disputa | O una garantía equivalente |
| Plazo de revisión | 24 horas (corta) o 72 horas por hito (larga) | Ya definido en el doc de reglas de cierre |
| Jurado de disputas | 3 jurados en changas medias, 5 en las altas |  |
| Verificación de documento | Servicio externo para el nivel 2; jurado de respaldo con 2 verificadores y un tercero si discrepan |  |
| Costo de verificar a una persona | Unos 0,33 dólares, o 0,53 con RENAPER | Precio de Didit; paga la persona, descontado de su primer movimiento; el tesoro cubre los primeros casos |
| Depósito de entrada | 0 al inicio; de 2 a 5 USDC si se activa, devuelto tras cierta actividad | Se activa por votación si aparecen cuentas descartables |
| Reputación por changa | Solo suma si la paga la plataforma y supera 5 USDC | Ver Quién vota |
| Changas con la misma contraparte que suman | Hasta 2 | Ver Quién vota |
| Estados de la reserva | Normal con más de 12 meses; alerta de 6 a 12; austeridad de 3 a 6; crítico con menos de 3 | Ver Sostenibilidad |
| Límite diario de transacciones por cuenta | A definir; menor en el nivel 0 | Protege al relayer del abuso |
| Stake de jurado, verificador y denuncia | Valores simbólicos en el TP | Se calibran con datos reales |

## Cómo se cambian los valores

Los valores no están fijos en el código: dependen de dónde vive cada uno y de quién puede cambiarlo.

| Dónde vive | Qué incluye | Quién lo cambia | Ejemplos |
| --- | --- | --- | --- |
| Contrato de parámetros (on-chain) | Todo lo que mueve dinero o decide un caso | La DAO, por votación y con la espera del Timelock | Comisión, piso y tope; costos de cancelar; tamaños de changa; cantidad de jurados; plazos |
| Configuración del servidor (off-chain) | Lo que no mueve dinero ni decide casos | El equipo que opera el servicio, de inmediato | Límite diario de transacciones del relayer; textos y avisos; proveedor de verificación |
| Fórmula que se autorregula | Valores calculados a partir de datos del sistema | La fórmula; la DAO cambia la fórmula, no el valor | Ver abajo |
|  |  |  |  |

- Lo que mueve dinero tiene que estar on-chain: así nadie lo cambia en secreto y cualquiera lo puede auditar.
- Cada parámetro on-chain tiene un mínimo y un máximo fijados en el contrato, y la DAO no puede salirse de ese rango (por ejemplo, una comisión mayor al 5%). Así un voto malicioso o un error no dejan valores absurdos.

**Ejemplos de autorregulación (diseño propuesto, no probado)**

- **Umbral de changa chica:** un múltiplo del costo de arbitraje (por ejemplo siete veces). Si arbitrar se encarece, el umbral sube solo.
- **Recompensa del jurado:** si hay más casos que jurados disponibles, sube dentro de un rango; si sobran jurados, baja.
- **Comisión ****por presupuest****o:** la DAO vota un presupuesto por período y la comisión sale de dividirlo por el volumen, dentro de un piso y un tope y con un límite de variación (ver Sostenibilidad).
- **Cargo de red:** el costo real del gas que mide el relayer, con un pequeño colchón.

**Advertencias**

- Autorregular no elimina los parámetros: la fórmula tiene los suyos (objetivo, velocidad de ajuste) y alguien tiene que fijarlos.
- Una fórmula se puede manipular (por ejemplo, abriendo disputas falsas para subir la recompensa de los jurados) y puede oscilar si ajusta demasiado rápido.
- Agrega complejidad y superficie de ataque a los contratos.
- Para el MVP: parámetros en un contrato votable por la DAO y con límites, y como mucho un valor derivado, el umbral de changa chica. El resto de las fórmulas queda como trabajo futuro.

## Sostenibilidad: costos, ingresos y reserva

La comisión no busca ganancia: recupera los costos de operar la app. Cuando la app crece, el costo fijo se reparte entre más changas y la comisión baja. No tiende a cero: tiende a un piso que cubre el costo de cada changa. Los números de esta sección son supuestos inventados, anteriores al doc de stack, que estimó la infraestructura en 0 a 5 USD por mes y en menos de 0,01 USD de costo variable por changa; los 1.000 USDC representan un escenario que incluiría el trabajo de las personas, que hoy no se cuenta. Supuestos usados: 1.000 USDC por mes de costo fijo, 0,10 USDC de costo variable por changa y un monto promedio de 54 USDC.

| Changas por mes | Costos | Ingreso con 1% (con piso y tope) | Resultado | Comisión que cubre justo los costos |
| --- | --- | --- | --- | --- |
| 100 | 1.010 | 62 | -948 | 18,7% (inviable) |
| 1.000 | 1.100 | 615 | -485 | 2,0% |
| 2.000 | 1.200 | 1.230 | +30 | 1,1% |
| 5.000 | 1.500 | 3.075 | +1.575 | 0,56% |
| 10.000 | 2.000 | 6.150 | +4.150 | 0,37% |
| 50.000 | 6.000 | 30.750 | +24.750 | 0,22% |

- El piso de la comisión es el costo variable dividido el monto promedio: 0,10 sobre 54 es 0,19%.
- Con el tope de 2% el equilibrio queda en unas 1.020 changas por mes. Antes de eso el tesoro o el equipo cubren el déficit; después, el excedente vuelve como comisión más baja.
- Supone que todas las changas se pagan por la plataforma. Cada changa que se va a efectivo declarando poco aporta menos.

**Fases de la comisión**

| Fase | Comisión | Cargo de red | Depósito de entrada | Verificación | Cómo se pasa a la siguiente |
| --- | --- | --- | --- | --- | --- |
| Arranque | 0% | Subsidiado por el tesoro, con tope por cuenta y por día | Gratis | Crédito gratuito del proveedor para los primeros casos | Rampa publicada al lanzar: al llegar al volumen mensual definido, a calibrar con el piloto |
| Crecimiento | 1% con piso y tope por changa | Al costo, a cargo del usuario | A definir, de 2 a 5 USDC | A cargo de quien se verifica | Cuando la fórmula por presupuesto se activa |
| Madurez | Fórmula por presupuesto, entre un piso y el tope de 2% | Al costo | Según el abuso | Según el costo |  |

**Cómo sube o baja la comisión**

Hay una trampa de fondo: quienes votan pagan la comisión y tienden a bajarla. Por eso el contrato fija un piso (el costo variable) y un tope (2%) que la DAO no puede cruzar. Subir la comisión puede costar usuarios; no hay datos de cuántos, se mide en el piloto.

| Mecanismo | Cómo funciona | Qué resuelve |
| --- | --- | --- |
| Rampa publicada | Al lanzar se vota y se escribe en el contrato un calendario de la comisión | Subir no necesita un voto nuevo ni sorprende a nadie |
| Comisión por presupuesto | La DAO vota un presupuesto por período (arbitraje, infraestructura, desarrollo) y la comisión sale de dividirlo por el volumen, dentro del piso y el tope | La comisión baja sola al crecer; se vota qué se financia y no la tasa |
| Límite de variación | El contrato no deja subir más de X puntos por trimestre y exige semanas de espera | Evita golpes bruscos |
| Descuento por actividad | Quien más usa la app paga menos | Retiene a los usuarios que hacen la app y desalienta irse a efectivo; queda para más adelante |

**Si el volumen se estanca**

Si la comisión sale del presupuesto dividido por el volumen, cuando el volumen cae la comisión sube, y eso puede espantar usuarios y bajar más el volumen. El tope de 2% lo corta: el déficit lo cubre una reserva y no los usuarios. Con una reserva de 6.000 USDC:

| Changas por mes | Déficit mensual | Meses de reserva |
| --- | --- | --- |
| 200 | 804 | 7,5 |
| 500 | 510 | 11,8 |
| 800 | 216 | 27,8 |
| 1.020 | 0 | Sin límite |

El criterio de cuánto subsidiar se mide en meses de reserva, con cuatro estados que cambian solos:

| Meses de reserva | Estado | Qué pasa |
| --- | --- | --- |
| Más de 12 | Normal | Comisión por fórmula dentro del tope; subsidios activos |
| De 6 a 12 | Alerta | La comisión sube hacia el tope, respetando el límite de variación, y se publica la alerta |
| De 3 a 6 | Austeridad | Se cortan solos los gastos opcionales: el subsidio del cargo de red y el crédito de verificación |
| Menos de 3 | Crítico | La DAO tiene que votar: aportar fondos, reducir el servicio o cerrar |

**Cierre limpio**

Es un principio de diseño: el dinero de los usuarios nunca pasa por el tesoro.

- El dinero de las changas está en el contrato de escrow, que no puede gastarse en costos; el tesoro es otro contrato.
- Existe un modo de solo cierre que bloquea nuevas publicaciones: las changas en curso terminan o se reembolsan según las reglas.
- La reputación queda en la cadena aunque la app cierre.

**Lo que el mecanismo no resuelve solo**

- **La demanda:** recupera costos pero no crea usuarios. Hace falta empezar en una zona o comunidad chica, o con municipios y ONGs que publiquen necesidades.
- **Los operadores:** el relayer, el almacenamiento y el servidor de verificación los opera alguien y se le paga. Se mitiga bajando el costo fijo por diseño y haciendo reemplazable a cada operador.
- **El costo variable real:** guardar fotos y videos de las pruebas resultó barato: el doc de stack lo estima en menos de 1 USD por mes con 1.000 changas mensuales tras un año, y lo que más pesa por changa es el gas.

## Quién vota y cómo se evitan las changas falsas

El voto es por actividad: el peso sale de las changas cerradas por la plataforma y de la reputación, no se transfiere ni se compra. Requiere nivel 1 y un depósito para votar. Se descartó el voto por token (manda quien compra tokens) y el voto por persona (sin documento en el MVP se pueden crear cuentas múltiples). Dos cámaras, con prestadores y solicitantes votando por separado, queda para más adelante por su complejidad.

El riesgo principal son las changas falsas entre amigos para acumular peso. Con la comisión en 0% durante el arranque, farmear cuesta solo gas, así que ninguna capa sola alcanza:

| Capa | Qué hace | MVP |
| --- | --- | --- |
| Efectivo no cuenta | Solo las changas pagadas por la plataforma suman reputación y voto, porque son las únicas con dinero y comisión de por medio | Sí |
| Piso de monto | Una changa suma reputación solo si supera unos 5 USDC | Sí |
| Tope por contraparte | Cada persona aporta cada vez menos, y como máximo 2 changas con la misma cuentan | Sí |
| Alta gradual | La reputación y el voto acumulan con tope semanal y caducan sin actividad | Sí |
| Depósito para votar | Entrar es gratis, pero votar o ser jurado exige un depósito chico, así que cada cuenta con voto cuesta | Sí |
| Poder máximo por cuenta | Una cuenta fabricada no puede pesar de más | Sí |
| Detección de grupos cerrados | Las wallets fondeadas desde la misma fuente o que solo transaccionan entre sí ven reducido su peso | Después |
| Auditoría aleatoria | Un jurado revisa un porcentaje de las changas que suman reputación; el fraude cuesta reputación y stake, y alcanza a las cuentas vinculadas | Después |

**Gobierno al inicio**

- Con pocos usuarios no hay quórum para una votación real. Al inicio rige un multisig del equipo con Timelock, y el control pasa a la DAO al llegar a una cantidad de usuarios activos que se define al lanzar.
- El Timelock deja ver cada cambio antes de que se ejecute, y los límites fijados en el contrato impiden valores absurdos aunque el voto sea malo.
- Votar con firma, enviada por el relayer para que el usuario no pague gas, se puede resolver con el relayer del doc de stack, que acepta solo funciones permitidas; no se probó.

## Fuentes consultadas

Páginas abiertas y leídas (de acá salen los números):

- [Guessing Is Not Judging, Oxford Business Law Blog, 16 de junio de 2026](https://blogs.law.ox.ac.uk/oblb/blog-post/2026/06/guessing-not-judging-why-crowdsourced-blockchain-decisions-are-not-arbitral)
- [What is a Prediction Market Dispute?, UMA, 6 de septiembre de 2024](https://blog.uma.xyz/articles/what-is-a-prediction-market-dispute)
- [Circle Paymaster, documentación de Circle](https://developers.circle.com/paymaster)
- [DeFi Layer 2 Comparison Guide 2026, SpotedCrypto, 8 de mayo de 2026](https://www.spotedcrypto.com/defi-layer-2-comparison-guide-2026/)
- [Argentina's Stablecoin Adoption, Spark, 8 de octubre de 2026](https://www.spark.money/research/stablecoin-argentina-peso-crisis-adoption): la publica una empresa que ofrece una stablecoin propia, así que conviene contrastar las cifras con las fuentes que cita (a16z y Chainalysis)
- [Precios de Didit, documentación](https://docs.didit.me/getting-started/pricing)
- [Nuevos precios de Didit desde el 1 de noviembre de 2026, anuncio del 2 de octubre](https://didit.me/blog/new-pricing-november-2026/)
- [RENAPER DNI Verification API, Didit, 20 de mayo de 2026](https://didit.me/blog/argentina-renaper-dni-verification-api/): Didit vende el servicio, así que sus cifras y afirmaciones son las de la propia empresa

Vistas solo en resultados de búsqueda, sin abrir la página:

- [Reputation system, Spark](https://www.spark.money/glossary/reputation-system)
- [Réplica en Oxford Business Law Blog, septiembre de 2026](https://blogs.law.ox.ac.uk/oblb/blog-post/2026/09/guessing-really-not-judging-reply-eidenmuller-and-hochgurtel): aparece listada en la página del artículo original; no la leí.
- Precios de otros proveedores de verificación: [ID Analyzer](https://idanalyzer.com/en/pricing), [Kairos](https://www.kairos.com/pricing), [Sumsub](https://sumsub.com/pricing2/) e [iDenfy](https://idenfy.com/identity-verification-price/)
- Costos de retiro: [comparación de Spark](https://www.spark.money/tools/crypto-exchange-withdrawal-fee-comparison), [comparación de fees por exchange](https://teamorouter.com/blogs/usdt-withdrawal-fees-by-exchange) (leída el 20 de octubre de 2026 según la propia página) y [ARQ](https://www.arqfinance.com/es-BR/help/articles/withdraw-crypto-from-your-account)
- Redes de prueba: [Ethereum Foundation, cierre de Holesky, 1 de septiembre de 2025](https://blog.ethereum.org/2025/09/01/holesky-shutdown-announcement) y [The Block, 19 de marzo de 2025](https://www.theblock.co/news/ecosystems/2025-03-19-ethereum-holesky-testnet-346973)

No se investigó: las redes por las que retiran Lemon, Belo y Buenbit, la estimación de costos de infraestructura, stablecoins atadas al peso, oráculos de precios, puentes entre redes, cadenas de consorcio y rollups propios, la transferencia internacional de datos personales a un proveedor de verificación (Ley 25.326), y la regulación y los impuestos de operar con stablecoins y de mover fondos en Argentina.

## Lo que resolvió el doc de stack

| Tema | Qué se decidió |
| --- | --- |
| Costos | Techo de 20 USD por mes de infraestructura, hoy estimada entre 0 y 5 USD |
| Red | Sepolia siempre para pruebas y desarrollo; Arbitrum para producción, a revisar en detalle antes de salir |
| Contratos | Diez contratos con OpenZeppelin; acuerdo siempre en cadena; comprobante intransferible y opcional en lugar de un NFT por changa; transacciones al mínimo |
| Cuentas y firmas | MetaMask por WalletConnect; relayer con una cuenta dedicada |
| App | React Native con Expo, empezando por Android |
| Backend | Cloudflare: Workers con Hono, Durable Objects y D1 |
| Verificación | Sin teléfono; perfil con datos y selfie en vivo; documento opcional con Didit; cola si se agota el crédito mensual |
| Jurado | Sorteo por compromiso y revelación |
| Pruebas | R2, cifradas y sin plazo de borrado |
| Chat | Propio, con libsodium sobre Durable Objects |
| Privacidad | Pseudonimato en el MVP, con las wallets ocultas para otros usuarios |
| Notificaciones | Push con Expo y correo de respaldo para los avisos críticos del jurado |
| Pendiente | Validación legal con un profesional |

