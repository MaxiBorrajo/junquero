# Junquero: cambios de contrato (hechos el 15/11/2026; ya desplegados)

Decisiones del 15/11/2026, ya programadas y probadas (780 pruebas del contrato). Ya están desplegados en Sepolia (redespliegues del 14/11, 24/11 y 26/11/2026; las direcciones vigentes están en `contracts/deployments/sepolia.json`). Se conserva el texto como registro de lo decidido.

## 1. Monto mínimo de una changa

- Mínimo de 5 USDC, por moneda (un campo nuevo en la configuración de cada moneda del contrato, para que no se pueda saltear desde fuera de la app). Aplica también a la meta de las changas grupales.
- La app y el servidor también lo validan antes de publicar.

## 2. Cancelar cuando ya hubo postulaciones

Regla: cancelar es gratis solo si nadie se postuló. Si hubo al menos una postulación, aunque después se haya bajado, cancelar cuesta el 2% del monto bloqueado, con un mínimo de 0,50 USDC y el tope de 10 USDC que ya existe. Ese cobro va al tesoro de la plataforma.

- **Quién marca la orden:** el servidor (relayer) llama a una función nueva solo para su rol cuando llega la primera postulación. La marca queda en la orden y emite un evento, así se puede auditar. El riesgo es que un servidor comprometido marque órdenes ajenas; está acotado por el tope y se puede revisar.
- **Cuenta el hecho de haber recibido una postulación**, no que siga activa.
- **Reserva:** deja de hacer falta la rampa de 12 h con compensación creciente. Toda cancelación con postulaciones cuesta lo mismo.

## 3. Cancelar después de acordar (revisión de casos)

Hoy: el solicitante que cancela después de acordar paga 10% (80% al prestador y 20% al tesoro), salvo que avise con 24 h o más de anticipación, caso en que es gratis con un máximo de 2 por mes por cuenta y 1 por mes por pareja. En efectivo no se cobra.

Con la regla nueva (hubo postulaciones, y hay un prestador acordado, así que siempre las hubo):

| Situación | Hoy | Propuesto |
| --- | --- | --- |
| Nadie se postuló | Gratis | Igual (gratis) |
| Hubo postulaciones, sin acuerdo | Gratis (o compensación creciente si hay reserva) | 2% (mínimo 0,50 USDC) al tesoro |
| Acordada, con 24 h o más antes del comienzo | Gratis, con cupos mensuales | 2% (mínimo 0,50 USDC) al tesoro; se eliminan los cupos de cancelación gratis |
| Acordada, con menos de 24 h o ya comenzada | 10% (80% prestador, 20% tesoro) | Igual |
| Acordada, sin fecha de inicio (por ejemplo a distancia) | 10% siempre | Abierto: ver abajo |
| Pago en efectivo | Gratis | Igual (no hay dinero bloqueado) |
| Changa grupal | Reintegro proporcional | Abierto: ver abajo |
| El prestador cancela | Sin costo, baja su reputación | Igual (ver abajo) |

**Decisiones sobre los casos especiales:**
1. **Trabajos sin fecha de inicio** (por ejemplo a distancia): 2% (mínimo 0,50 USDC) durante las primeras 24 h desde el acuerdo y 10% después. *Decidido.*
2. **Cancela el prestador:** queda como hoy, solo baja su reputación. Se puede evaluar una garantía del prestador más adelante. *Decidido.*
3. **Changas grupales:** el cobro no sale de la plata de los aportantes, sino de la parte del coordinador (quien cancela): se descuenta de lo que le correspondería recuperar, hasta el tope de su propio aporte. Los demás aportantes recuperan todo. *Decidido.*
4. **Cupos de cancelación gratis:** se eliminan, y el cobro por postulaciones pasa a ser un parámetro que se puede votar (por defecto 2%, con un mínimo por moneda). Si en el arranque se quiere que sea más suave, se baja el parámetro (incluso a 0%) y se sube después por votación, sin tocar el contrato. *Decidido.*

## 4. Módulos reemplazables en modo demo

- Con `DEMO=true`, el despliegue no bloquea los módulos del Escrow.
- Función de administrador para cambiar la lógica de un módulo sin cambiar los datos, las órdenes abiertas ni las direcciones.
- En producción se bloquea, y la garantía de que nadie puede cambiar las reglas queda intacta.
- Al cambiar un módulo no se pueden reordenar ni quitar campos guardados, solo agregar al final.

## 5. Después del cambio

- Redesplegar en Sepolia reutilizando la misma moneda de prueba.
- Actualizar direcciones, ABI y constantes (app, panel y servidor), limpiar la base del servidor, volver a sembrar las cuentas de demo, actualizar el webhook de Alchemy y repetir el stake de los jurados.
- Actualizar las pruebas 2.6, 3.3 y la sección 7 del plan de pruebas.

## 6. Para evaluar más adelante

- Calificación del prestador hacia quien publicó, dentro de la reputación del contrato. Detalle y motivos en "Junquero - plan a futuro", sección 4. No es parte de este cambio.
- Reclamos de changa chica (50/50 sin jurado), decisiones del 18/11/2026. Ya hecho: el tope bajó a 1 por cuenta por mes (`SMALL_DISPUTES_PER_ACCOUNT_MONTH`, también en Sepolia con `contracts/script/SetParameter.s.sol`) y la app avisa cuando se llega al tope. Pendiente de contrato:
  - Pasado el tope hoy no se puede reclamar y no hay jurado (`DisputeCapReached`). Evaluar que los reclamos siguientes del mes pasen a jurado pagando el costo (3 USDC) o a un árbitro de emergencia; toca `_openSmall` de `DisputeModule`.
  - El 50/50 deja un incentivo a rechazar para pagar la mitad (ya señalado en "Junquero - confianza y economia"); el tope en 1 lo acota pero no lo elimina. Alternativas vistas: garantía chica para quien reclama, reparto asimétrico si hubo check-in y evidencia, jurado de uno solo.
  - `Receipt.claim` solo mira que el trabajo esté liquidado y pagado, así que permite reclamar el comprobante de un trabajo que terminó en reclamo chico. Hoy solo lo oculta la app. Cerrarlo en el contrato consultando la disputa del Escrow.
