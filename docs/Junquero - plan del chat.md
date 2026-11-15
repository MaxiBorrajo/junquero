# Junquero: plan del chat

**Estado (15/11/2026):** las cuatro fases están hechas y probadas con tests. Falta la prueba manual en los emuladores. El indicador de "en línea" quedó afuera a propósito, para no mostrar si alguien está conectado ni si leyó.

Mejoras del chat entre quien publica y quien se postula. Decisiones tomadas el 15/11/2026. Se hace por fases, con tests en cada una.

## Decisiones

| Tema | Decisión |
| --- | --- |
| Contacto por afuera (teléfonos, mails, enlaces) | Bloqueo duro en el celular antes de enviar, hasta que haya acuerdo firmado. Después del acuerdo se puede compartir |
| Postulante sin respuesta | No puede escribir hasta que quien publica conteste; su mensaje de postulación es el primer globo del chat |
| Adjuntos | 10 MB por archivo, solo imágenes y PDF, hasta 5 por mensaje, cifrados de punta a punta |
| Mensaje de la postulación | Se muestra como primer globo ("Mensaje de postulación"), tomado de la postulación. Ese texto ya está en el servidor sin cifrar, así que no depende de que alguien haya activado el chat |
| Cambio de celular | Sin pérdida: la clave de chat se calcula a partir de una firma fija en la billetera y se regenera igual. Se piden las dos firmas de activación una vez en el celular nuevo |

## Fase 1: activación y reglas de acceso

- Quien se postula activa su chat en el momento de postularse. Antes de pedir la firma, un texto explica que es por el cifrado y que se hace una sola vez.
- Quien publica lo activa la primera vez que entra a un chat, con el mismo aviso previo.
- Mientras quien publica no haya contestado, el postulante no puede escribir. Al contestar se abre en las dos direcciones.
- Límite de ritmo del lado del servidor (mensajes por minuto y tope por conversación) contra el spam.
- Bloqueo duro de teléfonos, mails y enlaces hasta el acuerdo, con un aviso que explica por qué.

## Fase 2: seguridad entre personas

- Quien publica puede descartar o bloquear al postulante y reportarlo, desde la postulación y desde el chat. Al bloquear, el chat queda de solo lectura.
- El postulante puede bajarse de la postulación o reportar a quien publicó.
- Los reportes llegan a la sección Reportes del panel.

## Fase 3: interfaz del chat

- Botón de enviar como ícono (avión de papel), redondo y chico.
- Botón de adjuntos (clip) con los límites de arriba.
- Botón en la cabecera para ver rápido los detalles de la changa.
- **Tarjeta fija de "pago protegido":** en el chat, un recuadro que dice que la plata queda en garantía, que se libera cuando se confirma el trabajo y que hay jurado si algo sale mal; y que arreglar por afuera hace perder esas protecciones. Aparece desde el primer mensaje y no se puede cerrar del todo (se puede plegar). Apunta al momento en que alguien podría irse por afuera.
- Notificaciones: ya existe el aviso de mensaje nuevo; se revisa que cubra las respuestas y los adjuntos.

## Fase 4: lista de chats

- Cada fila muestra con quién se habla, en qué changa y el último mensaje.
- El servidor guarda el último mensaje ya cifrado y la lista lo trae junto con el resto; el celular lo descifra. Funciona en un celular nuevo, sin entrar a cada chat. Hoy hay un pedido por chat.
- El indicador de "en línea" queda para el final.

## Lo que no se puede evitar

El chat es cifrado de punta a punta: el servidor no puede leer los mensajes ni detectar números dentro de ellos, así que el bloqueo de contactos se hace en el celular y puede esquivarse. Dos personas que ya se conocen pueden seguir por fuera. La defensa es el valor que aporta la plataforma (garantía, jurado, reputación), no el bloqueo.
