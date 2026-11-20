# Junquero: pruebas de implementación futura

Pasaron desde `Junquero - plan de pruebas.md` el 20/11/2026. Reúnen todo lo que todavía **no está desarrollado o está fuera del alcance** de la entrega del 24/11/2026. No se prueban ahora, no cuentan en el resumen del plan de pruebas y sus casilleros quedan sin marcar. Cuando alguna de estas funciones se desarrolle, se vuelve a pasar la prueba al plan principal con el mismo número.

Los números de las secciones se conservaron para que las referencias de otros documentos sigan valiendo.

## Resumen

| Qué | Escenario | Dónde está acá |
| --- | --- | --- |
| Changa grupal y cambio de coordinador | E | Sección 9 |
| Votar parámetros | F | Sección 12 |
| Pago en efectivo | B | Sección 13 |
| Testigo en changas de más de 300 USDC | | Sección 14 |
| Notificaciones push reales | | Sección 4.4 |
| Panel: suspender usuarios, fondo y parámetros, métricas con exportación | H | Sección 11 |
| Cambios de contrato y de diseño ya anotados | | Sección 8 |

---

## 4.4 Notificaciones push reales · Rol: cualquiera

- 🛠 **POR DESARROLLAR:** requiere que Maxi cree el proyecto de Expo. Mientras tanto Ajustes muestra "No disponibles en esta versión". Cuando exista: probar que llegue un aviso con la app cerrada por cada evento de la tabla de notificaciones, que al tocarlo abra la changa correcta y que el interruptor de Ajustes lo apague y lo encienda.

---

## 7. Cancelaciones que dependen de funciones futuras

- 🛠 **7.9 Pago en efectivo (futuro, fuera del alcance):** cancelar tras acordar es gratis (no hay dinero bloqueado). La app todavía no ofrece el pago en efectivo (ver sección 13).
- 🛠 **7.10 Changa grupal (futuro, fuera del alcance):** con postulaciones y antes de acordar, cancelar cuesta el 2% (mínimo 0,50) y lo paga el coordinador de su parte, hasta el tope de lo que aportó: los demás aportantes recuperan todo. Si el coordinador no aportó, se reparte en proporción.
- 🛠 **7.11 Cobro apagado (futuro, fuera del alcance):** votar el parámetro del cobro por postulaciones en 0% y comprobar que cancelar con postulaciones vuelve a ser gratis. Depende de la votación de parámetros.

Esperado en todos: quién paga, quién cobra y cuánto coincide con los parámetros del contrato.

---

## 9. 🛠 Implementación futura: changa grupal (escenario E)

**Fuera del alcance por ahora.** Se deja como referencia para cuando se retome; no se prueba ni cuenta en el resumen. Los casilleros quedan sin marcar.

**9.1 Publicar grupal** · Rol: Gabi
- [ ] Pasos: Publicar → Grupal → completar los pasos (cómo se paga con el plazo para juntar aportes, cuánto pagás con la meta total) → revisar → publicar. Después de que el grupo se confirme, abrir "Ver aportes".
- Esperado: al publicar no se pide ningún aporte. La pantalla final dice que, cuando el grupo esté confirmado, hay que entrar a "Ver aportes", hacer el aporte y compartirlo. Cuando se confirma llega la notificación "Trabajo grupal publicado" con la misma invitación. En la pantalla del grupo, mientras se juntan aportes y quien lo creó todavía no aportó, aparece un recuadro arena con el ícono de billetera: "Todavía no hiciste tu aporte. Sumá el tuyo para arrancar y compartí el enlace para que se sumen los demás." (desaparece cuando aporta, y no se muestra a los demás aportantes). Queda en "Juntando aportes". No es pública ni recibe postulaciones hasta llegar a la meta. Un aporte fuera de rango da un error con el rango.
- Observaciones: _

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

**9.11 Compartir y cancelar desde el detalle del grupo** · Rol: Gabi
- [ ] Pasos: abrir el detalle de la changa grupal (desde Mis trabajos) mientras se juntan aportes. Tocar "Compartir". Después cancelar.
- Esperado: el detalle muestra "Ver aportes" como botón principal y una tarjeta con "Compartir" (abre el menú del teléfono con el título y el enlace del grupo, sin tener que entrar a los aportes) y, para quien creó el grupo, "Cancelar trabajo". Cancelar abre una pantalla aparte (título, resumen del trabajo y de la plata, y "Qué pasa si cancelás") con "Sí, cancelar el trabajo" y "No, volver". Esa pantalla aclara que los aportes vuelven a cada aportante y que, si alguien se postuló, el cobro sale de la parte del coordinador. Al cancelar, todos los aportantes recuperan su plata (menos el cobro del coordinador si hubo postulaciones) y el grupo figura "Cancelando" y luego cancelado.
- Observaciones: _

**9.10 Cambiar el coordinador** · Rol: aportantes
- 🛠 **POR DESARROLLAR:** el contrato lo tiene (propuesta y aprobación por mayoría de dinero, con ventana de veto) pero la pantalla está a medias. Cuando se termine, probar: un aportante propone un coordinador nuevo → los demás aprueban con más del 50% del dinero → pasa a ser quien firma el QR; con veto dentro de la ventana no cambia; con un reclamo abierto no se puede proponer.

---

## 11. Panel de administración: lo que falta

**11.5 Usuarios** · Rol: Admin
- 🛠 **POR DESARROLLAR: suspender y reactivar usuarios.** Cuando exista, probar: suspender a Beto → no puede postularse ni publicar y su perfil público muestra el aviso; reactivarlo lo devuelve a la normalidad; la acción queda en el registro con motivo.

**11.9 Fondo, parámetros y métricas**
- 🛠 **POR DESARROLLAR: fondo y parámetros.** Cuando exista, probar: ver el saldo del fondo de la plataforma, los parámetros vigentes y las propuestas en espera.
- 🛠 **POR DESARROLLAR: métricas con exportación.** Cuando exista, probar: los indicadores del documento de métricas con rango de fechas, y que la exportación coincida con lo hecho en las pruebas.

---

## 12. 🛠 Implementación futura: votar un parámetro (escenario F)

**Fuera del alcance por ahora.** No se prueba ni cuenta en el resumen.

Hoy la app y el panel no tienen pantalla para proponer ni votar. El contrato (Governor y Timelock) ya está en Sepolia y el control de parámetros ya pasó al Timelock. Las ventanas en DEMO son de minutos, así que el flujo completo se puede probar en una sesión.

Cuando se desarrolle, pruebas a agregar y marcar:
- [ ] 12.1 Ver las votaciones abiertas y mi peso de voto (cero para cuentas sin actividad, con explicación).
- [ ] 12.2 Proponer el cambio de un parámetro (por ejemplo, la liberación automática de 24 h a 1 h).
- [ ] 12.3 Votar a favor, en contra o abstenerse con varias cuentas; el resultado parcial se actualiza.
- [ ] 12.4 Cierre de la votación y espera del Timelock (5 minutos en DEMO).
- [ ] 12.5 Ejecución: el nuevo valor queda vigente y se refleja en las pantallas que lo usan.
- [ ] 12.6 Propuesta rechazada o sin quórum: no cambia nada.
- [ ] 12.7 Usarlo para bajar la liberación automática y así probar 5.9 y 6.3 en vivo, y para apagar el cobro por cancelar con postulaciones (7.11). Mientras tanto 5.9 y 6.3 se verifican con el e2e.

Mientras tanto, si hiciera falta mostrarlo, se puede hacer con un script de Foundry.

## 13. 🛠 Implementación futura: pago en efectivo (escenario B)

**Fuera del alcance por ahora.** No se prueba ni cuenta en el resumen.

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

## 14b. Resumen de lo que está por desarrollar o fuera del alcance

| Qué | Dónde se prueba hoy | Sección |
| --- | --- | --- |
| Votar parámetros (F) | Fuera del alcance por ahora | 12 |
| Pago en efectivo (B) | Fuera del alcance por ahora | 13 |
| Testigo | No se puede | 14 |
| Changa grupal (E) y cambio de coordinador | Fuera del alcance por ahora | 9, 9.10 |
| Suspender usuarios en el panel | No se puede | 11.5 |
| Fondo y parámetros en el panel | No se puede | 11.9 |
| Métricas con exportación en el panel | No se puede | 11.9 |
| Notificaciones push reales | No se puede | 4.4 |

---

## 8. Cambios de contrato y de diseño ya anotados (reclamos)

Salieron de las pruebas 8.2.2 y siguientes. El detalle está en `Junquero - plan a futuro.md` (secciones 6, 7 y 8) y en `Junquero - cambios de contrato pendientes.md`.

- 🛠 **Cambio futuro (comprobante):** cerrar en el contrato `Receipt` que un trabajo con reclamo chico no pueda reclamarlo (hoy solo lo oculta la app) y evaluar un comprobante de "gané la disputa" solo para las de jurado.
- 🛠 **Cambio futuro:** hoy, pasado el tope, no se puede reclamar y no hay jurado. Evaluar que los reclamos siguientes del mes pasen a jurado pagando el costo (3 USDC), o un árbitro de emergencia. Además, el 50/50 deja un incentivo a rechazar para pagar la mitad (ya señalado en confianza y economía); el tope en 1 lo acota pero no lo elimina.
