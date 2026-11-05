# Junquero: especificación de contratos y plan de pruebas

Escrito el 4 de noviembre de 2026. Objetivo: terminar todos los contratos, probarlos con los casos que va a generar la app y la producción, publicarlos en Sepolia y recién entonces construir backend, app y panel contra contratos que ya funcionan.

Este documento fija qué se construye, en qué orden y cómo se sabe que está listo. Las decisiones sin cerrar están en la sección 9, cada una con una recomendación.

## 0. Avance (5 de noviembre de 2026, tarde)

Terminados y con pruebas (754 en verde): pasos 1 a 9 y la apelación, salvo la bifurcación de Sepolia del orden de construcción.

| Paso | Estado | Notas |
| --- | --- | --- |
| 1. Base del Escrow | Hecho | Pagos reclamables, categoría, moderación, cambios a distancia |
| 2. Credentials, Reputation, Receipt | Hecho | El Escrow avisa a Reputation sin poder trabar un pago |
| 3. Disputa en el Escrow | Hecho | 50/50 automático en changas chicas; jurado para medias y altas |
| 4. Arbitration | Hecho sin apelación | Stake, sorteo por compromiso y revelación, recusaciones, votos cifrados, castigos, árbitro de emergencia, respuesta en 72 horas |
| 5. Hitos | Hecho | Plan de hitos firmado, pago por QR por hito, liberación automática a las 72 h, anticipo como primer hito, término anticipado, abandono con reapertura, disputa por hito |
| 6. Changa grupal | Hecho | Fondeo con plazo, aportes de 5% a 50%, retiro hasta el acuerdo, devolución automática proporcional, propuesta de prestador con veto, cambio de coordinador por mayoría de dinero y objeción |
| 7. Testigo | Hecho | Asignación firmada por las dos partes, atestado firmado por el testigo, compuerta de cobro en changas de más de 300 USDC y tarifa pagada desde el tesoro |
| 8. Votación y gobernanza | Hecho | `VotingWeight`, `ProtocolGovernor`, Timelock y traspaso del control de parámetros, monedas, roles y tesoro al Timelock |
| 9. Pruebas finales | Hecho, falta el fork | Invariantes con secuencias aleatorias (200 corridas de 120 acciones), escenarios A a F sobre el despliegue real, vectores de firma para la app (`contracts/vectors/`), cobertura de 98,8% de líneas y 91,9% de ramas, análisis estático con Slither (`contracts/SECURITY.md`) |
| 10 | Pendiente | Pruebas con bifurcación de Sepolia, despliegue y publicación |
| Apelación | Hecho | Una sola, por quien perdió, con 2N+1 jurados nuevos; el veredicto espera una ventana antes de mover el dinero |

**Cambios de diseño respecto de lo especificado**

- **Escrow modular:** el Escrow superó el límite de 24 KB por contrato. Ahora es un router de 3,9 KB que delega en módulos (`OrderModule`, `CancelModule`, `AdminModule`, `DisputeModule`) con la misma dirección y la misma caja de datos. Quedan módulos libres para hitos, grupal y testigo.
- **Hitos con anticipo simplificado:** el anticipo es el primer hito, pagado al reclamarlo (con tope de 30% y reputación mínima del prestador). No hay recuperación on-chain de lo no gastado; queda como riesgo del solicitante, pensado para anticipos chicos.
- **Término anticipado y abandono:** el solicitante paga lo ya verificado, el avance reportado del hito en curso y una compensación sobre lo que queda; no puede terminar mientras hay un hito esperando revisión (debe aprobarlo o disputarlo). Si el prestador abandona, la changa vuelve a abierta con los fondos restantes.
- **Grupal: quién firma y quién cobra.** El coordinador (por defecto quien publica) es el `payer` del Escrow: firma el acuerdo y el QR. Todo reembolso al solicitante se reparte entre los aportantes en proporción a lo que pusieron, y el resto del redondeo va al último.
- **Grupal: veto y objeción.** El veto del prestador propuesto y la objeción usan el mismo umbral: 25% del dinero o 2 personas distintas. Al alcanzarse la objeción se abre la disputa y el costo del jurado lo adelanta quien la dispara (la última persona en objetar). Las reservas de prestador no existen en changas grupales; las reemplaza la propuesta con ventana de veto de 24 horas.
- **Testigo: elección y pago.** Una parte lo propone y lo firman las dos partes (también sirve en changas chicas, de forma opcional). El testigo firma un atestado de la entrega (o de cada hito); sin un atestado aprobado no se puede cobrar con QR ni por liberación automática en changas de más de 300 USDC. La disputa con jurado no depende del testigo. La tarifa fija la paga el tesoro (el Escrow tiene permiso de retiro acotado a esto); si el tesoro no tiene fondos, queda como deuda que el testigo reclama después. Las changas que no exigen testigo no pagan tarifa.
- **Votación: peso y reglas.** El peso de voto es la cantidad de changas cerradas sin disputa (como prestador, solicitante o jurado) con tope de 20 por cuenta, y solo cuenta con credencial y un depósito de 5 USDC. No se puede delegar a otra cuenta ni transferir. Cada cuenta se sincroniza (`sync`, la puede llamar cualquiera) para que el peso quede registrado antes de la votación; lo ganado después de la propuesta no cuenta. El reloj es por tiempo. Tiempos de producción: 1 día de espera, 5 días de votación, quórum del 10% y 2 días de Timelock; con `DEMO` son minutos.
- **Traspaso a la gobernanza.** `handOverToGovernance` pasa al Timelock los roles que controlan parámetros, monedas (`configureToken`), conexiones entre contratos y tesoro, y el administrador los renuncia. El administrador conserva solo los roles operativos: moderar, emitir credenciales de nivel 0, sembrar jurados y resolver emergencias. Es un paso aparte del despliegue (variable `GOVERNANCE`), para operar con un solo administrador al principio.
- **Apelación.** El costo del jurado pasa al contrato de arbitraje apenas se abre la disputa. Con un veredicto claro de la primera ronda se paga a esos jurados y se abre una ventana de apelación (24 horas). Si nadie apela, se ejecuta el reparto. Si apela quien perdió, paga el costo de una segunda ronda con 2N+1 jurados distintos; los de la primera ronda no pueden volver a votar. La segunda ronda es definitiva. Quien gana en definitiva recupera lo que adelantó desde la parte del perdedor, hasta donde alcance. Un empate o falta de jurados lleva a emergencia y se devuelve lo adelantado que no se haya pagado a jurados.
- **Costo del arbitraje:** lo adelanta quien reclama. Si gana y la parte que pierde no tiene dinero en el Escrow (por ejemplo, el prestador cuando pierde todo), el reclamante termina pagando el costo. Es una limitación conocida del diseño, sin garantía del prestador.
- **Quién se postula como jurado:** los jurados se anotan solos en cada caso (compromiso del sorteo), por lo que el backend tiene que avisarles cuando se abre un caso.

## 1. Estado de partida

Hecho y con tests (112 en verde): `Escrow` para changa individual y en efectivo, `ParameterRegistry`, `Treasury`, `Forwarder` y el script `Deploy.s.sol`.

Falta todo lo demás: changa grupal, hitos, anticipo, abandono, disputas, testigo, `Receipt`, `Credentials`, `Reputation`, `Arbitration`, `VotingWeight`, `ProtocolGovernor` y `TimelockController`.

## 2. Mapa de contratos y dependencias

| Contrato | Depende de | Lo llaman |
| --- | --- | --- |
| `ParameterRegistry` | nadie | todos (lectura); el Timelock (escritura) |
| `Treasury` | nadie | `Escrow` (recibe), SPENDER_ROLE (retira) |
| `Forwarder` | nadie | el relayer |
| `Credentials` | nadie | `Escrow`, `Arbitration`, `VotingWeight` (lectura de nivel) |
| `Reputation` | `Credentials` | `Escrow` y `Arbitration` (escritura); `Escrow` y `VotingWeight` (lectura) |
| `Receipt` | `Escrow` (lectura) | el prestador (reclamo) |
| `Arbitration` | `Escrow`, `Reputation`, `Credentials`, `ParameterRegistry` | `Escrow` (abre caso); jurados |
| `VotingWeight` | `Reputation`, `Credentials` | `ProtocolGovernor` |
| `ProtocolGovernor` y `TimelockController` | `VotingWeight` | usuarios votan; el Timelock escribe en `ParameterRegistry` |

Todos los contratos con acciones de usuario usan `ERC2771Context` con el `Forwarder`, para que el relayer pague el gas. Ningún contrato es actualizable: si algo cambia, se redespliega (en Sepolia, sin costo).

## 3. Cambios al Escrow

### 3.1 Base (antes de grupal e hitos)

- **Pagos con respaldo:** toda transferencia de salida (al prestador, al solicitante, al tesoro) intenta enviar y, si el token la rechaza (por ejemplo, una cuenta bloqueada por USDC), acredita el monto en un saldo reclamable y emite un evento. Quien cobra lo retira con `claim`. Así una cuenta bloqueada no puede trabar el cierre de una changa.
- **Categoría:** `CreateParams` suma `category` (uint8) para el comprobante y la moderación.
- **Moderación mínima:** `moderate(orderId)` con `MODERATOR_ROLE`, solo en changas sin acuerdo (abiertas o reservadas): cancela y devuelve todo al solicitante. El contenido lo oculta la app.
- **Cambios en changas a distancia:** `requestChanges(orderId, reasonHash)` por el solicitante, hasta 2 veces, dentro de la ventana de revisión; la changa vuelve a acordada, el plazo de revisión se reinicia al volver a entregar. Solo en `Modality.Remote`.
- **Ganchos:** al cerrar una changa, el escrow llama a `Reputation.record` y deja la changa lista para `Receipt.claim`. La llamada a `Reputation` no puede hacer fallar el pago (se aísla con try/catch y emite un evento si falla).
- **Parámetros nuevos:** las claves que ya existen en `ParameterKeys` y todavía no se leen (hitos, anticipo, objeción, aportes, ventana de respuesta, jurado), más `REQUEST_CHANGES_MAX`.

### 3.2 Disputa

- `openDispute(orderId, reasonHash)`: por el solicitante (rechaza la entrega) o por el prestador (afirma que cumplió o que el solicitante se negó a firmar). Solo en `Delivered` o, para la negativa a firmar, en `Agreed` con evidencia. Pasa a `Disputed` y congela los fondos.
- Changa chica (hasta `smallMax`): se resuelve en la misma transacción con reparto 50/50 y cada parte suma una disputa a su historial. Hay un tope de disputas chicas por mes por cuenta (parámetro).
- Changa media y alta: abre un caso en `Arbitration`.
- `resolveDispute(orderId, payeeShareBps)`: solo la puede llamar `Arbitration`. Reparte, cobra el costo del arbitraje a la parte que pierde (sale de su parte) y cierra la changa.
- `respondDispute`: la parte demandada tiene 72 horas para responder (`DISPUTE_RESPONSE_WINDOW`); si no responde, `Arbitration` resuelve a favor de quien reclama según la regla que se decida (ver sección 9, D6).

### 3.3 Hitos, anticipo y abandono

- Al acordar, una changa larga (más de `MILESTONE_MIN_DURATION` o más de `milestoneAmount`) exige la lista de hitos: montos que suman el precio, y un hash de criterios y evidencia pedida por hito. Esa lista queda en el `termsHash` firmado; en el contrato se guardan los montos y el estado de cada hito (pendiente, entregado, pagado).
- `deliverMilestone(orderId, index, evidenceHash)`, `release` por hito (el `Release` suma `milestoneIndex`) y `autoRelease` por hito a las `AUTO_RELEASE_MILESTONE` (72 horas).
- **Anticipo:** `releaseAdvance(orderId)` entrega al prestador hasta `ADVANCE_MAX_BPS` (30%) al empezar, solo si `Reputation` informa al menos `ADVANCE_MIN_CLOSED_ORDERS` changas cerradas sin disputa. El prestador lo justifica con comprobantes (hash por gasto, off-chain); lo no gastado se descuenta de lo que cobre después.
- **Término anticipado por el solicitante** (`terminateEarly`): paga los hitos verificados completos, una parte proporcional del hito en curso según la evidencia de avance que el prestador haya registrado, devuelve los hitos sin empezar y cobra la compensación de terminar sin causa (10% de lo que quedaba). Con causa, el solicitante objeta el hito y decide el jurado.
- **Abandono** (`declareAbandoned`): lo puede declarar el solicitante cuando pasa la fecha límite sin actividad, o el prestador renunciando (`abandon`). Paga los hitos verificados, el hito en curso se pierde, baja la reputación del prestador, y la changa vuelve a `Open` con los fondos restantes para que otro prestador la tome.

### 3.4 Changa grupal

- La changa grupal tiene un monto objetivo y arranca en `Funding`; no aparece como abierta hasta completarse.
- `contribute(orderId, amount, auth)`: cada aportante deposita con su propio permiso. Mínimo 5% (`CONTRIBUTION_MIN_BPS`) y máximo 50% (`CONTRIBUTION_MAX_BPS`) del objetivo por persona; eso acota a 20 aportantes como máximo. El prestador no puede aportar.
- `withdrawContribution(orderId)`: hasta el acuerdo, el aportante recupera su parte.
- `refundFunding(orderId)`: si vence el plazo de fondeo sin completar el objetivo, cualquiera puede ejecutarlo y cada aportante recupera lo suyo.
- Coordinador opcional: se fija al publicar. Quien firma el acuerdo y el QR es el coordinador, o el publicador si no hay. Los demás aportantes tienen una ventana para vetar la propuesta de prestador (`vetoProposal`), y cambiar el coordinador tras el acuerdo requiere mayoría de dinero (`proposeCoordinator` y `approveCoordinator`).
- `object(orderId)`: durante la revisión, un aportante o varios se oponen. Congela el pago si suman al menos `OBJECTION_MONEY_BPS` (25%) del dinero o son al menos `OBJECTION_MIN_PEOPLE` (2) personas distintas, y abre disputa. Si el jurado la considera infundada, los objetores pagan el costo del arbitraje.
- Reembolsos y sobrantes se reparten proporcionalmente al aporte, con el resto del redondeo asignado al último aportante para que el total cierre exacto.

### 3.5 Testigo

- Obligatorio por encima de `witnessAmount` (300 USDC). El acuerdo incluye la dirección del testigo (no puede ser parte ni tener vínculo registrado) y se firma por ambos.
- `attest(Attestation, signature)`: el testigo firma un atestado (EIP-712) del resultado y lo presenta cualquiera. Sin atestado, una changa alta no se libera, salvo por resolución de jurado.
- Tarifa fija del testigo (`WITNESS_FEE`), descontada de la comisión de la changa.

## 4. Contratos nuevos

### 4.1 Credentials
- ERC-721 intransferible (ERC-5192), una credencial por cuenta, con el nivel de cuenta guardado.
- `issue(account, level)` con `ISSUER_ROLE` (el administrador, por la verificación de selfie); `revoke(account)`.
- En el TP se emite solo nivel 0; el contrato soporta niveles 0, 1 y 2 para no rehacerlo después.
- Lectura: `levelOf(account)`.

### 4.2 Reputation
- Un registro por cuenta y por rol (prestador, solicitante, testigo, jurado): changas cerradas, changas cerradas sin disputa, disputas perdidas, suma de calificaciones.
- `record(...)` con `RECORDER_ROLE` (`Escrow` y `Arbitration`). Reglas: solo suma si la changa fue pagada por la plataforma y supera 5 USDC; como máximo 2 changas con la misma contraparte; la liberación por silencio cuenta como calificación neutra; las changas en efectivo tienen menor peso y solo con cierre confirmado por ambos.
- Lectura: `closedWithoutDispute(account)`, `score(account, role)`.

### 4.3 Receipt
- ERC-721 intransferible (ERC-5192) emitido al prestador, opcional.
- `claim(orderId)`: lo llama el prestador; el contrato lee el escrow, exige que la changa esté cerrada por la plataforma y que quien llama sea el prestador, y emite un token con categoría y mes, sin datos personales. Un solo comprobante por changa.

### 4.4 Arbitration
- **Alta de jurado:** `register(stake)`, con el nivel de cuenta y la reputación mínima que se definan, y un stake en la moneda de stake configurada; `withdrawStake` si no tiene casos activos. Hasta `JUROR_MAX_ACTIVE_CASES` (2) casos a la vez.
- **Jurados semilla:** `seedJuror(account)` con `SEEDER_ROLE` (el administrador) los registra con reputación inicial.
- **Caso:** lo abre el escrow con el tamaño según el monto (3 para media, 5 para alta). Se arma el pool elegible (registrados con garantía, que no sean parte ni tengan vínculo declarado con las partes).
- **Sorteo por compromiso y revelación:** los candidatos comprometen un secreto y lo revelan; el sorteo sale de la combinación de los secretos revelados y el contrato elige los jurados sin repetir. Cada parte puede recusar sin causa hasta `RECUSALS_PER_PARTY` jurados, que se reemplazan.
- **Invitación:** cada jurado tiene `JUROR_INVITE_WINDOW` (24 horas) para aceptar; si no, se reemplaza por nuevo sorteo hasta `JUROR_REPLACEMENT_ROUNDS` (3) rondas. Si no alcanza, el administrador resuelve como árbitro de emergencia con el motivo publicado (`resolveEmergency`), y solo puede elegir entre los repartos válidos; no mueve fondos.
- **Votación:** `commitVote(caseId, hash)` y `revealVote(caseId, vote, salt)`. Decide la mayoría de los votos revelados; con empate se llama a la apelación o al árbitro de emergencia según el caso.
- **Consecuencias:** los jurados que votan con la mayoría cobran su parte del costo del arbitraje y ganan reputación; los de la minoría pierden una parte del stake; quien no revela pierde el stake. La parte que pierde paga el costo.
- **Apelación:** una sola, con más jurados (2N+1) y a costo del apelante; si pierde paga el costo de la apelación.
- Cierra llamando a `Escrow.resolveDispute`.

### 4.5 VotingWeight
- Peso de voto no transferible, calculado a partir de `Reputation` y limitado por cuenta, implementado con la interfaz de votos de OpenZeppelin (`Votes`) y la delegación bloqueada a uno mismo. Requiere un depósito para votar. Queda fijo el modo de reloj por tiempo, no por bloques.

### 4.6 ProtocolGovernor y TimelockController
- `Governor` de OpenZeppelin con votos de `VotingWeight`, quórum como fracción y espera obligatoria en el `TimelockController`.
- El Timelock recibe `SETTER_ROLE` en `ParameterRegistry`; el administrador renuncia a los roles que pasan al gobierno según el plan de traspaso (sección 8).
- En Sepolia los plazos de votación son cortos (minutos) para poder demostrarlo; en producción se calibran.

## 5. Invariantes que no se pueden romper

Estas propiedades se prueban con fuzz y con pruebas de invariantes, además de los casos puntuales.

1. **Solvencia:** el saldo del escrow en cada token es igual a la suma de lo depositado en changas abiertas y en curso, más los saldos reclamables.
2. **Conservación:** en toda changa cerrada, pagado al prestador + devuelto al solicitante (o a los aportantes) + comisión + compensaciones + costo de arbitraje + tarifa de testigo = lo depositado. Nada se pierde ni se crea.
3. **Nadie cobra más de lo depositado.**
4. **Estados:** una changa solo avanza por transiciones válidas; `Settled` y `Cancelled` son finales.
5. **Una sola salida de fondos por changa:** no hay doble cobro ni por QR repetido ni por liberación automática después de un pago.
6. **Comisión:** nunca supera el 2% ni el tope por moneda.
7. **Permisos:** solo `Arbitration` resuelve disputas; solo el tesoro retira del tesoro; ningún rol de administrador mueve fondos de usuarios.
8. **Reparto grupal:** la suma de los reembolsos es exactamente el monto a devolver.
9. **Stake de jurado:** el stake bloqueado nunca supera el depositado y se libera por completo al cerrar el último caso.
10. **Parámetros:** ningún valor sale de su rango.

## 6. Plan de pruebas

### 6.1 Tipos de prueba

| Tipo | Qué cubre |
| --- | --- |
| Unitarias por función | Cada función con camino feliz, cada error personalizado y cada permiso |
| Bordes de tiempo | Un segundo antes y un segundo después de cada plazo (24 h, 72 h, 12 h de gracia, 20 minutos, vencimiento de firmas), cambio de mes en los contadores de cancelación gratis |
| Fuzz | Montos, plazos, cantidad de aportantes, porcentajes y órdenes de acciones |
| Invariantes con secuencias aleatorias | Un manejador que ejecuta acciones válidas e inválidas al azar sobre varias changas, y verifica la sección 5 después de cada una |
| Integración de punta a punta | Los escenarios A a F de la demo con todos los contratos reales |
| Pruebas de la app | Reproducen lo que hará el front (sección 6.2) |
| Bifurcación (fork) de Sepolia | Permit2 real y el USDC real de Sepolia, no los mocks |
| Estáticas | `forge fmt --check`, lint de Foundry, y un análisis estático con Slither o Aderyn |
| Cobertura | `forge coverage`; objetivo mínimo de 95% de líneas y 90% de ramas en `src/` |

### 6.2 Casos que replican la app y la producción

**Firmas y datos que genera el front**
- Vectores de prueba: un archivo JSON con los datos tipados y las firmas de cada mensaje (`Reservation`, `Agreement`, `Release`, `Attestation`, permisos de depósito y de Permit2) generados por Foundry. La app los usa para comprobar que su firma con viem produce exactamente el mismo resultado.
- Firma con cuentas de contrato (ERC-1271) además de cuentas normales.
- Firma con dominio equivocado (otra cadena, otro contrato), vencida, con campos alterados o repetida.
- QR cobrado por otra cuenta, a destiempo, con monto mayor al precio o después de la liberación automática.

**Relayer y meta-transacciones**
- Cada acción de usuario ejecutada por el `Forwarder`: `_msgSender` debe ser el firmante, no el relayer.
- Suplantación: llamar directo agregando el sufijo de una dirección ajena no debe funcionar.
- Lotes de acciones, firmas vencidas del forwarder y reuso de nonce.

**Depósitos y tokens**
- Permit consumido por un tercero antes (front-running): el depósito debe seguir funcionando.
- Permit2 con firma vencida, nonce usado y monto distinto.
- Token con comisión por transferencia: se rechaza.
- Token con 6 y con 18 decimales (los umbrales se leen por moneda).
- Cuenta bloqueada por el token al cobrar: el dinero queda reclamable y no traba el cierre.
- Dos monedas en changas distintas del mismo usuario sin mezclarse.

**Estados y concurrencia**
- Dos acciones que compiten en el mismo bloque: cobrar con QR y cancelar, liberación automática y objeción, retiro de aportante y acuerdo, aceptar jurado y vencer la invitación.
- Una changa reservada que vence, se cancela y se vuelve a reservar.
- Repetir cada acción dos veces.

**Grupal**
- 20 aportantes con el mínimo de 5%; 2 con el máximo de 50%; aporte justo en el borde; aporte fuera de rango.
- Redondeo en reembolsos con montos que no dividen exacto.
- El prestador intentando aportar desde otra cuenta con vínculo directo (se prueba que se rechaza la propia, y se documenta lo que el contrato no puede detectar).
- Objeción con 24,99% y con 25%, con una persona y con dos.

**Hitos**
- Hitos que no suman el precio, un solo hito, 10 hitos, pagar fuera de orden, anticipo sin reputación, anticipo mayor al 30%, término anticipado en cada estado de hito, abandono con anticipo sin gastar.

**Disputa y jurado**
- Changa chica, media y alta; jurados que no aceptan, que no revelan, que votan con empate, recusaciones; apelación con ganador distinto; árbitro de emergencia; parte que no responde a las 72 horas; jurado que es parte o tiene vínculo.
- Stake: pérdida parcial, pérdida total y liberación; jurado con 2 casos activos que recibe un tercero.

**Gobernanza**
- Un parámetro votado de punta a punta (propuesta, voto, espera, ejecución) y su efecto en una changa nueva y en una en curso.
- Intento de ejecutar sin esperar el Timelock, de fijar un valor fuera de rango y de votar sin peso o sin depósito.

### 6.3 Integración: escenarios de demo

| Escenario | Contratos que cruza |
| --- | --- |
| A. Individual completa | Escrow, Treasury, Reputation, Receipt, Forwarder |
| B. Efectivo | Escrow, Treasury, Reputation |
| C. Disputa con jurado | Escrow, Arbitration, Reputation, Credentials |
| D. Cancelación escalonada | Escrow, Treasury |
| E. Grupal con objeción | Escrow, Arbitration |
| F. Votar un parámetro | VotingWeight, Governor, Timelock, ParameterRegistry |

## 7. Criterio de "listo para Sepolia"

Los contratos se publican solo cuando se cumple todo esto:

1. Todos los contratos de la sección 4 y las ampliaciones de la sección 3 están implementados.
2. Todas las pruebas pasan, incluidas las invariantes con las corridas configuradas y los escenarios A a F.
3. Cobertura en el objetivo y sin advertencias nuevas de formato ni de lint.
4. Análisis estático sin hallazgos altos ni medios abiertos; los bajos están revisados y anotados.
5. Las pruebas con fork de Sepolia pasan con Permit2 y USDC reales.
6. El script de despliegue corre limpio contra un nodo local con fork (simulación) y deja los roles como se quiere.
7. Los vectores de firma están generados y guardados para la app.

## 8. Despliegue en Sepolia

1. Simulación local con fork de Sepolia y el script de despliegue completo.
2. Despliegue real: `Forwarder`, `ParameterRegistry`, `Treasury`, `Credentials`, `Reputation`, `Escrow`, `Receipt`, `Arbitration`, `VotingWeight`, `TimelockController`, `ProtocolGovernor`, en ese orden por dependencias.
3. Configuración: parámetros iniciales, monedas (USDC de Sepolia con permit y una segunda moneda con Permit2), roles entre contratos (`RECORDER_ROLE`, `ISSUER_ROLE`, `SETTER_ROLE`, `MINTER` y similares).
4. Verificación en el explorador y script de comprobación posterior que revisa roles, parámetros y conexiones.
5. Prueba de humo en Sepolia: se juega el escenario A con cuentas reales de prueba y el B.
6. Traspaso de roles: el administrador conserva solo los roles operativos (moderación, emisión de credenciales nivel 0, árbitro de emergencia, administrador de monedas); `SETTER_ROLE` y la autoridad sobre parámetros pasan al Timelock.
7. Se guardan las direcciones, los bloques de despliegue y los ABI en `contracts/deployments/sepolia.json`. De ahí leen el indexador, el backend y la app.

## 9. Decisiones que necesito de Maxi

Cada una tiene una recomendación; si estás de acuerdo con todas, sigo con ellas.

| # | Decisión | Recomendación |
| --- | --- | --- |
| D1 | Pagos que fallan (cuenta bloqueada por el token): saldo reclamable | Sí, agregarlo |
| D2 | Contratos sin actualización (sin proxys) | Sí, inmutables; se redespliega si hace falta |
| D3 | Testigo: quién lo elige y cómo cobra | Lo propone una de las partes en el acuerdo, lo firman ambas, cobra una tarifa fija desde la comisión |
| D4 | Sorteo de jurados | Compromiso y revelación entre los candidatos, como dicen los docs, con un plazo y reemplazo si alguien no revela |
| D5 | Moneda del stake de jurados | Una sola moneda configurada (USDC en Sepolia) |
| D6 | Quién gana si la parte demandada no responde en 72 horas | Gana quien reclama, con el costo a cargo de quien no respondió |
| D7 | Peso de voto | Basado en reputación con tope por cuenta, más un depósito para votar; sin nivel 1 porque queda fuera del TP |
| D8 | Reloj del Governor | Por tiempo (no por bloques), con plazos cortos en Sepolia |
| D9 | Moderación de publicaciones | En el TP la hace el administrador con `moderate` y el jurado solo en disputas; la denuncia comunitaria con stake queda fuera |
| D10 | Detección de vínculos entre jurado y partes | En el contrato solo se excluye a las partes, a los declarados y a quienes las partes recusan; el grafo de wallets queda para después |

## 10. Orden de construcción

Cada paso termina con las pruebas en verde y un commit antes de seguir.

1. **Base del Escrow:** pagos con respaldo, categoría, moderación, cambios a distancia, claves de parámetros nuevas.
2. **Credentials, Reputation y Receipt**, con sus pruebas y el gancho de cierre del escrow.
3. **Disputa en el Escrow** y reparto automático de changas chicas.
4. **Arbitration** completo (pool, sorteo, votos, apelación, emergencia, stake).
5. **Hitos, anticipo, término anticipado y abandono.**
6. **Changa grupal** con objeción.
7. **Testigo.**
8. **VotingWeight, ProtocolGovernor y Timelock**, y traspaso de roles.
9. **Invariantes, fuzz extendido, escenarios A a F, vectores de firma, cobertura y análisis estático.**
10. **Script de despliegue completo, pruebas con fork y publicación en Sepolia.**

## 11. Riesgo de cronograma

Quedan 27 días hasta el 1 de diciembre y todavía no existen el backend, la app ni el panel. Los diez pasos son mucho trabajo antes de empezar lo demás. Para no llegar tarde, propongo fijar una fecha tope para publicar en Sepolia y, si se cumple el tope sin llegar al paso 10, publicar lo que esté terminado y probado (los pasos 1 a 4, por ejemplo) y seguir en paralelo con el backend. Esa fecha la decide Maxi.
