# Junquero: pruebas realizadas

Pruebas del plan de flujos que ya pasaron y tienen todas sus casillas en `[ x ]`. Se movieron el 20/11/2026 desde `Junquero - plan de pruebas.md`, donde quedan solo las pendientes y las que fallaron. El texto de cada prueba, su numeración y sus marcas se conservaron tal cual estaban; si una prueba vuelve a fallar o cambia, se devuelve al plan.

**Resumen:** 105 pruebas hechas (de un total de 122 con casillas: 16 pendientes y 1 con falla, la 1.3, que sigue en el plan).

| Bloque | Hechas |
| --- | --- |
| 1. Registro y perfil | 5 (1.1, 1.2, 1.4, 1.5 y 1.6) |
| 2. Publicar y explorar | 11 |
| 3. Postulación y acuerdo | 13 |
| 4. Chat y notificaciones | 14 |
| 5. Hacer la changa y cobrar | 9 (5.1 a 5.9) |
| 6. Hitos | 6 |
| 7. Cancelaciones | 8 (7.1 a 7.8) |
| 8. Reclamo y jurado | 8 (8.1.1, 8.2.1, 8.2.2, 8.3.1 a 8.3.4 y 8.3.14) |
| 10. Perfil y ajustes | 5 |
| 11. Panel | 5 (11.1 a 11.4 y 11.6) |
| 15. Transversales | 21 (todas menos la 15.5) |

---

## 1. Registro y perfil

**1.1 Ingreso con billetera** · Rol: cualquiera
- [ x ] Pasos: abrir la app sin sesión → elegir "Tengo una necesidad" o "Busco trabajo" → conectar MetaMask → firmar el mensaje de confirmación.
- Esperado: la firma no cuesta ni mueve plata. Queda la sesión y se pasa a crear el perfil.
- Observaciones: _

**1.2 Crear perfil y selfie** · Rol: Ana y Beto
- [ x ] Pasos: cargar nombre, rubros y zona de trabajo → sacar la selfie.
- Esperado: el perfil muestra "Junquero en revisión", con el ícono del junco en ámbar, hasta que se apruebe.
- Observaciones: _

**1.4 Sin selfie verificada no se puede postular** · Rol: Beto
- [ x ] Pasos: con la cuenta aún sin verificar, intentar postularse a una changa.
- Esperado: se bloquea con un aviso. (Depende del valor `REQUIRE_VERIFIED_APPLICANT` del servidor; anotar con cuál se probó.)

**1.5 Cerrar sesión y volver a entrar** · Rol: cualquiera
- [ x ] Pasos: Perfil → Cerrar sesión → volver a ingresar con la misma billetera.
- Esperado: recupera su perfil, sus changas y su chat.

**1.6 La verificación se refleja sola** · Rol: Beto y Admin
- [ x ] Pasos: con la selfie de Beto en revisión y la app abierta, el Admin la aprueba desde el panel. Sin cerrar la app, esperar hasta 20 segundos (o arrastrar para refrescar el perfil, o volver a la app desde otra).
- Esperado: el perfil pasa a "Junquero verificado" sin cerrar sesión ni reiniciar, y desde ese momento se puede postular a una changa. También se actualiza al llegar la notificación de selfie aprobada.
- Observaciones: _

## 2. Publicar y explorar

**2.1 Publicar changa individual presencial** · Rol: Ana
- [ x ] Pasos: Publicar → completar los pasos (qué necesitás, dónde y cuándo, fotos, cuánto pagás, qué evidencia pedís, revisar) → firmar el permiso del depósito → publicar.
- Esperado: el saldo de Ana baja por el monto más la comisión. La changa aparece en el mapa con un pin de precio. Pasa de "borrador" a abierta cuando el indexador ve el depósito.
- Observaciones: _

**2.2 Borrador y reanudación** · Rol: Ana
- [ x ] Pasos: empezar a publicar, salir de la app a mitad, volver.
- Esperado: el borrador se conserva y se puede retomar.

**2.3 Explorar sin sesión y con sesión** · Rol: invitado y Beto
- [ x ] Pasos: "Mirar el mapa primero" → mapa, lista, buscador y filtros.
- Esperado: se ven las changas abiertas sin necesidad de ingresar. Para postularse pide ingresar.

**2.4 Changa a distancia** · Rol: Ana
- [ x ] Pasos: publicar eligiendo "A distancia" (sin ubicación, con plazo de entrega).
- Esperado: no tiene pin; aparece en la lista de remotas y con el filtro "A distancia".

**2.5 Publicar con hitos** · Rol: Ana
- [ x ] Pasos: monto alto (más de 500 USDC) o plazo largo → en "Cómo se paga", elegir Sí y armar 2 o más hitos con monto, criterio y evidencia → en "Cuánto pagás" ver el total calculado (y, si no se eligieron hitos, el aviso que sugiere dividirlos) → publicar.
- Esperado: sin importar el monto ni el plazo, "No" siempre se puede elegir; el aviso solo sugiere. En el detalle de la changa se ve "Pago por hitos" o "Pago único al finalizar". El total es la suma de los montos de los hitos y no se escribe a mano. Los materiales se eligen entre "los compra quien publica" y "los pone quien trabaja"; no existe la opción de anticipo.

**2.6 Cancelar una changa abierta** · Rol: Ana
- [ x ] Pasos: cancelar una changa a la que nadie se postuló (desde el detalle, "Cancelar trabajo").
- Esperado: no tiene costo y el depósito vuelve a Ana.

**2.7 Buscar un lugar en el mapa** · Rol: Ana y Beto
- [ x ] Pasos: en el mapa principal y en el selector de ubicación al publicar, escribir una dirección o un lugar en el buscador y elegir un resultado.
- Esperado: el mapa se centra en el lugar elegido y la lista de resultados se cierra. Con un texto sin resultados avisa que no encontró nada; sin conexión avisa del error.

**2.8 Adjuntos: varios archivos, tamaño y vista previa** · Rol: Ana
- [ x ] Pasos: en "Fotos y archivos" usar "Agregar foto o video" y "Agregar documento" eligiendo varios archivos juntos (hasta 10 en total). Probar un archivo de más de 100 MB. Tocar cada adjunto: una imagen, un video y un documento (PDF u otro). Repetir en el detalle de la changa publicada, con la cuenta de Beto.
- Esperado: cada botón muestra su propio ícono y su propio indicador de carga (agregar un documento no activa el de foto o video). Un archivo de más de 100 MB no se agrega y avisa cuántos se descartaron; los demás sí se suben. La imagen se abre en pantalla completa, el video se reproduce en su propia pantalla con controles y el documento se abre con la app del teléfono (si no hay ninguna, avisa). Al llegar a 10 adjuntos no deja agregar más.
- Observaciones: _

**2.11 Pasos del asistente de publicar** · Rol: Ana
- [ x ] Pasos: publicar una changa individual sin hitos, y otra con hitos, mirando el contador de pasos y la barra de avance.
- Esperado: cada paso tiene una sola idea. Sin hitos son 7 pasos: qué necesitás, dónde y cuándo, fotos, cómo se paga, cuánto pagás, qué evidencia pedís (con una explicación) y revisar. "Cómo se paga" pregunta primero si se divide en hitos; con "Sí" se cargan los hitos y los materiales, con "No" no hay nada más que elegir. "Cuánto pagás" viene después: sin hitos se escribe el monto o la meta; con hitos el total aparece fijo, calculado como la suma de los hitos (con un botón para volver a editarlos), y no se puede escribir. Si el monto es grande o el plazo largo y no se eligieron hitos, "Cuánto pagás" sugiere volver a dividirlos. Con hitos no hay paso de evidencia (cada hito pide la suya) y el total de pasos pasa a 6 en cuanto se elige "Sí". En el paso de evidencia no deja avanzar sin al menos una prueba, y se pueden agregar hasta 5 y quitarlas con el tacho.

**2.10 Monto mínimo** · Rol: Ana
- [ x ] Pasos: intentar publicar una changa de 4,99 USDC y otra de 5 USDC; repetir con una por hitos cuyo total sea menor.
- Esperado: por debajo de 5 USDC no deja avanzar y avisa "El monto mínimo es 5 USDC". El contrato también lo rechaza, aunque se intente publicar por afuera de la app.

**2.9 Pedidos de evidencia al publicar** · Rol: Ana
- [ x ] Pasos: en el paso de precio, agregar varios pedidos de evidencia con "Agregar un pedido" y borrar uno con el tacho.
- Esperado: el botón de agregar tiene ícono y borde; el tacho quita solo ese pedido.

## 3. Postulación y acuerdo

**3.1 Postularse** · Rol: Beto
- [ x ] Pasos: abrir la changa → "Postularme" → monto (el mismo o contraoferta, más chica o más grande) y mensaje → confirmar la garantía.
- Esperado: queda retenida la garantía de postulante. Ana recibe un aviso de nueva postulación. Si el monto es mayor al publicado, el campo avisa cuánto es de más y que quien publica tendrá que sumar esa diferencia. (Las contraofertas más altas se prueban completas en 3.8.)

**3.2 Ver postulaciones y elegir** · Rol: Ana
- [ x ] Pasos: Mis trabajos → la changa → postulaciones → perfil de Beto → "Elegir".
- Esperado: se ve la reputación y la actividad de Beto; Beto recibe el aviso "Te eligieron".

**3.3 Cancelar después de una postulación** · Rol: Ana y Beto
- [ x ] Pasos: Beto se postula y después se baja de la postulación. Ana cancela la changa. Repetir con una changa de 10 USDC y con una de 5.000 USDC. Repetir con una changa a la que nadie se postuló.
- Esperado: sin postulaciones, cancelar es gratis. Con una postulación, aunque se haya retirado, cancelar cuesta el 2% del monto con un mínimo de 0,50 USDC y un máximo de 10 USDC, que va al tesoro (no a Beto). En la de 10 USDC cobra 0,50 (el mínimo); en la de 5.000 cobra 10 (el tope). El aviso de la confirmación y el del último paso de publicar dicen lo mismo. Si el servidor no logró avisar al contrato de la postulación, se reintenta; verificar en `hadApplicants` de la orden.
- Observaciones: _

**3.4 Acuerdo con dos firmas** · Rol: Ana y Beto
- [ x ] Pasos: ambos abren el acuerdo → ven el resumen → cada uno firma.
- Esperado: queda "Acordada". El pago sigue en garantía. Se ve el chat y, si es presencial, el aviso de que la ubicación es aproximada y que la dirección exacta se pasa por el chat (la app no guarda direcciones exactas).
- Observaciones: _

**3.5 Acuerdo que vence** · Rol: Ana y Beto
- [ x ] Pasos: firma solo una de las partes y se deja pasar el plazo.
- Esperado: el acuerdo vence y la changa vuelve a estar abierta. (Verificable en el e2e si el plazo es largo.)

**3.6 Rechazar el acuerdo** · Rol: Beto
- [ x ] Pasos: rechazar en vez de firmar.
- Esperado: vuelve a estar abierta; la garantía se libera.

**3.7 Ajustar el plan en la postulación (hitos), mismo total** · Rol: Beto y Ana
- [ x ] Pasos: en una changa con hitos, Beto se postula proponiendo cambios de nombres, criterios o reparto entre hitos, sin cambiar el total. Probar dos veces, una por cada camino.
- Esperado al postularse: Beto ve en su chat "Mandaste una propuesta de cambio" y en el detalle de la changa "Tu plan propuesto". Ana ve en el chat y en las postulaciones "Beto te propone cambios", con el plan propuesto junto al original. No hay diferencia de monto, así que no hay aviso de suma ni de devolución.
- **Camino A, Ana acepta:** toca "Aceptar" y confirma que está eligiendo a Beto. Se manda el acuerdo con el plan de Beto, Beto lo firma y queda lo acordado. Ese plan no se puede editar después.
- **Camino B, Ana rechaza:** toca "Rechazar" y confirma. Beto sigue postulado con el plan original (su propuesta desaparece) y en su chat figura "rechazó tu propuesta". Ana todavía puede elegirlo con el plan original, y Beto puede mandar otra propuesta.

**3.8 Contraoferta más alta: Ana suma la diferencia** · Rol: Ana y Beto
- [ x ] Pasos: Ana publica una changa de 100 USDC → Beto se postula con 150 (ve el aviso de cuánto es de más) → Ana abre las postulaciones y toca "Elegir" → aparece la confirmación con el precio pedido, el publicado y la diferencia → "Sumar y elegir" → firma el permiso → se manda la propuesta → Beto la abre y firma el acuerdo.
- Esperado: Ana deposita en garantía solo la diferencia (50 USDC); su saldo baja en ese monto. La changa pasa a mostrarse a 150 USDC sin que Ana la edite. Después se firma el acuerdo por 150 y el pago en garantía queda en 150. Si Ana cancela la confirmación, no se mueve plata. Si no le alcanza el saldo, avisa cuánto falta y no hace nada. Si el indexador tarda en reflejar la suma, la app espera y, pasado un rato, pide volver a elegir sin perder la suma depositada.
- Observaciones: _

**3.9 Contraoferta más baja** · Rol: Ana y Beto
- [ x ] Pasos: con una changa de 100 USDC, Beto se postula con 80 → Ana lo elige → ambos firman.
- Esperado: no hay confirmación de suma. Al acordar por 80 le vuelven 20 USDC a Ana y el pago en garantía queda en 80.
- Observaciones: _

**3.10 Plan de hitos con total menor** · Rol: Beto y Ana
- [ x ] Pasos: Ana publica una changa con hitos de 100 USDC (por ejemplo 50 y 50) → Beto se postula cambiando el plan a un total de 80 → el formulario avisa que son 20 menos y que la diferencia vuelve a quien publica → Ana ve el plan propuesto y la oferta de 80 → "Elegir" → ambos firman.
- Esperado: no hay confirmación de suma. Se firma por 80, los hitos suman 80 y al acordar le vuelven 20 USDC a Ana. Los pagos de los hitos salen del nuevo plan.
- Observaciones: _

**3.11 Plan de hitos con total mayor** · Rol: Beto y Ana
- [ x ] Pasos: con la misma changa de 100 USDC, Beto se postula con un plan de 150 → el formulario avisa que son 50 más y que Ana tendrá que sumar esa diferencia → Ana toca "Elegir" → confirmación "Sumar y elegir" → firma el permiso → se manda la propuesta → ambos firman.
- Esperado: Ana deposita solo la diferencia (50 USDC) y la changa pasa a mostrarse a 150. Se firma por 150 y los hitos suman 150. Si Ana cancela la confirmación o no le alcanza el saldo, no se mueve plata. Si otra persona se había postulado con el plan original, después de este `topUp` se la puede elegir igual por 100 y le vuelve a Ana la diferencia.
- Observaciones: _

**3.12 Plan inválido** · Rol: Beto
- [ x ] Pasos: en la postulación con plan, dejar un hito sin nombre, criterio o evidencia, o con monto 0, o un solo hito.
- Esperado: no deja enviar. (El servidor también lo rechaza si se intenta por afuera de la app.)

**3.13 Propuesta del postulante en el chat: aceptar o rechazar** · Rol: Beto y Ana
- [ x ] Pasos: Beto se postula con un plan de hitos distinto (o con otro monto) → en su chat ve el aviso "Mandaste una propuesta de cambio" con el total, y en el detalle de la changa ve "Tu plan propuesto" → Ana abre el chat y ve "Beto te propone cambios" con el plan, el total y la diferencia contra lo publicado → toca "Rechazar" y confirma.
- Esperado: Beto sigue postulado, con las condiciones publicadas (su plan o monto propuesto desaparece), y en su chat figura "rechazó tu propuesta". Ana todavía puede elegirlo, y también ver su postulación en la lista. Después Beto puede mandar una propuesta nueva. Repetir pero tocando "Aceptar": aparece el aviso "Si la aceptás, estás eligiendo a Beto…"; al confirmar se manda el acuerdo (con la suma de la diferencia si el total es mayor, como en 3.11) y la tarjeta pasa a "Propuesta enviada". En la lista de postulaciones también se ve "Rechazar propuesta" en las que traen propuesta.
- Observaciones: _

## 4. Chat y notificaciones

**4.1 Chat entre las partes** · Rol: Ana y Beto
- [ x ] Pasos: abrir el chat desde la changa → enviar texto y una imagen.
- Esperado: el otro lo ve en tiempo real. Los mensajes viajan cifrados. Cerrar y volver a abrir conserva el historial.

**4.2 Lista de mensajes** · Rol: Ana y Beto
- [ x ] Pasos: pestaña Mensajes, con varios chats (de la misma changa con distintos postulantes, y de changas distintas).
- Esperado: cada fila muestra la inicial y el nombre de la otra persona, "En: título de la changa" (así se distinguen los chats de una misma changa), la hora del último mensaje (hora si fue hoy, "Ayer", día de la semana o fecha) y el último mensaje. Si lo escribiste vos, empieza con "Vos:". Si el último mensaje solo tiene adjuntos, dice "Foto", "PDF" o "N fotos / archivos". Los chats con mensajes sin leer muestran el nombre y el mensaje en negrita, la hora en color y un número con la cantidad. Un chat sin mensajes dice "Todavía no hay mensajes…" (a quien publicó) o "Esperando que te conteste" (a quien se postuló). Están ordenados por el último mensaje.
- Observaciones: _

**4.14 Contador en la pestaña y privacidad de lo leído** · Rol: Ana y Beto
- [ x ] Pasos: con la app en otra pestaña, que la otra persona escriba en dos chats distintos. Abrir uno. Después mirar si la otra persona puede saber si leíste.
- Esperado: la pestaña Mensajes muestra un número con la cantidad de chats con algo sin leer (2) y baja a 1 al abrir uno. La otra persona no ve en ningún momento que leíste el mensaje, ni "en línea".

**4.15 Cambio de celular** · Rol: Ana
- [ x ] Pasos: instalar la app en otro celular (o en el otro emulador), ingresar con la misma billetera y activar el chat.
- Esperado: se piden las dos firmas de activación una vez. Al terminar, la lista muestra con quién hablás y el último mensaje de cada chat sin entrar a ninguno, y al abrir un chat se ve todo el historial. Antes de activar, la lista muestra "Mensaje nuevo" en los que tienen algo sin leer.
- Observaciones: _

**4.3 Centro de notificaciones** · Rol: cualquiera
- [ x ] Pasos: durante los flujos anteriores, abrir la campanita.
- Esperado: hay una notificación por evento (nueva postulación, te eligieron, pago en garantía, etc.), con contador de no leídas; al tocarla abre la pantalla de la changa.

**4.5 Activar el chat al postularse y al entrar** · Rol: Beto y Ana
- [ x ] Pasos: con una cuenta que nunca activó el chat, Beto se postula; después Ana entra por primera vez al chat de esa postulación.
- Esperado: al postularse, la pantalla avisa que se va a pedir una firma para el chat privado (porque va cifrado); Beto firma dos mensajes una sola vez y no cuesta nada. Ana, al abrir el chat por primera vez, ve la pantalla "Activá tu chat privado" con la explicación y el botón "Activar chat" antes de que aparezca la firma. Si Beto cancela la firma, la postulación queda enviada y el chat se activa la próxima vez. En un celular nuevo con la misma billetera se piden las firmas otra vez y se ve todo el historial.
- Observaciones: _

**4.6 Quién escribe primero** · Rol: Beto y Ana
- [ x ] Pasos: Beto abre el chat de su postulación antes de que Ana conteste. Después Ana abre el chat y escribe. Beto responde.
- Esperado: antes de que Ana conteste, Beto ve su mensaje de postulación como primer recuadro ("Tu mensaje de postulación"), no puede escribir y ve el aviso de que espere. Ana ve ese mismo mensaje ("Mensaje de postulación") y puede escribir. En cuanto Ana contesta, a Beto se le habilita el campo sin cerrar el chat.
- Observaciones: _

**4.7 Bloqueo de datos de contacto** · Rol: Ana y Beto
- [ x ] Pasos: antes del acuerdo, intentar enviar un teléfono (`11 5555 1234`), un mail, un enlace (`wa.me/...`) y un usuario (`@nombre`). Probar también un monto como `1.500.000` y una dirección como `Neuquén 1021`. Después de firmar el acuerdo, repetir.
- Esperado: antes del acuerdo, los datos de contacto no se envían y aparece un aviso que explica por qué; los montos y direcciones sí se envían. Hay un aviso fijo sobre el campo de texto. Después del acuerdo se pueden compartir.
- Observaciones: _

**4.8 Límite de mensajes** · Rol: cualquiera
- [ x ] Pasos: enviar muchos mensajes seguidos.
- Esperado: no más de 20 por minuto ni 200 por hora por persona, y la conversación se cierra al llegar a 2.000 mensajes. Al pasarse, el mensaje queda como "No se envió" con la opción de reintentar.

**4.9 Descartar y bloquear a un postulante** · Rol: Ana y Beto
- [ x ] Pasos: Beto se postula. Ana abre las postulaciones, toca los tres puntos de la tarjeta de Beto y elige "Descartar postulación". Después, con otra postulación, elige "Descartar y bloquear". Repetir desde el menú del chat.
- Esperado: pide confirmación. Al descartar, el chat de esa postulación queda de solo lectura para los dos y Beto no puede volver a postularse a ese trabajo, pero sí a otros de Ana. Al bloquear, Beto tampoco puede postularse a ningún trabajo de Ana, y sus otras postulaciones activas a trabajos de Ana quedan descartadas. En la lista de Beto la postulación figura como "Descartada". Beto no recibe un aviso de que lo bloquearon.
- Observaciones: _

**4.10 Bajarse de la postulación y bloquear a quien publicó** · Rol: Beto
- [ x ] Pasos: desde el menú del chat, "Bajarme de la postulación"; en otra postulación, "Bloquear a esta persona".
- Esperado: al bajarse, la postulación pasa a "Retirada" y el chat queda cerrado; puede volver a postularse. Al bloquear a Ana, retira sus postulaciones a los trabajos de ella y no puede postularse a nuevos.

**4.11 Reportar a una persona desde el chat** · Rol: Ana y Beto
- [ x ] Pasos: menú del chat o de la postulación → "Reportar a esta persona" → motivo → enviar.
- Esperado: abre la pantalla de reporte con la persona ya elegida. El reporte llega al panel (sección Reportes). No se puede reportar dos veces lo mismo.

**4.12 Adjuntos en el chat** · Rol: Ana y Beto
- [ x ] Pasos: con el chat abierto en las dos direcciones, tocar el clip y mandar una foto sacada en el momento, fotos de la galería (varias a la vez) y un PDF. Probar un archivo de más de 10 MB y agregar más de 5 en un mismo mensaje. Tocar los adjuntos que recibís.
- Esperado: el clip ofrece "Sacar una foto", "Elegir fotos" y "Elegir un PDF". Los archivos elegidos aparecen como chips sobre el campo de texto y se pueden quitar. Un archivo de más de 10 MB no se agrega y avisa; el máximo es de 5 por mensaje. Se puede enviar solo adjuntos, sin texto. Mientras suben, el globo dice "Enviando adjuntos". El otro lado los ve con su nombre y tamaño, y al tocarlos se abre la foto en pantalla completa o el PDF con la app del teléfono. Los archivos viajan cifrados: en el servidor son solo bytes sin sentido, y solo las dos personas del chat los pueden bajar. Si un envío falla, queda como "No se envió" y se puede reintentar sin volver a elegir los archivos.
- Observaciones: _

**4.13 Botones y tarjeta del chat** · Rol: Ana y Beto
- [ x ] Pasos: abrir un chat.
- Esperado: el botón de enviar es un círculo con el ícono de avión de papel, y se apaga si no hay texto ni adjuntos. En la cabecera hay un botón con el maletín que abre el detalle del trabajo y vuelve al chat. Arriba del chat hay una tarjeta "Pago protegido" que se puede plegar y desplegar y recuerda su estado mientras la app está abierta. Debajo está el mensaje de la postulación.
- Observaciones: _

## 5. Hacer la changa y cobrar (escenario A)

Con la changa individual presencial ya acordada (prueba 3.4).

**5.1 Llegada** · Rol: Beto
- [ x ] Pasos: el día de la changa, "Llegué".
- Esperado: se registra la hora y la ubicación. Fuera de zona advierte pero deja continuar con motivo.

**5.2 Cargar evidencia** · Rol: Beto
- [ x ] Pasos: subir las fotos o videos pedidos en el acuerdo.
- Esperado: se suben cifradas con una sola firma por tanda. Si falta lo pedido, no deja cerrar.

**5.3 Marcar como terminada** · Rol: Beto
- [ x ] Pasos: "Terminé".
- Esperado: Ana recibe el aviso "Revisá el trabajo".

**5.4 Revisar y aprobar** · Rol: Ana
- [ x ] Pasos: ver evidencia y acuerdo → "Está todo bien".
- Esperado: se pasa a la liberación del pago.

**5.5 Cobro en persona con QR** · Rol: Ana y Beto
- [ x ] Pasos: Ana muestra el QR de liberación → Beto lo escanea con la cámara.
- Esperado: el pago llega a Beto, la garantía de Beto se devuelve, se cobra la comisión. Ambos ven "Listo, se liberó el pago". Los saldos coinciden con lo anotado al empezar.
- Sin cámara: debajo del QR, Ana ve un código corto (por ejemplo `228D-QV28`). Beto, en la pantalla de escaneo, toca "Escribir código", lo tipea y toca "Cobrar". Mismo resultado que con el QR. Ana también puede tocar "Copiar código" y mandárselo por el chat. Un código mal escrito dice "Código inválido"; uno vencido deja de servir. Si el servidor no pudo guardar la liberación, Ana ve solo el QR, sin código.
- Observaciones: _

**5.6 Cobro a distancia por aprobación remota** · Rol: Ana y Beto
- [ x ] Pasos: sin QR, Ana aprueba remotamente y Beto cobra.
- Esperado: el mismo resultado que en 5.5.

**5.7 QR vencido o inválido** · Rol: Ana y Beto
- [ x ] Pasos: esperar a que venza el QR y escanearlo / escanear un QR cualquiera.
- Esperado: no libera plata; muestra un error claro. Ana puede generar otro.
- Cómo probar el vencido sin esperar un día: el QR dura 24 h y su vencimiento va firmado adentro, así que no se puede acortar después de generarlo. Para la prueba, levantar Metro con la duración corta (mínimo 60 s) y generar el QR con esa versión de la app:
  `cd app && EXPO_PUBLIC_RELEASE_VALIDITY_SECONDS=90 npx expo start --dev-client --port 8081`
  Generar el QR, esperar más de 90 s y escanearlo: debe decir que venció. Para el caso "inválido", escanear cualquier otro QR (por ejemplo uno de una página web). Volver a levantar Metro sin la variable para dejar la duración normal.

**5.8 Calificar y comprobante** · Rol: Ana y Beto
- [ x ] Pasos: calificar con estrellas. Beto abre el trabajo cerrado y toca "Reclamar comprobante" (opcional).
- Esperado: la calificación se refleja en el perfil de Beto. En el detalle del trabajo cerrado, Beto ve "Quien publicó te calificó con N de 5" y Ana ve "Calificaste este trabajo con N de 5"; las dos partes ven las pruebas subidas. El comprobante lo reclama solo Beto (Ana ve "todavía no reclamó" o "ya reclamó") y no se puede transferir. Una vez reclamado, el perfil de Beto muestra una tarjeta "Comprobantes" con la cantidad (la ve Beto en "Perfil" y Ana entrando al perfil de Beto); al tocarla se abre una pantalla con una medalla por trabajo, con el nombre de la changa, el rubro (por ejemplo Hogar) y la fecha de cierre, del más reciente al más antiguo. Las pruebas se conservan 180 días después del cierre.
- El comprobante tarda en figurar en el perfil hasta que el indexador procesa el evento (alrededor de un minuto). Al reclamarlo, la pantalla del trabajo lo marca enseguida.
- "Perfil" propio: ver "Mi historial" (calificación promedio, trabajos hechos y publicados, reclamos) y la tarjeta "Comprobantes".
- "Mis trabajos" → chip "Cerrados": todos los trabajos pagados en los que participó (como quien publicó o como quien lo hizo), del cierre más reciente al más antiguo, con "Cerrado el {fecha}". Tocar uno abre el detalle con la calificación, las pruebas y el comprobante.

**5.9 Liberación automática** · Rol: Ana y Beto
- [ x ] Pasos: Beto termina, Ana no responde.
- Esperado: pasado el plazo (24 h en changa corta), el pago se libera solo a Beto. Verificar con el e2e o con plazos cortos de DEMO.

## 6. Changas por hitos

Con la changa por hitos acordada (2.5 y 3.4).

**6.1 Ciclo de un hito** · Rol: Beto y Ana
- [ x ] Pasos: Beto informa avance y entrega el primer hito con evidencia → Ana lo revisa contra los criterios → aprueba / cobra por QR.
- Esperado: se paga solo ese hito. El tablero muestra el estado de cada hito, lo pagado y lo restante. El siguiente hito pasa a ser el actual.

**6.2 Pago fuera de orden** · Rol: Beto
- [ x ] Pasos: intentar entregar el hito 2 antes del 1.
- Esperado: no se puede; solo el hito actual.

**6.3 Liberación automática de un hito** · Rol: Ana y Beto
- [ x ] Esperado: sin respuesta de Ana, a las 72 h el hito se libera solo. Verificar con el e2e.

**6.4 Reclamo de un hito** · Rol: Ana
- [ x ] Pasos: "Tengo un problema" en un hito entregado.
- Esperado: el hito en reclamo aparece con la etiqueta "En reclamo" y un aviso dice cuál es. Pasa al flujo de jurado (ver sección 8). Mientras el jurado resuelve, el contrato pone en pausa todo el trabajo: no se puede entregar ni aprobar otro hito, ni terminar ni dejar el trabajo. Al resolverse, el hito se paga según el veredicto y el trabajo sigue con los hitos que faltan. Un hito chico no va a jurado: se reparte 50/50 al instante y el trabajo sigue sin pausa.

**6.5 Terminar sin causa** · Rol: Ana
- [ x ] Pasos: terminar la changa a mitad, sin causa, con un hito pagado y uno en curso.
- Esperado: se pagan los hitos verificados, el hito en curso proporcional, vuelven los hitos sin empezar y hay una compensación adicional para Beto. El monto se muestra antes de confirmar. Beto puede subir evidencia de avance para el proporcional.
- Observaciones: el contrato no distingue el motivo ("sin causa" o "con causa"); anotar qué se ve en la app.

**6.6 Abandono por parte del prestador** · Rol: Beto y Ana
- [ x ] Pasos: Beto renuncia explícitamente o queda inactivo pasada la fecha límite.
- Esperado: se pagan los hitos verificados, se pierde el hito en curso y reputación, y Ana puede volver a publicar con el dinero restante.

## 7. Cancelaciones escalonadas (escenario D)

Cada fila es una prueba distinta; usar changas nuevas y anotar el costo real.

- [ x ] **7.1 Cancelar sin postulaciones:** gratis. (Es la 2.6.)
- [ x ] **7.2 Cancelar con postulaciones, antes de acordar:** 2% del monto (mínimo 0,50 USDC, máximo 10 USDC) al tesoro, aunque el postulante se haya bajado. Con la reserva firmada es lo mismo y el prestador reservado no cobra. (Es la 3.3.)
- [ x ] **7.3 Cancelar tras acordar con 24 horas o más de anticipación al comienzo:** el mismo 2% (mínimo 0,50, máximo 10) al tesoro. Ya no hay cupos de cancelación gratis: la tercera y la cuarta cuestan igual que la primera.
- [ x ] **7.4 Cancelar tras acordar con menos de 24 horas o ya comenzada:** 10% del monto bloqueado; el 80% va al prestador y el 20% al tesoro.
- [ x ] **7.5 Cancelar tras acordar una changa sin fecha de inicio (por ejemplo a distancia):** durante las primeras 24 horas desde el acuerdo cuesta el 2%; pasado ese tiempo, 10% con el reparto de 7.4.
- [ x ] **7.6 No presentación de quien publicó:** Beto hace check-in en una changa presencial con fecha fija y Ana no confirma su llegada. Esperado: sin check-in, o antes de los 20 minutos de espera, el reclamo es rechazado; pasados los 20 minutos Beto reclama y cobra el 8% del monto, el tesoro el 2% y Ana recupera el 90%. Baja la reputación de Ana. (Cubierto por `app/e2e/noShow.e2e.ts`.)
- [ x ] **7.7 Estado "Cancelando":** después de cancelar una changa (cualquiera de las anteriores), mientras el indexador la refleja. Esperado: en el detalle desaparecen los botones de cancelar, ver postulaciones y grupo, y se lee "Cancelando"; en Mis trabajos y en las tarjetas figura "Cancelando"; deja de aparecer en el mapa y en la lista. Pasados unos segundos queda como cancelada. Nadie puede postularse mientras tanto.
- [ x ] **7.8 Cancela el prestador:** Beto cancela tras acordar. Esperado: Ana recupera todo, sin costo para nadie; solo baja la reputación de Beto.
## 8. Reclamo y jurado (escenario C)

### 8.1 Ser jurado

**8.1.1 Depositar garantía y anotarse** · Rol: J1 a J5
- [ x ] Pasos: Perfil → Ser jurado → depositar la garantía (10 USDC) → "Anotarme".
- Esperado: la garantía aparece como depositada. Se puede retirar la parte libre. Las cuentas con menos de la garantía necesaria quedan sin poder anotarse, con un aviso de qué falta. (Tras el redespliegue del 14/11 hay que repetirlo para las cinco cuentas.)

### 8.2 Disputa chica (sin jurado)

**8.2.1 Reclamo por un monto hasta 20 USDC** · Rol: Ana
- [ x ] Esperado: se reparte 50/50 sin jurado.

**8.2.2 Tope de reclamos chicos por mes** · Rol: Ana
- [ x ] Pasos: con un reclamo chico ya hecho este mes, abrir un segundo trabajo chico entregado por Beto y tocar "Tengo un problema".
- Esperado: el tope es 1 por cuenta por mes. La pantalla avisa que ya usó su reclamo del mes y el botón queda deshabilitado; no se mueve plata. Le queda aprobar el trabajo. (En Sepolia se bajó de 3 a 1 el 18/11 con `contracts/script/SetParameter.s.sol`, antes del traspaso a gobernanza.)
- Además: el prestador recibe la notificación "Abrieron un reclamo" (reparto 50/50, sin jurado) y el chat dice que se resolvió al instante; en el trabajo, el relato se lee como texto y no hay comprobante (el trabajo terminó en reclamo chico). Requiere el backend desplegado.

### 8.3 Disputa con jurado (monto medio, 3 jurados)

**8.3.1 Abrir reclamo** · Rol: Ana
- [ x ] Pasos: Beto entregó; Ana toca "Tengo un problema" y sigue los 4 pasos: 1. Cómo sigue el reclamo (flujo con los plazos reales y el costo), 2. Contá qué pasó, 3. Sumá pruebas (opcional: fotos, videos o documentos, se ven como miniaturas y se abren al tocarlas), 4. Revisá y abrí el reclamo (resumen de lo que se va a subir) → confirmar el costo del reclamo.
- Esperado: el pago queda congelado. Beto recibe el aviso "Abrieron un reclamo". El botón de atrás vuelve al paso anterior. El relato y los archivos se suben juntos con una sola firma.

**8.3.2 Responder** · Rol: Beto
- [ x ] Pasos: abrir el reclamo → "Tu versión" con sus pruebas opcionales → Responder, dentro del plazo de respuesta (15 min en Sepolia).
- Esperado: se ven las dos versiones. Pasado el plazo, la app avisa "Se venció el plazo para responder" y no sube nada.

**8.3.3 Anotarse a un reclamo** · Rol: J1 a J3
- [ x ] Pasos: Perfil → "Cómo usás la app" → Jurado → Reclamos. Cuando Beto responde llega el aviso "Reclamo buscando jurados" (solo a quienes ya depositaron garantía). Abrir la tarjeta del reclamo y tocar "Anotarme" dentro del plazo de anotación (15 min).
- Esperado: la tarjeta muestra, antes de anotarse, solo rubro, modalidad, monto y lo acordado antes del trabajo (sin título, relatos, pruebas ni identidades). Al anotarse, la pastilla pasa a "Anotado" y el texto dice cuándo hay que revelar y cuándo llega el resultado. Los filtros (Para anotarme, Para revelar, Ya anotado, No me anoté) clasifican bien y el número de la pestaña Reclamos cuenta solo lo que hay para hacer. No pueden anotarse, y ven "No cumplís los requisitos": las partes del caso, quien no tiene 10 USDC libres de garantía (la parte "en uso" en otro caso no cuenta), quien ya tiene 2 casos activos, y quien no cumple la credencial o el historial mínimos. Con la garantía en uso, la pestaña dice cuánto falta y por qué.
- Observaciones: _

**8.3.4 Revelar el número del sorteo** · Rol: J1 a J3
- [ x ] Pasos: cuando cierra la anotación llega el aviso "Revelá tu número del sorteo" (y otro 10 minutos antes del cierre). Reclamos → "Revelar", dentro de otros 15 min.
- Esperado: la tarjeta pasa a "Revelado" y dice a qué hora se hace el sorteo. No se puede revelar antes de que cierre la anotación. El número es un secreto al azar de la app: no mueve plata ni garantía. Si se borran los datos de la app antes de revelar, la tarjeta avisa que se perdió el secreto y esa cuenta queda fuera de esa ronda. Quien revela deja de recibir el recordatorio.

**8.3.14 Sin jurados suficientes** · Rol: Admin
- [ x ] Pasos: en una ronda se anotan o revelan menos jurados de los necesarios.
- Esperado: se abre otra ronda con plazos nuevos (hasta 3 reemplazos, 4 rondas en total; las partes ven "ronda N de hasta 4"). Si ninguna alcanza, el caso queda "Lo resuelve el administrador" y aparece en el panel (sección Reclamos sin jurado, con un número). El administrador firma con motivo eligiendo a favor de Parte A o Parte B: el pago va entero a quien decide, se devuelve el costo del reclamo a quien reclamó (y el de la apelación a quien apeló) y queda en el registro. No hay plazo para que el administrador resuelva ni aviso: hasta que firme el pago queda congelado (anotado en el plan a futuro, sección 8).
- Observaciones: _

## 10. Perfil, actividad y ajustes

**10.1 Perfil propio** · Rol: Ana y Beto
- [ x ] Esperado: saldo de USDC, estado de verificación y "Tu actividad" (cobrado, pagado, por cobrar, en garantía), consistente con lo vivido en las pruebas.

**10.2 Perfil público y reporte** · Rol: Ana
- [ x ] Pasos: abrir el perfil de Beto desde una postulación → "Reportar usuario".
- Esperado: el reporte llega al panel (sección Reportes).

**10.3 Reportar una changa** · Rol: Beto
- [ x ] Pasos: reportar una changa o un adjunto.
- Esperado: aparece en el panel y se puede bajar la oferta.

**10.4 Ajustes** · Rol: cualquiera
- [ x ] Pasos: Perfil → Ajustes.
- Esperado: muestra la billetera, versión, red (Sepolia, modo demostración) y servidor. El interruptor de notificaciones se oculta o aparece según el estado del proyecto de Expo. "Editar mis datos" y "Sacar selfie" abren sus pantallas.

**10.5 Editar mis datos** · Rol: Ana
- [ x ] Pasos: cambiar nombre y zona.
- Esperado: se guarda y se refleja en el perfil.

## 11. Panel de administración (escenario H)

Servidor local o de dev, panel contra ese servidor, entrando con la cuenta Admin.

**11.1 Ingreso** · Rol: Admin
- [ x ] Pasos: conectar MetaMask → firmar.
- Esperado: entra. Con otra cuenta, no entra. La pantalla de ingreso tiene la banda ladrillo con el logo y el título; dentro la barra lateral muestra el logo en blanco. Si el panel corre en `localhost:5173` contra el servidor de la nube, el servidor tiene que tener `ADMIN_ORIGINS` cargado; si no, el ingreso falla por CORS.

**11.2 Resumen** · Rol: Admin
- [ x ] Esperado: changas por estado, volumen en garantía, reclamos abiertos y salud del indexador y del relayer, coherentes con lo hecho en las pruebas.

**11.3 Changas** · Rol: Admin
- [ x ] Pasos: ver el detalle de una changa → bajarla con motivo → restaurarla.
- Esperado: queda oculta y luego visible; el archivo y su hash no se borran. Queda en el registro.

**11.4 Reportes** · Rol: Admin
- [ x ] Pasos: ver la cola de reportes de las pruebas 10.2 y 10.3.
- Esperado: se ve el reporte con vista previa y se puede resolver.

**11.6 Selfies** · Rol: Admin
- [ x ] Es la 1.3.

## 15. Casos transversales

**15.1 Sin conexión** · [ x ] Cortar la red a mitad de una acción. Esperado: mensaje claro, "No se movió plata", y al volver se puede reintentar.

**15.2 Rechazar una firma** · [ x ] Cancelar la firma en MetaMask en el depósito, el acuerdo y el QR. Esperado: no se ejecuta nada y se puede reintentar.

**15.3 Saldo insuficiente** · [ x ] Postularse o aportar sin saldo. Esperado: indica cuánto falta.

**15.4 Doble toque / reintento** · [ x ] Tocar dos veces "Confirmar" o reenviar la misma firma. Esperado: no se duplica el movimiento de plata.

**15.6 Indexador atrasado** · [ x ] Apagar el cron un rato y volver a prenderlo. Esperado: las pantallas se ponen al día sin perder eventos.

**15.7 Permisos entre roles** · [ x ] Con la cuenta de Beto, intentar abrir pantallas o acciones de Ana (aprobar un trabajo ajeno, generar el QR de otra changa) y viceversa. Esperado: no se puede.

**15.8 Sesión vencida** · [ x ] Usar un token vencido. Esperado: pide volver a ingresar sin perder datos.

**15.9 Dos dispositivos con la misma cuenta** · [ x ] Entrar con la misma billetera en dos celulares. Esperado: ambos ven el mismo estado y el chat se descifra en los dos.

**15.10 Billetera desconectada** · [ x ] Dejar que la sesión de WalletConnect venza o desconectarla desde MetaMask y después intentar firmar (cancelar una changa, publicar). Esperado: en vez de un error técnico, aparece el aviso de que la billetera se desconectó con el botón para reconectar; al reconectar se puede repetir la acción y no se movió plata antes.

**15.11 Indexado rápido** · [ x ] Con el webhook de Alchemy configurado, hacer una acción en la cadena (publicar, aportar, cancelar) y mirar cuánto tarda en reflejarse en el mapa o en el detalle. Esperado: unos pocos segundos, sin esperar el minuto del reloj. Con el webhook apagado o con la clave de firma mal cargada, igual se refleja a más tardar al minuto.

**15.12 Interfaz consistente** · [ x ] Recorrer las pantallas con la guía de interfaz (`Junquero - guia de interfaz.md`) en la mano. Esperado: un solo botón principal por pantalla, ningún botón beige, todos los botones y filas con ícono; las acciones de detalle (compartir, retirar, perfil, ajustes, jurado) salen juntas en una tarjeta de filas con "Cerrar sesión" y las acciones que borran o retiran en rojo al final.

**15.13 Confirmaciones con toast** · [ x ] Aprobar, cobrar, votar, depositar como jurado, proponer un proveedor, copiar la dirección y reportar. Esperado: aparece "Enviado, esperando confirmación…", y recién cuando la red confirma y los montos ya se actualizaron sale el toast de éxito con ícono (dura unos 7 segundos, se cierra tocándolo). Nunca se ve "Listo" con los montos viejos. Cancelar la firma muestra un toast informativo, no un error.

**15.14 Elegir con confirmación y estados claros** · [ x ] Como quien publicó: tocar "Elegir" (en la lista o desde el chat). Esperado: pregunta "¿Elegir a ...?" con el monto. Después la tarjeta marca "Propuesta enviada" y no deja elegir de nuevo. Como la otra persona: aceptar el acuerdo y ver el aviso "Lo estamos confirmando"; en "Mis postulaciones" la tarjeta dice "Aceptaste... confirmando" y a los segundos pasa a "Te eligieron".

**15.15 Perfil con historial** · [ x ] Desde una postulación y desde el menú del chat, tocar "Ver perfil e historial". Esperado: nombre, verificado, desde cuándo está, calificación promedio, trabajos hechos y cerrados, reclamos y rubros.

**15.16 Campana de notificaciones** · [ x ] Recibir una notificación con la app abierta en el mapa. Esperado: el globito de la campana aparece solo; al entrar a Notificaciones se apaga.

**15.17 Camino del trabajo** · [ x ] Como quien trabaja y como quien publicó, abrir "Tu trabajo" (también un trabajo con hitos). Esperado: una tarjeta con los pasos (llegar, subir pruebas, terminar, esperar la aprobación / esperar, revisar, aprobar), el paso actual resaltado con su explicación y los hechos con tilde.

**15.18 Pruebas por pedido** · [ x ] Publicar una changa que pida dos pruebas (por ejemplo "Foto" y "Comprobante"), elegir a alguien y abrir "Tu trabajo" como esa persona. Esperado: primero solo aparece "Llegué" (si es presencial); después una tarjeta por cada prueba pedida con "Subir esta prueba"; al subir cada una se tilda como "Subida"; recién con todas tildadas aparece "Terminé". Quien publicó ve los archivos subidos.

**15.19 Acuerdo y pasos desde el chat** · [ x ] Elegir a alguien desde el chat. Esperado: en el chat de las dos personas aparece la tarjeta de propuesta (quien fue elegido acepta o rechaza; quien publicó espera o cancela). Al aceptar, aparece la tarjeta "Paso actual" con el mismo paso que el detalle del trabajo: "Llegué" (presencial), después "Ir a subir las pruebas", "Ir a terminar" y, para quien publicó, "Revisar y aprobar". Avanzar un paso en el chat se refleja en el detalle y al revés.

**15.20 Historial en el chat** · [ x ] Recorrer el flujo completo con dos cuentas y mirar el chat de cada una. Esperado: cada hecho aparece como una burbuja con ícono y hora (a la derecha si lo hiciste vos, a la izquierda si lo hizo la otra persona), mezclada con los mensajes por fecha:
- **Postulación:** postularse, bajarse, volver a postularse, que quien publicó descarte (si además bloquea, el chat solo dice "descartó la postulación").
- **Acuerdo:** mandar, rechazar, cancelar y aceptar la propuesta; una propuesta que venció; quedó acordado.
- **Trabajo:** llegó, subió pruebas (con la cantidad), terminó, aprobó ("ya podés cobrar"), extendió la revisión, pidió cambios, se liberó el pago.
- **Plata y reclamos:** se sumó plata al depósito, se canceló el trabajo, se abrió un reclamo, el jurado resolvió.
- **Hitos:** hito entregado, avance reportado, hito pagado, terminó antes de tiempo, abandonó.
Requiere el backend nuevo y las migraciones 0021 y 0022.

**15.21 Avisos en vivo y consumo** · [ x ] Con el chat de las dos cuentas abierto, hacer en una: proponer, aceptar, rechazar, bajarse, subir pruebas, llegar. Esperado: la otra cuenta lo ve en el chat al instante, sin refrescar. Cortar la red unos segundos y volver: el chat se pone al día solo. Mandar la app a segundo plano un rato y volver: se actualiza. En el log de Metro no debe haber un goteo constante de pedidos con la app quieta.

**15.22 Archivos vencidos y perfil** · [ x ] Después del despliegue: el perfil de alguien con trabajos cerrados muestra calificación promedio (ahora se guarda de forma duradera). Los adjuntos del chat con más de 90 días y las pruebas de trabajos cerrados hace más de 180 días se borran de R2 (revisar el almacenamiento tras la limpieza diaria de las 03:00 UTC).

