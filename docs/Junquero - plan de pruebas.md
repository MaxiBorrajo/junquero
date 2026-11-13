# Junquero: plan de pruebas de flujos

Para probar a mano, con la app, el servidor y el panel, antes de la entrega del 24/11/2026. Son pruebas de flujo, pantallas y roles; no revisan detalles de interfaz. Cada prueba tiene un casillero para marcar.

**Cómo marcar:** `[ ]` pendiente · `[x]` anda como se espera · `[!]` falla (anotar en "Observaciones" qué pasó, en qué pantalla y la hora, para buscarlo en el log del servidor).

**Los textos de los botones pueden variar un poco.** Lo que importa es la acción y el resultado.

## 0. Preparación

### 0.1 Roles y cuentas

Cada rol es una billetera distinta. Los nombres son solo para este documento.

| Rol | Qué hace | Cuántas | Notas |
| --- | --- | --- | --- |
| Ana | Publica changas y paga (solicitante) | 1 | |
| Beto | Se postula y trabaja (prestador) | 1 | Tiene que haber cerrado changas sin reclamo para algunas reglas |
| J1, J2, J3 | Jurado | 3 (5 si se prueba una changa alta) | Cada una con la garantía de 10 USDC depositada |
| J4, J5 | Jurado de reemplazo y apelación | 2 | La apelación suma jurados (2N+1) |
| Gabi, Hugo, Ines | Aportantes de la changa grupal | 3 | Gabi publica, Hugo e Ines aportan |
| Admin | Panel de administración | 1 | La cuenta `0x4E5e…6511`, la del despliegue |
| Relayer | Paga el gas de las operaciones | 1 | No es una persona: tiene que tener ETH de Sepolia |

Las cuentas de demo ya están creadas en Sepolia (solicitante, prestador, cinco jurados, tres aportantes y un testigo), con credencial de nivel 0, jurados semilla y fondos de prueba. Sus direcciones están en `demoAccounts` de `contracts/deployments/sepolia.json` y sus claves en los keystores de Foundry de la compu de Maxi. Se pueden importar a MetaMask para no tener que crear ni fondear cuentas nuevas.

Con dos celulares o un celular y el emulador alcanza para los flujos de dos partes. Para jurados y aportantes se cambia de cuenta en la misma billetera o se usa más de un dispositivo.

### 0.2 Entorno

Elegir uno y anotarlo al empezar cada sesión.

- [ x ] **Local:** `backend` con `npm run dev`, emulador con `EXPO_PUBLIC_API_URL=http://localhost:8787` y panel con `npm run dev`. Ver `README.md`, sección "Levantar todo en local".
- [ ] **Dev (nube):** APK release instalado, servidor `junquero-api` desplegado con la última versión (`cd backend && npm run deploy`) y panel con `npm run dev:cloud`.

Antes de empezar:
- [ x ] `GET /health` del servidor responde `ok` y `lastIndexedBlock` avanza (el cron está indexando).
- [ x ] El relayer tiene ETH de Sepolia (ver saldo de su dirección).
- [ x ] Las pruebas automáticas pasan: `cd app && npm test`, `cd backend && npm test`, `cd admin && npm test`.
- [ ] Opcional: pruebas de punta a punta (`bash app/e2e/up.sh` y después `npx vitest run --config vitest.e2e.config.ts` en `/tmp/junquero-e2e/repo/app`), que cubren individual, hitos, grupal y reclamo con jurado contra una cadena local.

### 0.3 Fondos de prueba

- [ x ] Ana tiene USDC de prueba suficiente (por lo menos 200 para cubrir la changa por hitos y la de jurado).
- [ x ] Beto tiene USDC de prueba para la garantía de postulación.
- [ x ] Hugo, Gabi e Ines tienen USDC para aportar.
- [ x ] J1 a J5 tienen cada una 10 USDC de garantía depositada como jurado (ver 8.1).
- [ x ] Anotar los saldos iniciales de Ana y Beto para comprobar los movimientos de plata en cada prueba.

### 0.4 Plazos

El despliegue de Sepolia está en modo DEMO. Valores vigentes (según `Deploy.s.sol` y el traspaso):

| Qué | Valor en DEMO | ¿Se prueba en vivo? |
| --- | --- | --- |
| Responder un reclamo, aceptar la invitación de jurado, apelar, revelar la semilla, votar (commit) y revelar el voto | 5 minutos cada uno | Sí |
| Votación de parámetros: espera previa, período de votación y espera del Timelock | 1, 10 y 5 minutos | Sí, cuando exista la pantalla (ver sección 12) |
| Espera por no presentación | 20 minutos | Sí |
| Liberación automática de una changa corta y de un hito | 24 h y 72 h (el mínimo permitido es 1 h) | No: ver abajo |
| Gracia de la reserva del prestador | 12 h (el mínimo permitido es 0) | No: ver abajo |
| Vencimiento del acuerdo si una parte no firma | A verificar en el servidor (el diseño dice 24 h) | A verificar |

- Las ventanas del jurado y de la votación son de minutos, así que el escenario C y la votación se pueden recorrer completos en una sola sesión.
- La liberación automática (5.9 y 6.3) y la gracia de la reserva (3.3) no se pueden esperar. Hay dos caminos: la prueba de punta a punta, que avanza el reloj de una cadena local, o bajar el parámetro por votación una vez que exista la pantalla (la liberación automática admite hasta 1 hora y la gracia hasta 0).

---

## 1. Registro y perfil

**1.1 Ingreso con billetera** · Rol: cualquiera
- [ x ] Pasos: abrir la app sin sesión → elegir "Tengo una necesidad" o "Busco trabajo" → conectar MetaMask → firmar el mensaje de confirmación.
- Esperado: la firma no cuesta ni mueve plata. Queda la sesión y se pasa a crear el perfil.
- Observaciones: _

**1.2 Crear perfil y selfie** · Rol: Ana y Beto
- [ x ] Pasos: cargar nombre, rubros y zona de trabajo → sacar la selfie.
- Esperado: el perfil muestra "Junquero en revisión" hasta que se apruebe.
- Observaciones: _

**1.3 Aprobar la selfie desde el panel** · Rol: Admin
- [ x ] Pasos: panel → Selfies → aprobar la de Ana y la de Beto.
- Esperado: en la app pasa a "Junquero verificado". La imagen se borra del servidor y queda solo el estado.
- Variante: [ ! ] rechazar una selfie → en la app aparece "Verificación rechazada" y se puede sacar otra.

**1.4 Sin selfie verificada no se puede postular** · Rol: Beto
- [ x ] Pasos: con la cuenta aún sin verificar, intentar postularse a una changa.
- Esperado: se bloquea con un aviso. (Depende del valor `REQUIRE_VERIFIED_APPLICANT` del servidor; anotar con cuál se probó.)

**1.5 Cerrar sesión y volver a entrar** · Rol: cualquiera
- [ x ] Pasos: Perfil → Cerrar sesión → volver a ingresar con la misma billetera.
- Esperado: recupera su perfil, sus changas y su chat.

---

## 2. Publicar y explorar

**2.1 Publicar changa individual presencial** · Rol: Ana
- [ x ] Pasos: Publicar → completar los cinco pasos (qué necesitás, dónde y cuándo, fotos, cuánto pagás, revisar) → firmar el permiso del depósito → publicar.
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
- [ x ] Pasos: monto alto (más de 500 USDC) o plazo largo → ver el aviso que sugiere hitos, elegir Sí y armar 2 o más hitos con monto, criterio y evidencia → publicar.
- Esperado: sin importar el monto ni el plazo, "No" siempre se puede elegir; el aviso solo sugiere. En el detalle de la changa se ve "Pago por hitos" o "Pago único al finalizar". Los montos de los hitos suman el total, de lo contrario no deja avanzar. Los materiales se eligen entre "los compra quien publica" y "los pone quien trabaja"; no existe la opción de anticipo.

**2.6 Cancelar una changa abierta** · Rol: Ana
- [ ] Pasos: cancelar una changa sin postulaciones ni prestador reservado.
- Esperado: no tiene costo y el depósito vuelve a Ana.

---

## 3. Postulación y acuerdo

**3.1 Postularse** · Rol: Beto
- [ ] Pasos: abrir la changa → "Postularme" → monto (el mismo o contraoferta) y mensaje → confirmar la garantía.
- Esperado: queda retenida la garantía de postulante. Ana recibe un aviso de nueva postulación.

**3.2 Ver postulaciones y elegir** · Rol: Ana
- [ ] Pasos: Mis trabajos → la changa → postulaciones → perfil de Beto → "Elegir".
- Esperado: se ve la reputación y la actividad de Beto; Beto recibe el aviso "Te eligieron".

**3.3 Reserva del prestador** · Rol: Ana y Beto
- [ ] Pasos: Ana aparta a Beto y después cancela antes de que acuerden.
- Esperado: pasado el período de gracia, la cancelación tiene una compensación creciente para Beto con tope. Antes de la gracia es gratis. Anotar los montos observados.

**3.4 Acuerdo con dos firmas** · Rol: Ana y Beto
- [ ] Pasos: ambos abren el acuerdo → ven el resumen → cada uno firma.
- Esperado: queda "Acordada". El pago sigue en garantía. Aparece la dirección exacta (si es presencial) y el chat.
- Observaciones: _

**3.5 Acuerdo que vence** · Rol: Ana y Beto
- [ ] Pasos: firma solo una de las partes y se deja pasar el plazo.
- Esperado: el acuerdo vence y la changa vuelve a estar abierta. (Verificable en el e2e si el plazo es largo.)

**3.6 Rechazar el acuerdo** · Rol: Beto
- [ ] Pasos: rechazar en vez de firmar.
- Esperado: vuelve a estar abierta; la garantía se libera.

**3.7 Ajustar el plan en la postulación (hitos)** · Rol: Beto
- [ ] Pasos: en una changa con hitos, proponer cambios de montos o criterios al postularse.
- Esperado: Ana ve la comparación con el plan original. Lo que queda firmado es lo acordado, y no se edita después.

---

## 4. Chat y notificaciones

**4.1 Chat entre las partes** · Rol: Ana y Beto
- [ ] Pasos: abrir el chat desde la changa → enviar texto y una imagen.
- Esperado: el otro lo ve en tiempo real. Los mensajes viajan cifrados. Cerrar y volver a abrir conserva el historial.

**4.2 Mensajes** · Rol: Ana
- [ ] Pasos: pestaña Mensajes → lista de conversaciones.
- Esperado: aparece cada chat, ordenado por actividad.

**4.3 Centro de notificaciones** · Rol: cualquiera
- [ ] Pasos: durante los flujos anteriores, abrir la campanita.
- Esperado: hay una notificación por evento (nueva postulación, te eligieron, pago en garantía, etc.), con contador de no leídas; al tocarla abre la pantalla de la changa.

**4.4 Notificaciones push reales** · Rol: cualquiera
- 🛠 **POR DESARROLLAR:** requiere que Maxi cree el proyecto de Expo. Mientras tanto Ajustes muestra "No disponibles en esta versión". Cuando exista: probar que llegue un aviso con la app cerrada por cada evento de la tabla de notificaciones, que al tocarlo abra la changa correcta y que el interruptor de Ajustes lo apague y lo encienda.

---

## 5. Hacer la changa y cobrar (escenario A)

Con la changa individual presencial ya acordada (prueba 3.4).

**5.1 Llegada** · Rol: Beto
- [ ] Pasos: el día de la changa, "Llegué".
- Esperado: se registra la hora y la ubicación. Fuera de zona advierte pero deja continuar con motivo.

**5.2 Cargar evidencia** · Rol: Beto
- [ ] Pasos: subir las fotos o videos pedidos en el acuerdo.
- Esperado: se suben cifradas con una sola firma por tanda. Si falta lo pedido, no deja cerrar.

**5.3 Marcar como terminada** · Rol: Beto
- [ ] Pasos: "Terminé".
- Esperado: Ana recibe el aviso "Revisá el trabajo".

**5.4 Revisar y aprobar** · Rol: Ana
- [ ] Pasos: ver evidencia y acuerdo → "Está todo bien".
- Esperado: se pasa a la liberación del pago.

**5.5 Cobro en persona con QR** · Rol: Ana y Beto
- [ ] Pasos: Ana muestra el QR de liberación → Beto lo escanea con la cámara.
- Esperado: el pago llega a Beto, la garantía de Beto se devuelve, se cobra la comisión. Ambos ven "Listo, se liberó el pago". Los saldos coinciden con lo anotado al empezar.
- Observaciones: _

**5.6 Cobro a distancia por aprobación remota** · Rol: Ana y Beto
- [ ] Pasos: sin QR, Ana aprueba remotamente y Beto cobra.
- Esperado: el mismo resultado que en 5.5.

**5.7 QR vencido o inválido** · Rol: Ana y Beto
- [ ] Pasos: esperar a que venza el QR y escanearlo / escanear un QR cualquiera.
- Esperado: no libera plata; muestra un error claro. Ana puede generar otro.

**5.8 Calificar y comprobante** · Rol: Ana y Beto
- [ ] Pasos: calificar con estrellas. Beto reclama el comprobante intransferible (opcional).
- Esperado: la calificación se refleja en el perfil. El comprobante aparece solo para Beto y no se puede transferir.

**5.9 Liberación automática** · Rol: Ana y Beto
- [ ] Pasos: Beto termina, Ana no responde.
- Esperado: pasado el plazo (24 h en changa corta), el pago se libera solo a Beto. Verificar con el e2e o con plazos cortos de DEMO.

**5.10 Changa a distancia con pedido de cambios** · Rol: Ana y Beto
- [ ] Pasos: Beto entrega → Ana pide cambios (hasta 2 rondas) → Beto vuelve a entregar → Ana aprueba.
- Esperado: no hay QR; se libera con "Está todo bien". Una tercera ronda de cambios no se permite.

---

## 6. Changas por hitos

Con la changa por hitos acordada (2.5 y 3.4).

**6.1 Ciclo de un hito** · Rol: Beto y Ana
- [ ] Pasos: Beto informa avance y entrega el primer hito con evidencia → Ana lo revisa contra los criterios → aprueba / cobra por QR.
- Esperado: se paga solo ese hito. El tablero muestra el estado de cada hito, lo pagado y lo restante. El siguiente hito pasa a ser el actual.

**6.2 Pago fuera de orden** · Rol: Beto
- [ ] Pasos: intentar entregar el hito 2 antes del 1.
- Esperado: no se puede; solo el hito actual.

**6.3 Liberación automática de un hito** · Rol: Ana y Beto
- [ ] Esperado: sin respuesta de Ana, a las 72 h el hito se libera solo. Verificar con el e2e.

**6.4 Reclamo de un hito** · Rol: Ana
- [ ] Pasos: "Tengo un problema" en un hito entregado.
- Esperado: se congela solo ese hito; los demás siguen. Pasa al flujo de jurado (ver sección 8).

**6.5 Terminar sin causa** · Rol: Ana
- [ ] Pasos: terminar la changa a mitad, sin causa, con un hito pagado y uno en curso.
- Esperado: se pagan los hitos verificados, el hito en curso proporcional, vuelven los hitos sin empezar y hay una compensación adicional para Beto. El monto se muestra antes de confirmar. Beto puede subir evidencia de avance para el proporcional.
- Observaciones: el contrato no distingue el motivo ("sin causa" o "con causa"); anotar qué se ve en la app.

**6.6 Abandono por parte del prestador** · Rol: Beto y Ana
- [ ] Pasos: Beto renuncia explícitamente o queda inactivo pasada la fecha límite.
- Esperado: se pagan los hitos verificados, se pierde el hito en curso y reputación, y Ana puede volver a publicar con el dinero restante.

---

## 7. Cancelaciones escalonadas (escenario D)

Cada fila es una prueba distinta; usar changas nuevas y anotar el costo real.

- [ ] **7.1 Cancelar abierta sin prestador reservado:** gratis. (Es la 2.6.)
- [ ] **7.2 Cancelar con prestador reservado, dentro de la gracia:** sin costo.
- [ ] **7.3 Cancelar con prestador reservado, pasada la gracia:** compensación creciente que va al prestador reservado, con tope.
- [ ] **7.4 Cancelar tras acordar:** cuesta 10% del monto bloqueado, con la mayor parte para el prestador y el resto al tesoro.
- [ ] **7.5 Cancelar tras acordar con 24 horas de anticipación:** gratis, con límites (2 por mes por cuenta y 1 por mes por pareja). La tercera cuesta el 10%.
- [ ] **7.6 No presentación:** Beto no hace check-in en una changa con fecha fija. Esperado: compensación del 10% para Ana.

Esperado en todos: quién paga, quién cobra y cuánto coincide con los parámetros del contrato. Anotar montos.

---

## 8. Reclamo y jurado (escenario C)

### 8.1 Ser jurado
**8.1.1 Depositar garantía y anotarse** · Rol: J1 a J5
- [ ] Pasos: Perfil → Ser jurado → depositar la garantía (10 USDC) → "Anotarme".
- Esperado: la garantía aparece como depositada. Se puede retirar la parte libre. Las cuentas con menos de la garantía necesaria quedan sin poder anotarse, con un aviso de qué falta.

### 8.2 Disputa chica (sin jurado)
**8.2.1 Reclamo por un monto hasta 20 USDC** · Rol: Ana
- [ ] Esperado: se reparte 50/50 sin jurado.

### 8.3 Disputa con jurado (monto medio, 3 jurados)
**8.3.1 Abrir reclamo** · Rol: Ana
- [ ] Pasos: Beto entregó; Ana toca "Tengo un problema" → motivo, descripción, evidencia, mensajes a compartir → confirmar el costo del reclamo.
- Esperado: el pago queda congelado. Beto recibe el aviso "Abrieron un reclamo".

**8.3.2 Responder** · Rol: Beto
- [ ] Pasos: abrir el reclamo → agregar su versión y evidencia.
- Esperado: se ven las dos versiones.

**8.3.3 Sorteo de jurado** · Rol: sistema, J1 a J3
- [ ] Esperado: el sistema sortea 3 jurados entre los anotados que no son parte ni tuvieron changas con ninguna de las dos. Cada jurado recibe el aviso "Te tocó ser jurado".
- [ ] Variante: un jurado rechaza o no responde → se sortea un reemplazo.

**8.3.4 Revisar el caso** · Rol: J1 a J3
- [ ] Pasos: Perfil → Ser jurado → Mis casos → abrir el caso.
- Esperado: se ve el acuerdo, la evidencia y los mensajes compartidos. Las partes aparecen como Parte A y Parte B, sin identidades.

**8.3.5 Votar (commit)** · Rol: J1 a J3
- [ ] Pasos: cada uno elige un veredicto y confirma el voto.
- Esperado: queda guardado en secreto; no se ve el de los demás.

**8.3.6 Revelar voto** · Rol: J1 a J3
- [ ] Pasos: dentro de la ventana, "Revelar".
- Esperado: se computa la mayoría de los votos revelados.

**8.3.7 Veredicto y reparto** · Rol: Ana, Beto, J1 a J3
- [ ] Esperado: el pago se reparte según el veredicto. Quien gana recupera la garantía del reclamo; quien pierde la cede. Los jurados con la mayoría cobran recompensa y el que quedó en minoría pierde una parte chica. Las identidades se revelan al cerrar.
- Observaciones: _

**8.3.8 Jurado que no revela** · Rol: J3
- [ ] Pasos: J3 vota pero no revela a tiempo.
- Esperado: pierde toda la garantía de ese caso.

**8.3.9 Apelación** · Rol: la parte perdedora
- [ ] Pasos: dentro del plazo, "Apelar" → paga el costo adicional.
- Esperado: se sortea un jurado ampliado (2N+1). Solo se puede apelar una vez. Si gana la apelación, se devuelve el costo.

**8.3.10 Sin jurados suficientes** · Rol: Admin
- [ ] Pasos: con menos de 3 jurados disponibles tras las rondas de sorteo.
- Esperado: resuelve el administrador como árbitro de emergencia, con motivo. Aparece en el panel (sección Reclamos).

### 8.4 Changa alta (más de 300 USDC, 5 jurados)
- [ ] Repetir 8.3 con 5 jurados.

### 8.5 Acuerdo amistoso
- No disponible: el contrato no lo tiene.

---

## 9. Changa grupal (escenario E)

**9.1 Publicar grupal** · Rol: Gabi
- [ ] Pasos: Publicar → Grupal → meta total, aporte propio (entre 5% y 50% de la meta) y coordinador opcional.
- Esperado: queda en "Juntando aportes". No es pública ni recibe postulaciones hasta llegar a la meta. Un aporte fuera de rango da un error con el rango.

**9.2 Aportar** · Rol: Hugo e Ines
- [ ] Pasos: abrir el enlace o la changa → "Aportar" → monto (mínimo 5%, tope 50%) → firmar el permiso.
- Esperado: el aporte queda registrado en el contrato. La barra de progreso avanza. Los demás ven un aviso "Sumaron un aporte".

**9.3 Retirar un aporte antes del acuerdo** · Rol: Hugo
- [ ] Pasos: retirar su aporte.
- Esperado: recupera su plata. Si la meta deja de cumplirse, la changa vuelve a "Juntando aportes". Después del acuerdo el botón queda bloqueado.

**9.4 Meta cumplida y devolución proporcional** · Rol: todos
- [ ] Esperado: al llegar a la meta se abre a postulaciones.
- [ ] Variante: la meta no se alcanza antes del plazo → el dinero se devuelve automáticamente en proporción a lo aportado.

**9.5 Proponer prestador** · Rol: Gabi (coordinador) y Beto
- [ ] Pasos: Beto se postula → Gabi lo propone. Beto no puede estar entre los aportantes.
- Esperado: los aportantes reciben el aviso "Propusieron a alguien… podés vetar".

**9.6 Veto de prestador** · Rol: Hugo
- [ ] Pasos: vetar durante la ventana.
- Esperado: se descarta la propuesta y se vuelve a las postulaciones. Sin veto, pasa al acuerdo.

**9.7 Acuerdo grupal** · Rol: Beto y Gabi
- [ ] Pasos: firman el acuerdo con la lista de aportantes.
- Esperado: queda acordada. Los fondos quedan bloqueados.

**9.8 Revisión y cobro conjunto** · Rol: Beto y aportantes
- [ ] Pasos: Beto entrega → los aportantes revisan → "Está todo bien" → el coordinador firma el QR.
- Esperado: el pago llega a Beto; los sobrantes vuelven a los aportantes en proporción a su aporte. Sin objeciones al vencer el plazo, se libera solo.

**9.9 Objeción** · Rol: Hugo e Ines
- [ ] Pasos: Hugo objeta con motivo. Si no llega al 25% del dinero ni a dos personas, queda pendiente; Ines se suma.
- Esperado: al llegar al 25% del dinero o a dos personas se congela el pago y se abre el reclamo con jurado (ver 8.3). Si el jurado la considera infundada, quien objetó paga el costo.

**9.10 Cambiar el coordinador** · Rol: aportantes
- 🛠 **POR DESARROLLAR:** el contrato lo tiene (propuesta y aprobación por mayoría de dinero, con ventana de veto) pero la pantalla está a medias. Cuando se termine, probar: un aportante propone un coordinador nuevo → los demás aprueban con más del 50% del dinero → pasa a ser quien firma el QR; con veto dentro de la ventana no cambia; con un reclamo abierto no se puede proponer.

---

## 10. Perfil, actividad y ajustes

**10.1 Perfil propio** · Rol: Ana y Beto
- [ ] Esperado: saldo de USDC, estado de verificación y "Tu actividad" (cobrado, pagado, por cobrar, en garantía), consistente con lo vivido en las pruebas.

**10.2 Perfil público y reporte** · Rol: Ana
- [ ] Pasos: abrir el perfil de Beto desde una postulación → "Reportar usuario".
- Esperado: el reporte llega al panel (sección Reportes).

**10.3 Reportar una changa** · Rol: Beto
- [ ] Pasos: reportar una changa o un adjunto.
- Esperado: aparece en el panel y se puede bajar la oferta.

**10.4 Ajustes** · Rol: cualquiera
- [ ] Pasos: Perfil → Ajustes.
- Esperado: muestra la billetera, versión, red (Sepolia, modo demostración) y servidor. El interruptor de notificaciones se oculta o aparece según el estado del proyecto de Expo. "Editar mis datos" y "Sacar selfie" abren sus pantallas.

**10.5 Editar mis datos** · Rol: Ana
- [ ] Pasos: cambiar nombre y zona.
- Esperado: se guarda y se refleja en el perfil.

---

## 11. Panel de administración (escenario H)

Servidor local o de dev, panel contra ese servidor, entrando con la cuenta Admin.

**11.1 Ingreso** · Rol: Admin
- [ ] Pasos: conectar MetaMask → firmar.
- Esperado: entra. Con otra cuenta, no entra.

**11.2 Resumen** · Rol: Admin
- [ ] Esperado: changas por estado, volumen en garantía, reclamos abiertos y salud del indexador y del relayer, coherentes con lo hecho en las pruebas.

**11.3 Changas** · Rol: Admin
- [ ] Pasos: ver el detalle de una changa → bajarla con motivo → restaurarla.
- Esperado: queda oculta y luego visible; el archivo y su hash no se borran. Queda en el registro.

**11.4 Reportes** · Rol: Admin
- [ ] Pasos: ver la cola de reportes de las pruebas 10.2 y 10.3.
- Esperado: se ve el reporte con vista previa y se puede resolver.

**11.5 Usuarios** · Rol: Admin
- [ ] Esperado: se ve la lista con reputación y verificación.
- 🛠 **POR DESARROLLAR: suspender y reactivar usuarios.** Cuando exista, probar: suspender a Beto → no puede postularse ni publicar y su perfil público muestra el aviso; reactivarlo lo devuelve a la normalidad; la acción queda en el registro con motivo.

**11.6 Selfies** · Rol: Admin
- [ ] Es la 1.3.

**11.7 Reclamos de emergencia** · Rol: Admin
- [ ] Pasos: con un reclamo sin jurados suficientes (8.3.10), resolver firmando como árbitro.
- Esperado: el contrato aplica el reparto. Queda en el registro con motivo.

**11.8 Registro de acciones** · Rol: Admin
- [ ] Esperado: cada acción de moderación aparece con billetera, fecha y motivo.

**11.9 Fondo, parámetros y métricas**
- 🛠 **POR DESARROLLAR: fondo y parámetros.** Cuando exista, probar: ver el saldo del fondo de la plataforma, los parámetros vigentes y las propuestas en espera.
- 🛠 **POR DESARROLLAR: métricas con exportación.** Cuando exista, probar: los indicadores del documento de métricas con rango de fechas, y que la exportación coincida con lo hecho en las pruebas.

---

## 12. 🛠 POR DESARROLLAR: votar un parámetro (escenario F)

Hoy la app y el panel no tienen pantalla para proponer ni votar. El contrato (Governor y Timelock) ya está en Sepolia y el control de parámetros ya pasó al Timelock. Las ventanas en DEMO son de minutos, así que el flujo completo se puede probar en una sesión.

Cuando se desarrolle, pruebas a agregar y marcar:
- [ ] 12.1 Ver las votaciones abiertas y mi peso de voto (cero para cuentas sin actividad, con explicación).
- [ ] 12.2 Proponer el cambio de un parámetro (por ejemplo, la liberación automática de 24 h a 1 h).
- [ ] 12.3 Votar a favor, en contra o abstenerse con varias cuentas; el resultado parcial se actualiza.
- [ ] 12.4 Cierre de la votación y espera del Timelock (5 minutos en DEMO).
- [ ] 12.5 Ejecución: el nuevo valor queda vigente y se refleja en las pantallas que lo usan.
- [ ] 12.6 Propuesta rechazada o sin quórum: no cambia nada.
- [ ] 12.7 Usarlo para bajar la liberación automática y la gracia de la reserva y así probar 3.3, 5.9 y 6.3 en vivo.

Mientras tanto, el escenario se puede mostrar con un script de Foundry y explicarlo.

## 13. 🛠 POR DESARROLLAR: pago en efectivo (escenario B)

El contrato tiene la modalidad (tarifa de publicación de 1 USDC más 2% y menor reputación), pero la app no ofrece la opción al publicar. Cuando se desarrolle, pruebas a agregar:
- [ ] 13.1 Publicar eligiendo pago en efectivo: se cobra la tarifa de publicación y no se deposita el monto.
- [ ] 13.2 Acordar y cerrar sin QR de liberación de plata; cada parte confirma la entrega.
- [ ] 13.3 Reputación: la changa en efectivo suma menos que una con pago en garantía.
- [ ] 13.4 Reclamo en una changa en efectivo: qué se resuelve y qué no (la plata no está en el contrato).

## 14. 🛠 POR DESARROLLAR: testigo en changas de más de 300 USDC

El contrato y el servidor lo tienen (asignar y atestar), pero no hay pantalla. Cuando se desarrolle, pruebas a agregar:
- [ ] 14.1 Una changa de más de 300 USDC exige asignar un testigo al acordar.
- [ ] 14.2 El testigo recibe el aviso y ve la evidencia.
- [ ] 14.3 El testigo atesta que el trabajo se hizo y se libera el pago; sin su atestación no se libera.
- [ ] 14.4 El testigo no puede ser una de las partes.
- [ ] 14.5 Testigo que no responde: qué pasa con el plazo y el reclamo.

## 14b. Resumen de lo que está por desarrollar

| Qué | Dónde se prueba hoy | Sección |
| --- | --- | --- |
| Votar parámetros (F) | Solo por script | 12 |
| Pago en efectivo (B) | No se puede | 13 |
| Testigo | No se puede | 14 |
| Cambio de coordinador | Solo contrato | 9.10 |
| Suspender usuarios en el panel | No se puede | 11.5 |
| Fondo y parámetros en el panel | No se puede | 11.9 |
| Métricas con exportación en el panel | No se puede | 11.9 |
| Notificaciones push reales | No se puede | 4.4 |

---

## 15. Casos transversales

**15.1 Sin conexión** · [ ] Cortar la red a mitad de una acción. Esperado: mensaje claro, "No se movió plata", y al volver se puede reintentar.

**15.2 Rechazar una firma** · [ ] Cancelar la firma en MetaMask en el depósito, el acuerdo y el QR. Esperado: no se ejecuta nada y se puede reintentar.

**15.3 Saldo insuficiente** · [ ] Postularse o aportar sin saldo. Esperado: indica cuánto falta.

**15.4 Doble toque / reintento** · [ ] Tocar dos veces "Confirmar" o reenviar la misma firma. Esperado: no se duplica el movimiento de plata.

**15.5 Relayer sin gas** · [ ] Vaciar el saldo de ETH del relayer. Esperado: la app muestra un error de servicio sin mover plata; el panel marca el problema en la salud. Volver a cargar y comprobar que se recupera.

**15.6 Indexador atrasado** · [ ] Apagar el cron un rato y volver a prenderlo. Esperado: las pantallas se ponen al día sin perder eventos.

**15.7 Permisos entre roles** · [ ] Con la cuenta de Beto, intentar abrir pantallas o acciones de Ana (aprobar un trabajo ajeno, generar el QR de otra changa) y viceversa. Esperado: no se puede.

**15.8 Sesión vencida** · [ ] Usar un token vencido. Esperado: pide volver a ingresar sin perder datos.

**15.9 Dos dispositivos con la misma cuenta** · [ ] Entrar con la misma billetera en dos celulares. Esperado: ambos ven el mismo estado y el chat se descifra en los dos.

---

## 16. Resumen de estado

Completar al terminar cada sesión de pruebas.

| Bloque | Pruebas | OK | Fallan | Pendientes |
| --- | --- | --- | --- | --- |
| 1. Registro y perfil | 5 | | | |
| 2. Publicar y explorar | 6 | | | |
| 3. Postulación y acuerdo | 7 | | | |
| 4. Chat y notificaciones | 3 | | | |
| 5. Hacer la changa y cobrar | 10 | | | |
| 6. Hitos | 6 | | | |
| 7. Cancelaciones | 6 | | | |
| 8. Reclamo y jurado | 11 | | | |
| 9. Grupal | 10 | | | |
| 10. Perfil y ajustes | 5 | | | |
| 11. Panel | 8 | | | |
| 15. Transversales | 9 | | | |
| 12 a 14 y 9.10, 11.5, 11.9, 4.4 (por desarrollar) | 🛠 | | | |

**Fallas encontradas** (anotar acá y arreglar después):

| # | Prueba | Qué pasó | Entorno y hora | Arreglada |
| --- | --- | --- | --- | --- |
| | | | | |
