# Junquero: alcance del MVP y de la demo

Bloque 5 de las decisiones de diseño · cerrado · 2026-10-29 · @Maxi

## Decisiones tomadas

Todo lo decidido sobre el alcance. Quedan abiertas dos preguntas para el profesor: qué pide la entrega y qué exige la consigna.

| # | Tema | Decisión | Detalle en |
| --- | --- | --- | --- |
| 1 | Alcance del TP | Entran 37 de las 40 funciones; quedan fuera la 17 (historial y nivel 1), la 18 (nivel 2 con documento) y la 27 (capas contra changas falsas) | Inventario de funciones |
| 2 | Niveles de cuenta | Solo el nivel 0 en el TP: perfil con datos y selfie en vivo | Inventario de funciones |
| 3 | Indexador | Entra la 32; de él leen el push, el panel, el tesoro, el explorador, las métricas y las novedades | Inventario de funciones |
| 4 | Pruebas | Entra la 33, R2 con URLs firmadas, para la evidencia, la selfie y la cola sin conexión | Inventario de funciones |
| 5 | Jurados | Entra el sorteo por compromiso y revelación (21) | Inventario de funciones |
| 6 | Demo | Entran ocho escenarios: A, B, C, D, E, F, H e I; el G, de niveles de cuenta, no entra porque el nivel 1 queda fuera | La demo |
| 7 | Consigna | Identidad autosoberana, cambio entre tokens y mezcla de tokens: se muestran avances al profesor y se ajusta a medida que responde | Qué pide la consigna |
| 8 | Entrega | Sin dato: se averigua con el profesor | Preguntas abiertas |
| 9 | Adjuntos de la oferta | Entra la 39: fotos, videos, PDF, Word, Excel, TXT, CSV y similares; públicos para quien ve la oferta; guardados en R2 con la referencia en D1; reportables y moderados por el jurado o el administrador; hash fijado en el acuerdo firmado | Inventario de funciones |
| 10 | Mapa de changas | Entra la 40, clave del MVP: quien busca trabajo ve un mapa lleno de changas publicadas cerca de su zona para explorar y competir por ellas. El mapa muestra changas, no personas disponibles | Inventario de funciones |

## Resumen

Este doc junta en un inventario todas las funciones que describen los docs anteriores, para que decidas cuáles entran en el TP. No propone recortes ni fechas: la columna de decisión arranca en A decidir y la completás vos. La entrega es el 1 de diciembre de 2026.

La columna de dependencias muestra qué arrastra cada decisión: si una función entra, las que figuran como su dependencia también tienen que estar, reales o simuladas. Cuando termines, armo la tabla de decisiones y este doc queda como base de la marca, las pantallas y la especificación técnica.

## Cómo se decide

Cada función tiene tres respuestas posibles.

| Decisión | Qué significa |
| --- | --- |
| Entra | Se construye de verdad y funciona en Sepolia |
| Simulado | Se muestra en la demo con cuentas, datos o botones de prueba, sin la lógica completa |
| Fuera | No se construye y queda documentada en el diseño |

Una función simulada o fuera igual se puede explicar en la entrega: qué hace en el diseño y por qué no se construyó.

## Inventario de funciones

Cuarenta funciones en ocho áreas, con las dependencias que veo; la columna de dependencias usa los números de esta tabla. Corregilas si hace falta.

| # | Área | Función | Viene de | Depende de | Decisión |
| --- | --- | --- | --- | --- | --- |
| 1 | Dinero | Escrow con depósito al publicar (pago por la plataforma) | Idea | 7, 9 | Entra |
| 2 | Dinero | Pago en efectivo con tarifa de publicación | Confianza | 8 | Entra |
| 3 | Dinero | Cancelación escalonada y compensaciones | Confianza | 1, 4 | Entra |
| 4 | Dinero | Acuerdo en cadena con las firmas de los dos | Stack | 1 | Entra |
| 5 | Dinero | QR de pago firmado y cobro | Idea | 1, 4, 9, 28 | Entra |
| 6 | Dinero | Comprobante intransferible, opcional | Stack | 5 | Entra |
| 7 | Dinero | Varias monedas con lista blanca, una por changa | Confianza |  | Entra |
| 8 | Dinero | Tesoro y comisión por fases | Confianza | 1 | Entra |
| 9 | Dinero | Relayer y cargo de red con límites | Stack |  | Entra |
| 10 | Changa | Publicar y postularse | Idea | 16, 28 | Entra |
| 11 | Changa | Changa grupal con aportes | Reglas de cierre | 1, 4 | Entra |
| 12 | Changa | Hitos (el anticipo de materiales quedó fuera) | Reglas de cierre | 1, 4 | Entra |
| 13 | Changa | Entrega con evidencia: fotos, video, hora y ubicación | Reglas de cierre | 28, 33 | Entra |
| 14 | Changa | Revisión: el silencio aprueba y la objeción pasa al jurado | Reglas de cierre | 1, 13 | Entra |
| 15 | Changa | Check-in por proximidad y apretón de manos | Reglas de cierre | 4, 28 | Entra |
| 16 | Cuentas | Perfil con datos y selfie en vivo (nivel 0) | Confianza | 28 | Entra |
| 17 | Cuentas | Historial y nivel 1 | Confianza | 5, 19 | Fuera |
| 18 | Cuentas | Nivel 2 con documento verificado (Didit y cola) | Confianza | 16, 17 | Fuera |
| 19 | Cuentas | Reputación por persona y rol | Confianza | 5 | Entra |
| 20 | Disputas | Disputa con jurado: votos cifrados y revelación | Confianza | 14, 24 | Entra |
| 21 | Disputas | Sorteo de jurados por compromiso y revelación | Stack | 20, 24 | Entra |
| 22 | Disputas | Apelación | Confianza | 20 | Entra |
| 23 | Disputas | Tamaños de changa: chica 50/50, media y alta | Confianza | 1, 20 | Entra |
| 24 | Disputas | Jurados semilla invitados por el administrador | Confianza | 34 | Entra |
| 25 | Gobernanza | Votar un parámetro con Timelock | Idea | 26 | Entra |
| 26 | Gobernanza | Peso de voto por actividad | Confianza | 5, 19 | Entra |
| 27 | Gobernanza | Capas contra changas falsas | Confianza | 17, 26 | Fuera |
| 28 | App | App React Native con MetaMask por WalletConnect | Stack |  | Entra |
| 29 | App | Cola de pruebas sin conexión | Stack | 13, 28 | Entra |
| 30 | App | Chat cifrado | Stack | 28 | Entra |
| 31 | App | Notificaciones push | Stack | 28, 32 | Entra |
| 32 | Backend | Indexador de eventos a D1 | Métricas | 1 | Entra |
| 33 | Backend | Pruebas en R2 con URLs firmadas | Stack |  | Entra |
| 34 | Panel | Panel de administración: lectura, novedades, relayer y verificación | Métricas | 32 | Entra |
| 35 | Panel | Tesoro en el panel: ingresos, gastos y retiros | Métricas | 8, 34 | Entra |
| 36 | Panel | Explorador de changas | Métricas | 32, 34 | Entra |
| 37 | Panel | Métricas mínimas y tableros | Métricas | 32 | Entra |
| 38 | Panel | Novedades e indicadores públicos | Métricas | 34 | Entra |
| 39 | Changa | Adjuntos públicos de la oferta: fotos, videos y archivos (PDF, Word, Excel, TXT, CSV), con reporte y moderación; su hash queda fijado en el acuerdo | Alcance | 28, 33 | Entra |
| 40 | App | Mapa de changas cercanas: quien busca trabajo ve en un mapa las changas publicadas cerca de su zona y las explora rápido | Alcance | 28, 32 | Entra |

Entran 37 funciones y quedan fuera 3: la 17, la 18 y la 27.

**Conflictos de dependencias**

Los conflictos quedaron resueltos con tus decisiones.

| Conflicto | Resolución |
| --- | --- |
| 33 Pruebas en R2 con URLs firmadas | Entra |
| 21 Sorteo de jurados | Entra |
| 32 Indexador de eventos a D1 | Entra |
| Escenario G de la demo, niveles de cuenta | No entra, porque el nivel 1 queda fuera |

## Qué pide la consigna

Los requisitos que listaste al empezar y cómo los cubre el diseño. Las funciones se indican con su número del inventario; si una función queda fuera del TP, el requisito que cubre queda al descubierto.

| Requisito | Cómo lo cubre el diseño | Funciones | Estado |
| --- | --- | --- | --- |
| Trazabilidad | Cada paso de una changa es un evento público en la cadena y el indexador arma su línea de tiempo | 4, 5, 32, 37 | Cubierto |
| Gobernanza | Votación en la cadena con Timelock y peso de voto por actividad; multisig al inicio | 25, 26 | Cubierto |
| Varios actores | Solicitante, prestador, testigo, jurado, verificador y administrador | 10, 20, 24, 34 | Cubierto |
| Tokens fungibles | Stablecoins para pagar, como USDC y USDT | 1, 7 | Cubierto |
| Tokens no fungibles | Comprobante intransferible y credenciales de nivel | 6, 17, 18 | Cubierto |
| Reglas de intercambio de tokens | Lista blanca de monedas, una por changa, con comisión y cargo de red; no hay cambio entre monedas | 7, 8, 9 | A confirmar con el profesor: no es claro si la consigna pide un cambio entre tokens |
| Mezcla de tokens | No está cubierta: los pagos privados quedaron para más adelante |  | Abierta, a consultar al profesor |
| Identidad autosoberana | Credenciales en la wallet con divulgación mínima, sin pruebas de conocimiento cero | 16, 17, 18 | A confirmar con el profesor |
| Uso de distintos dispositivos | Se descartó: se verifican personas y no dispositivos |  | Descartado |

## La demo

Nueve escenarios posibles, cada uno con las funciones del inventario que necesita y las cuentas de prueba que pide. Elegís cuáles se muestran y en qué orden.

| Escenario | Qué muestra | Funciones | Cuentas de prueba |
| --- | --- | --- | --- |
| A. Changa individual completa | Publicar con depósito, postularse, acordar, entregar con evidencia, pagar con el QR y emitir el comprobante | 1, 4, 5, 6, 9, 10, 13, 28, 33 | Dos celulares con MetaMask |
| B. Pago en efectivo | La tarifa de publicación y la menor reputación | 2, 8, 10 | Dos cuentas |
| C. Disputa con jurado | Objeción, sorteo, votos cifrados, revelación y resolución | 14, 20, 21, 23, 24 | Dos cuentas y tres de jurado |
| D. Cancelación escalonada | Cancelar en cada momento y el costo de cada uno | 3 | Dos cuentas |
| E. Changa grupal | Aportes, objeción y cobro conjunto | 11 | Tres cuentas o más |
| F. Votar un parámetro | Propuesta, voto con peso por actividad, espera y ejecución | 25, 26 | Cuentas con actividad previa y la de administración |
| G. Niveles de cuenta (no entra) | Pasar del nivel 0 al nivel 1 por historial | 16, 17, 19 | Una cuenta nueva |
| H. Panel de administración | Tableros, tesoro y novedades | 34, 35, 36, 37, 38 | Cuenta de administración |
| I. Chat y notificaciones | Mensajes cifrados y avisos de la changa | 30, 31 | Dos celulares |

La trazabilidad de una changa, su línea de tiempo de punta a punta, se ve en cualquiera de los escenarios A o C. Entran ocho escenarios; el G no entra porque el nivel 1 queda fuera.

## Preguntas abiertas

| # | Pregunta | Estado | Por qué importa |
| --- | --- | --- | --- |
| 1 | ¿Qué pide la entrega: una demo en vivo, un informe, una defensa o varias cosas? ¿El 1 de diciembre es la entrega o la defensa? | Sin dato: se averigua con el profesor | Define cuánto pesa la demo frente a la documentación |
| 2 | ¿La consigna exige identidad autosoberana con pruebas de conocimiento cero, un cambio entre tokens y mezcla de tokens? | Se habló de forma general: se muestran avances al profesor y se ajusta a medida que responde | Pueden sumar funciones al inventario o dejar sin cubrir un requisito |

