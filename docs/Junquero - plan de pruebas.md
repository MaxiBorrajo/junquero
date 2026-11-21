# Junquero: plan de pruebas de flujos

Para probar a mano, con la app, el servidor y el panel, antes de la entrega del 24/11/2026. Son pruebas de flujo, pantallas y roles; no revisan detalles de interfaz. Cada prueba tiene un casillero para marcar.

**Cómo marcar:** `[ ]` pendiente · `[x]` anda como se espera · `[!]` falla (anotar en "Observaciones" qué pasó, en qué pantalla y la hora, para buscarlo en el log del servidor).

**Los textos de los botones pueden variar un poco.** Lo que importa es la acción y el resultado.

**Actualizado el 20/11/2026 (2):** las pruebas que ya están hechas (todas sus casillas en `[ x ]`) pasaron a `Junquero - pruebas realizadas.md`. Acá quedan solo las **pendientes** y las que **fallaron**; la numeración no cambió. **Actualizado el 20/11/2026:** las pruebas de implementación futura pasaron a `Junquero - pruebas de implementacion futura.md`, y el reclamo con jurado (8.3 en adelante) se reescribió según lo que hace el sistema. **Actualizado el 15/11/2026.** Todos los botones de la app llevan ícono (probar al pasar por cada pantalla que sean coherentes). Se agregaron pruebas para lo que cambió desde la versión anterior (las marcas ya hechas no se tocaron): contraofertas más altas con suma de la diferencia en garantía (3.8 y 3.9) y planes de hitos con total distinto al publicado (3.7, 3.10 a 3.12), selección de varios adjuntos con vista previa (2.8), buscador de lugares (2.7), pedidos de evidencia (2.9), verificación que se actualiza sola (1.6), estado "Cancelando" (7.7), billetera desconectada (15.10) e indexado rápido (15.11). El contrato se volvió a desplegar el 14/11 con la misma moneda de prueba; ver la nota de 0.2.

## Alcance

**Dentro del alcance:** publicar y explorar, postulación y acuerdo, chat, hacer la changa y cobrar, hitos, cancelaciones, reclamo y jurado, perfil, panel de administración y casos transversales.

**Fuera del alcance por ahora (implementación futura):** changa grupal, votación de parámetros, pago en efectivo, testigo, notificaciones push reales y algunas funciones del panel. Sus pruebas están en `Junquero - pruebas de implementacion futura.md` y no cuentan en el resumen de este plan. El jurado sí está dentro del alcance. Los cambios de contrato ya anotados para los reclamos están en `Junquero - plan a futuro.md` y en `Junquero - cambios de contrato pendientes.md`.

## 0. Preparación

### 0.1 Roles y cuentas

Cada rol es una billetera distinta. Los nombres son solo para este documento.

| Rol | Qué hace | Cuántas | Notas |
| --- | --- | --- | --- |
| Ana | Publica changas y paga (solicitante) | 1 | |
| Beto | Se postula y trabaja (prestador) | 1 | Tiene que haber cerrado changas sin reclamo para algunas reglas |
| J1, J2, J3 | Jurado | 3 (5 si se prueba una changa alta) | Cada una con la garantía de 10 USDC depositada |
| J4, J5 | Jurado de reemplazo y apelación | 2 | La apelación suma jurados (2N+1) |
| Admin | Panel de administración | 1 | La cuenta `0x4E5e…6511`, la del despliegue |
| Relayer | Paga el gas de las operaciones | 1 | No es una persona: tiene que tener ETH de Sepolia |

Las cuentas de demo ya están creadas en Sepolia (solicitante, prestador, cinco jurados, tres aportantes y un testigo), con credencial de nivel 0, jurados semilla y fondos de prueba. Sus direcciones están en `demoAccounts` de `contracts/deployments/sepolia.json` y sus claves en los keystores de Foundry de la compu de Maxi. Se pueden importar a MetaMask para no tener que crear ni fondear cuentas nuevas.

Con dos celulares o un celular y el emulador alcanza para los flujos de dos partes. Para jurados y aportantes se cambia de cuenta en la misma billetera o se usa más de un dispositivo.

### 0.2 Entorno

Elegir uno y anotarlo al empezar cada sesión.

- [ x ] **Local:** `backend` con `npm run dev`, emulador con `EXPO_PUBLIC_API_URL=http://localhost:8787` y panel con `npm run dev`. Ver `README.md`, sección "Levantar todo en local".
- [ ] **Dev (nube):** app de desarrollo instalada (o APK release), servidor `junquero-api` desplegado con la última versión (`cd backend && npm run deploy`) y panel con `npm run dev:cloud` (necesita `ADMIN_ORIGINS` cargado en el servidor). El admin desplegado también se ve en la misma dirección del servidor.

**Despliegue vigente (14/11/2026):** Escrow `0x5cF0…E2Bc`, con la misma moneda de prueba (`0x1871…a2dc`). Trae `topUp` (sumar fondos a una changa abierta). Se volvieron a sembrar las cuentas de demo (credenciales y jurados semilla). El webhook de Alchemy tiene que apuntar a las direcciones nuevas y la clave de firma tiene que estar cargada en el servidor. Las direcciones están en `contracts/deployments/sepolia.json`.

Antes de empezar:
- [ x ] `GET /health` del servidor responde `ok` y `lastIndexedBlock` avanza (el cron está indexando).
- [ x ] El relayer tiene ETH de Sepolia (ver saldo de su dirección).
- [ x ] Las pruebas automáticas pasan: `cd app && npm test`, `cd backend && npm test`, `cd admin && npm test`.
- [ ] Opcional: pruebas de punta a punta (`bash app/e2e/up.sh` y después `npx vitest run --config vitest.e2e.config.ts` en `/tmp/junquero-e2e/repo/app`), que cubren individual, hitos y reclamo con jurado (también hay de grupal, cuyas pruebas están en el documento de implementación futura) contra una cadena local.

### 0.3 Fondos de prueba

- [ x ] Ana tiene USDC de prueba suficiente (por lo menos 200 para cubrir la changa por hitos y la de jurado).
- [ x ] Beto tiene USDC de prueba para la garantía de postulación.
- [ x ] J1 a J5 tienen cada una 10 USDC de garantía depositada como jurado (ver 8.1). *Tras el redespliegue del 14/11 hay que volver a depositarla en el Arbitration nuevo (la anterior quedó en el contrato viejo).*
- [ x ] Anotar los saldos iniciales de Ana y Beto para comprobar los movimientos de plata en cada prueba.

### 0.4 Plazos

El despliegue de Sepolia está en modo DEMO. Valores vigentes (según `Deploy.s.sol` y el traspaso):

| Qué | Valor en DEMO | ¿Se prueba en vivo? |
| --- | --- | --- |
| Responder un reclamo, aceptar la invitación de jurado, apelar, revelar la semilla, votar (commit) y revelar el voto | 5 minutos cada uno | Sí |
| Espera por no presentación | 20 minutos | Sí |
| Liberación automática de una changa corta y de un hito | 24 h y 72 h (el mínimo permitido es 1 h) | No: ver abajo |
| Vencimiento del acuerdo si una parte no firma | A verificar en el servidor (el diseño dice 24 h) | A verificar |

- Las ventanas del jurado son de minutos, así que el escenario C se puede recorrer completo en una sola sesión.
- La liberación automática (5.9 y 6.3) no se puede esperar. Hay dos caminos: la prueba de punta a punta, que avanza el reloj de una cadena local, o bajar el parámetro con el script `contracts/script/SetParameter.s.sol` (la liberación automática admite hasta 1 hora). La votación en pantalla es implementación futura.

---

## 1. Registro y perfil

Las pruebas 1.1, 1.2 y 1.4 a 1.6 ya están hechas: ver `Junquero - pruebas realizadas.md`.

**1.3 Aprobar la selfie desde el panel** · Rol: Admin
- [ x ] Pasos: panel → Selfies → aprobar la de Ana y la de Beto.
- Esperado: en la app pasa a "Junquero verificado" (etiqueta verde con el pájaro del logo). La imagen se borra del servidor y queda solo el estado.
- Variante: [ ! ] rechazar una selfie → en la app aparece "Verificación rechazada" y se puede sacar otra.

---

## 2. Publicar y explorar

Todas las pruebas de esta sección ya están hechas: ver `Junquero - pruebas realizadas.md`.

---

## 3. Postulación y acuerdo

Todas las pruebas de esta sección ya están hechas: ver `Junquero - pruebas realizadas.md`.

---

## 4. Chat y notificaciones

Todas las pruebas de esta sección ya están hechas: ver `Junquero - pruebas realizadas.md`.

**4.4 Notificaciones push reales** · Rol: cualquiera
- Pasó al documento de pruebas de implementación futura: requiere que Maxi cree el proyecto de Expo. Mientras tanto Ajustes muestra "No disponibles en esta versión".

---

## 5. Hacer la changa y cobrar (escenario A)

Las pruebas 5.1 a 5.9 ya están hechas: ver `Junquero - pruebas realizadas.md`.

Con la changa individual presencial ya acordada (prueba 3.4).

**5.10 Changa a distancia con pedido de cambios** · Rol: Ana y Beto
- [ ] Pasos: Beto entrega → Ana pide cambios (hasta 2 rondas) → Beto vuelve a entregar → Ana aprueba.
- Esperado: no hay QR; se libera con "Está todo bien". Una tercera ronda de cambios no se permite.

---

## 6. Changas por hitos

Con la changa por hitos acordada (2.5 y 3.4).

Todas las pruebas de esta sección ya están hechas: ver `Junquero - pruebas realizadas.md`.

---

## 7. Cancelaciones escalonadas (escenario D)

Cada fila es una prueba distinta; usar changas nuevas y anotar el costo real.

Todas las pruebas de esta sección ya están hechas: ver `Junquero - pruebas realizadas.md`.

- **7.9 a 7.11** (pago en efectivo, changa grupal y cobro apagado por votación): pasaron al documento de pruebas de implementación futura.

Esperado en todos: quién paga, quién cobra y cuánto coincide con los parámetros del contrato. Anotar montos.

---

## 8. Reclamo y jurado (escenario C)

### 8.1 Ser jurado

Todas las pruebas de esta sección ya están hechas: ver `Junquero - pruebas realizadas.md`.

### 8.2 Disputa chica (sin jurado)

Todas las pruebas de esta sección ya están hechas: ver `Junquero - pruebas realizadas.md`.

### 8.3 Disputa con jurado (monto medio, 3 jurados)

Las pruebas 8.3.1 a 8.3.4 y 8.3.14 ya están hechas: ver `Junquero - pruebas realizadas.md`.
**8.3.5 Sorteo de jurados** · Rol: sistema, J1 a J3
- [ x ] Esperado: pasado el plazo de revelar, el backend sortea solo (revisa cada minuto), entre quienes revelaron, tantos jurados como pide el reclamo (3 en uno mediano), al azar y parejo. La garantía de 10 USDC de cada elegido queda "en uso". Cada elegido recibe "Te sortearon como jurado", el caso aparece en Mis casos con "Te toca votar" y la pestaña muestra un número. Quien reveló y no salió elegido recibe "No te tocó en este reclamo" y su garantía queda libre. (Nota: el sorteo no excluye a quienes tuvieron changas con las partes; solo excluye a las partes y a las cuentas recusadas.)
- [ x ] Variante: menos jurados que revelaron de los que hacen falta → se abre otra ronda con plazos nuevos (hasta 3 más). Ver 8.3.14.
- Observaciones: _

**8.3.6 Avance del sorteo visible a las partes** · Rol: Ana, Beto
- [ x ] Pasos: abrir el reclamo mientras se busca jurados.
- Esperado: se ve "Sorteo de jurados · ronda N de hasta 4", los plazos, cuántos se anotaron y cuántos revelaron sobre los necesarios, y qué pasa si no alcanzan. Se actualiza solo. Nunca se ve quiénes son los jurados. Una vez sorteados, a las partes les llega "Ya hay jurados" y, al abrir el reclamo, la app comparte sus pruebas cifradas con cada jurado sin tocar nada (si algún jurado todavía no tiene su clave publicada, reintenta cada 30 segundos mientras la pantalla está abierta; no hay botón manual para compartir).

**8.3.7 Revisar el caso** · Rol: J1 a J3
- [ x ] Pasos: Mis casos → abrir el caso.
- Esperado: se ven las pruebas separadas en "Evidencias del trabajo", "Parte A (publicó): su versión y sus pruebas" y "Parte B (hizo el trabajo): su versión y sus pruebas", sin identidades. El relato se lee en una tarjeta; los archivos son miniaturas que se abren al tocarlas; con más de 6 archivos por bloque hay "Ver los N archivos". Si una parte todavía no compartió, su bloque lo dice. Se ve el plazo con el tiempo que queda. (Hoy el jurado no ve el acuerdo completo ni el chat, solo lo que las partes comparten.)
- Observaciones: _

**8.3.8 Votar (guardar el voto)** · Rol: J1 a J3
- [ x ] Pasos: elegir Parte A o Parte B → "Guardar mi voto en secreto" → firmar en la billetera, dentro del plazo de votar (15 min).
- Esperado: queda guardado en secreto (solo su huella en la cadena); la tarjeta pasa a "Voto guardado" y no se ve el voto de los demás. Si se pasa el plazo sin votar, la pantalla muestra "Se te pasó el plazo…" y la tarjeta "Plazo perdido", sin botones.
- Observaciones: _

**8.3.9 Mostrar el voto** · Rol: J1 a J3
- [ x ] Pasos: cuando cierra el plazo de votar, "Mostrar mi voto" dentro de los otros 15 min.
- Esperado: no se puede mostrar antes de que cierre el plazo de votar. Cuando los tres lo mostraron, el caso se cuenta sin esperar al final del plazo; si no, se cuenta al terminar. Gana la mayoría de los votos mostrados.

**8.3.10 Veredicto y reparto** · Rol: Ana, Beto, J1 a J3
- [ x ] Esperado: el veredicto es todo o nada: el pago va entero a quien ganó (a quien hizo el trabajo, o se devuelve a quien pagó); no hay reparto parcial. Hay un plazo de apelación (15 min) y después se ejecuta solo. Si gana quien reclamó, recupera el costo del reclamo (sale de la parte del perdedor); si pierde, el costo queda para los jurados de la mayoría. Los jurados de la mayoría se reparten el costo del reclamo como recompensa (en "Recompensas para retirar", 1 USDC cada uno con 3 jurados) y recuperan su garantía; el que votó en minoría pierde el 25% de la garantía de ese caso (2,5 USDC). Las partes reciben "Se resolvió un reclamo" y el trabajo dice "Ganaste el reclamo…" o "Perdiste el reclamo…". Las identidades de las partes no se revelan a los jurados en ningún momento.
- Observaciones: _

**8.3.11 Jurado que no vota o no muestra su voto** · Rol: J3
- [ x ] Pasos: J3 no guarda su voto o lo guarda y no lo muestra a tiempo.
- Esperado: pierde toda la garantía del caso (10 USDC, que va al tesoro) y no cobra. Las otras dos votaciones siguen y deciden el caso. Se aplica igual si no vota, sea por plazo o por no revelar.

**8.3.12 Empate o nadie muestra su voto** · Rol: Admin
- [ x ] Esperado: si los votos mostrados empatan (por ejemplo 1 a 1 porque el tercero no mostró) o no hay ninguno, el caso pasa a resolución de emergencia y lo resuelve el administrador (8.3.14). Quienes mostraron voto no pierden ni cobran; quienes no votaron pierden su garantía. Se devuelve el costo del reclamo a quien reclamó.

**8.3.13 Apelación** · Rol: la parte perdedora
- [ x ] Pasos: dentro del plazo de apelación, "Apelar" → paga el costo adicional (el valor de un jurado por cada uno de los 2N+1, 7 USDC si eran 3).
- Esperado: solo puede apelar quien perdió, una sola vez. Se sortea un jurado ampliado de 2N+1 (7 si eran 3) con nueva anotación, revelado y votación; los jurados anteriores no pueden repetir. Hacen falta al menos 7 jurados habilitados además de los 3 anteriores: con las cuentas de demo no alcanza, así que esta prueba termina en emergencia (8.3.14) salvo que se sumen cuentas. Si gana la apelación, se le devuelve el costo de la parte del que pierde ahora. El resultado es definitivo.

**8.3.15 Quien debía responder no responde** · Rol: Beto, Ana
- [ ] Pasos: Beto no responde dentro del plazo de respuesta (15 min en Sepolia).
- Esperado: el backend resuelve solo a favor de quien reclamó: el pago va a su favor y se le devuelve el costo del reclamo. El trabajo dice a Ana "Ganaste el reclamo… La otra parte no respondió a tiempo" y a Beto "Perdiste el reclamo… No respondiste a tiempo". Un relato subido fuera de plazo no se acepta.

### 8.4 Changa alta (más de 300 USDC, 5 jurados)
- [ ] Repetir 8.3 con 5 jurados. Las changas altas piden testigo (ver sección 12). Hacen falta al menos 5 jurados habilitados que no sean parte; el costo del reclamo es de 5 USDC y una apelación necesitaría 11 jurados más, lo que con las cuentas de demo no alcanza.

### 8.5 Acuerdo amistoso
- No disponible: el contrato no tiene resolución por acuerdo entre las partes. Está en el plan a futuro (sección 7).

---

## 9. Implementación futura (pasó a otro documento)

Lo que todavía no está desarrollado o está fuera del alcance se prueba en **`Junquero - pruebas de implementacion futura.md`**: la changa grupal (antes sección 9 y 9.10), votar un parámetro (antes 12), pago en efectivo (antes 13), testigo (antes 14), las notificaciones push reales (4.4), suspender usuarios y el fondo, los parámetros y las métricas del panel (11.5 y 11.9) y las pruebas 7.9, 7.10 y 7.11. Los números de las demás secciones no cambiaron.

---

## 10. Perfil, actividad y ajustes

Todas las pruebas de esta sección ya están hechas: ver `Junquero - pruebas realizadas.md`.

---

## 11. Panel de administración (escenario H)

Las pruebas 11.1 a 11.4 y 11.6 ya están hechas: ver `Junquero - pruebas realizadas.md`.

Servidor local o de dev, panel contra ese servidor, entrando con la cuenta Admin.

**11.5 Usuarios** · Rol: Admin
- [ ] Esperado: se ve la lista con reputación y verificación.
- Suspender y reactivar usuarios: todavía no existe; la prueba está en el documento de pruebas de implementación futura.

**11.7 Reclamos de emergencia** · Rol: Admin
- [ ] Pasos: con un reclamo sin jurados suficientes (8.3.14), resolver firmando como árbitro.
- Esperado: el contrato aplica el reparto. Queda en el registro con motivo.

**11.8 Registro de acciones** · Rol: Admin
- [ ] Esperado: cada acción de moderación aparece con billetera, fecha y motivo.

**11.9 Fondo, parámetros y métricas**
- Fondo, parámetros y métricas con exportación: todavía no existen; las pruebas están en el documento de pruebas de implementación futura.

---

## 15. Casos transversales

Las pruebas 15.1 a 15.4 y 15.6 a 15.22 ya están hechas: ver `Junquero - pruebas realizadas.md`.

**15.5 Relayer sin gas** · [ ] Vaciar el saldo de ETH del relayer. Esperado: la app muestra un error de servicio sin mover plata; el panel marca el problema en la salud. Volver a cargar y comprobar que se recupera.

---

## 16. Resumen de estado

Completar al terminar cada sesión de pruebas. Los números de "OK" cuentan las pruebas que ya están en `Junquero - pruebas realizadas.md`.

| Bloque | Pruebas | OK | Fallan | Pendientes |
| --- | --- | --- | --- | --- |
| 1. Registro y perfil | 6 | 5 | 1 | 0 |
| 2. Publicar y explorar | 11 | 11 | 0 | 0 |
| 3. Postulación y acuerdo | 13 | 13 | 0 | 0 |
| 4. Chat y notificaciones | 14 | 14 | 0 | 0 |
| 5. Hacer la changa y cobrar | 10 | 9 | 0 | 1 |
| 6. Hitos | 6 | 6 | 0 | 0 |
| 7. Cancelaciones | 8 (7.9 a 7.11 están en el documento de futuro) | 8 | 0 | 0 |
| 8. Reclamo y jurado | 19 | 8 | 0 | 11 |
| 10. Perfil y ajustes | 5 | 5 | 0 | 0 |
| 11. Panel | 8 | 5 | 0 | 3 |
| 15. Transversales | 22 | 21 | 0 | 1 |
| Implementación futura (grupal, votación, efectivo, testigo, push, panel) | En otro documento | | | |

**Fallas encontradas** (anotar acá y arreglar después):

| # | Prueba | Qué pasó | Entorno y hora | Arreglada |
| --- | --- | --- | --- | --- |
| | | | | |
