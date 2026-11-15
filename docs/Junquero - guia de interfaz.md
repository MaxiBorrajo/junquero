# Junquero: guía de interfaz

Reglas para que toda la app se vea y se comporte igual. Complementa `Junquero - marca.md` (colores, tipografía, voz) y `Junquero - diseno de pantallas.md` (qué lleva cada pantalla). Si una pantalla nueva necesita algo que no está acá, se resuelve una vez, se agrega a esta guía y se usa en todos lados.

Se lee antes de tocar una pantalla y se repasa la lista de chequeo del final antes de dar algo por terminado.

## 1. Botones

| Tipo | Cuándo | Cómo se ve |
| --- | --- | --- |
| **Principal** (`primary`) | La acción que se espera que haga la persona en esa pantalla. **Uno solo por pantalla**, siempre en el pie. | Ladrillo, texto blanco |
| **Con borde** (`outline`) | Una acción importante que no es la principal y no cabe en una tarjeta de acciones (por ejemplo "Agregar un pedido", "Reconectar la billetera") | Borde ladrillo, texto ladrillo |
| **De texto** (`ghost`) | Utilidades chicas dentro de una tarjeta o debajo del botón principal en el pie ("Volver", "Repetir", "Limpiar") | Sin fondo, texto ladrillo |
| **Fila de acciones** (`DetailActions`) | Las acciones de detalle de una pantalla (compartir, reportar, editar, retirar, cancelar…) | Ver sección 2 |

- **Todo botón lleva ícono**, a la izquierda del texto. Sin excepciones.
- Texto en minúscula tipo oración, con verbo ("Aportar", "Cancelar trabajo"), en voseo.
- **No existe el botón beige** (`secondary`). Un botón beige siempre se resolvía mal: competía con el principal o se apilaba con otros iguales.
- El pie de una pantalla lleva el botón principal y, como máximo, un botón `ghost` con ícono debajo.
- Mientras una acción está en curso, el botón principal muestra el indicador de carga y las demás acciones quedan apagadas. Un toque de más no dispara nada.

## 2. Tarjeta de acciones (`DetailActions`)

Es el patrón del detalle de una changa: una tarjeta blanca con borde, **una fila por acción**, con el ícono a la izquierda, el nombre y una flecha a la derecha.

- Las acciones que borran, cancelan o retiran algo (`danger: true`) van **al final** y en rojo.
- Se puede mostrar un número (`badge`) antes de la flecha, por ejemplo las notificaciones sin leer, y un texto chico (`hint`) debajo del nombre.
- Si hay varias acciones secundarias juntas, van en **la misma tarjeta**, nunca en botones sueltos apilados.
- Una sola acción secundaria también va como fila, no como botón.

## 3. Confirmaciones y errores

La pregunta es: ¿qué le pasó a la persona?

| Situación | Cómo se muestra |
| --- | --- |
| Una acción salió bien (aportar, enviar, copiar, guardar, cancelar) | **Toast** de éxito, con ícono |
| Canceló la firma de la billetera | Toast informativo, sin tono de error |
| Una acción falló y se puede reintentar | Toast de error, o `ErrorText` si hay que corregir algo |
| Un campo no es válido | `Field` con `error` (borde rojo y texto debajo) |
| Algo bloquea la pantalla (sin saldo, sesión vencida) | `ErrorText` en la pantalla, con el paso siguiente |
| Un estado o invitación que sigue vigente (invitación a aportar, selfie en revisión) | `Banner` |

- **Una confirmación nunca es texto fijo en la pantalla.** Se muestra con el toast (`useToast()`), que sobrevive a un cambio de pantalla.
- El toast dura **7 segundos** (9 los errores), se puede cerrar tocándolo y lleva ícono: check verde (éxito), información azul (aviso), alerta roja (error). El color nunca es el único aviso.
- **Una acción sobre la cadena confirma recién cuando la red la confirmó.** Mientras tanto se muestra "Enviado, esperando confirmación…". Se actualiza la pantalla y recién ahí aparece el toast de éxito. Así nunca se dice "Listo" con datos viejos.
- Los textos de error dicen qué pasó y qué sigue, y si no se movió plata lo aclaran ("No pudimos enviar el aporte. No se movió plata. Probá de nuevo.").

## 4. Tarjetas, avisos y filas

- **`Card`**: la única forma de agrupar información. Blanca, borde `line`, radio `md`, padding `md`. `gap` según el contenido (`xs` para datos juntos, `sm` para bloques). Con `onPress` se vuelve tocable. No se arman tarjetas con estilos propios.
- **`Banner`**: aviso que se queda en pantalla. Tonos: `sand` (invitación o contexto), `info`, `success`, `warning`, `error`. Lleva siempre ícono y, si hace falta, una acción en texto.
- **Filas de lista** (mensajes, notificaciones, postulaciones, jurado): tarjeta con el mismo padding, separación `sm` entre filas y la información principal a la izquierda. El estado (no leído, en revisión) se marca con un número, un ícono o una palabra, no solo con color.
- **Estado de algo** (en curso, juntando aportes, en revisión, cancelada): siempre en una pastilla (`StatusChip`) al lado del título. Nunca como texto suelto en el cuerpo de la pantalla. Lo que sigue vigente y pide acción va en un `Banner`.
- **Etiqueta de pertenencia**: "Publicaste este trabajo" o "Hacés este trabajo" va arriba del título (`OwnerTag`), igual en todas las pantallas de un trabajo (detalle, orden, grupo). Nunca como texto debajo del título.
- **Adjuntos**: siempre como miniatura (`AttachmentTile`): foto con vista previa o ícono y nombre para otros archivos, con una X para quitarlo. Si son varios van en una fila con desplazamiento horizontal y aire arriba y abajo. Tocar una miniatura la abre en grande (visor de imágenes, video o documento), igual en el chat, las postulaciones, la evidencia y la publicación.
- **Hojas de opciones** (`ChoiceSheet`): para elegir entre acciones que no entran en la pantalla (sacar foto, elegir de la galería, menú de tres puntos).

## 5. Íconos
- Un solo estilo (línea de 2 px, puntas redondeadas) en `Icon.tsx`. Si falta uno, se agrega ahí, no se usa otro estilo.
- Tamaños: 20 en botones y filas, 24 en pestañas, 16 en chips y etiquetas.
- Significados fijos: enviar = avión de papel, confirmar = tilde, cancelar o cerrar = X, aportar o billetera = billetera, compartir = nodos, reportar = bandera, bloquear = círculo tachado, avisar un problema = triángulo.

## 6. Tipografía, color y espacio
- Fuente Outfit. Estilos de `theme.text`: título 24 extranegrita, subtítulo 18 negrita, monto 32, cuerpo 16, secundario 14, etiqueta 12. Los tamaños 13 (texto chico dentro de tarjetas) y 15 (filas y avisos) están permitidos; no se agregan otros.
- Colores solo de `theme.colors`. Ningún `#` ni `rgba(` suelto fuera de `theme.ts`.
- Espaciado de `theme.spacing` (4, 8, 16, 24, 32) y radios de `theme.radius`. Los valores intermedios como 12 o 6 se evitan.
- Texto blanco solo sobre ladrillo, error o éxito; sobre arena va tinta.

## 7. Pantallas
- Una idea por pantalla o por paso. Si algo necesita explicación, la pantalla tiene un texto corto arriba.
- Título arriba, contenido en tarjetas, acción principal en el pie.
- Los pasos de un asistente (publicar) llevan barra de avance y "Paso X de N".
- Las acciones que no se pueden hacer se apagan y explican por qué.

- **Camino feliz** (`Journey`): las pantallas de un trabajo en curso muestran los pasos que faltan hasta cobrar o liberar el pago, con el paso actual resaltado y una línea que dice qué hacer ahora. Nunca hay botones sueltos sin contexto.
- **Antes de mover compromisos** (elegir a una persona, aceptar un acuerdo, aprobar un pago) se pide confirmación con el nombre y el monto, y después se muestra el estado ("Propuesta enviada, esperando que acepte") en la tarjeta, nunca como texto suelto.
- **Perfil de otra persona**: antes de elegirla se puede ver su perfil con historial (calificación, trabajos cerrados, reclamos), desde la tarjeta de postulación y desde el menú del chat.

## 8. Tono
- Voseo siempre, frases cortas, verbos concretos.
- Sin términos de cadena de bloques: "billetera", "pago en garantía", "costo de red", "comprobante".
- Serio con plata y reclamos, liviano en el resto. Nada de humor en errores.

## 9. Lista de chequeo para una pantalla nueva
- [ ] ¿Hay un solo botón principal, en el pie?
- [ ] ¿Todos los botones y filas tienen ícono?
- [ ] ¿Las acciones secundarias están juntas en una tarjeta de acciones, con las destructivas al final y en rojo?
- [ ] ¿Las confirmaciones salen como toast y no como texto fijo?
- [ ] ¿Las acciones sobre la cadena esperan la confirmación antes de decir "Listo"?
- [ ] ¿Los estados van en una pastilla al lado del título y no como texto suelto?
- [ ] ¿Las tarjetas y avisos usan `Card` y `Banner`?
- [ ] ¿Los colores, tamaños y espacios salen de `theme`?
- [ ] ¿Los textos están en voseo y dicen qué pasó y qué sigue?
