# Junquero: plan de pruebas de flujos

Para probar a mano, con la app, el servidor y el panel, antes de la entrega del 24/11/2026. Son pruebas de flujo, pantallas y roles; no revisan detalles de interfaz. Cada prueba tiene un casillero para marcar.

**Cómo marcar:** `[ ]` pendiente · `[x]` anda como se espera · `[!]` falla (anotar en "Observaciones" qué pasó, en qué pantalla y la hora, para buscarlo en el log del servidor).

**Actualizado el 25/11/2026:** las pruebas con todas sus casillas en `[ x ]` (8.3.5 a 8.3.13, 8.3.15 y 8.4) pasaron a `Junquero - pruebas realizadas.md` y lo que es de implementación futura (sección 9, 4.4, 7.9 a 7.11, 8.5 y 11.9, y la parte de suspender usuarios de 11.5) pasó a `Junquero - pruebas de implementacion futura.md`. Acá quedan solo las **pendientes** y las que **fallaron**; la numeración no cambió.

## Alcance

**Dentro del alcance:** lo que falta probar de registro y perfil, hacer la changa y cobrar, panel de administración y casos transversales. Lo que no está desarrollado se prueba en `Junquero - pruebas de implementacion futura.md` y no cuenta en el resumen de este plan.

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

Las cuentas de demo ya están creadas en Sepolia (solicitante, prestador, cinco jurados y tres aportantes), con credencial de nivel 0, jurados semilla y fondos de prueba. Sus direcciones están en `demoAccounts` de `contracts/deployments/sepolia.json` y sus claves en los keystores de Foundry de la compu de Maxi. Se pueden importar a MetaMask para no tener que crear ni fondear cuentas nuevas.

Con dos celulares o un celular y el emulador alcanza para los flujos de dos partes. Para jurados y aportantes se cambia de cuenta en la misma billetera o se usa más de un dispositivo.

### 0.2 Entorno

Elegir uno y anotarlo al empezar cada sesión.

- [ x ] **Local:** `backend` con `npm run dev`, emulador con `EXPO_PUBLIC_API_URL=http://localhost:8787` y panel con `npm run dev`. Ver `README.md`, sección "Levantar todo en local".
- [ x ] **Dev (nube):** app de desarrollo instalada (o APK release), servidor `junquero-api` desplegado con la última versión (`cd backend && npm run deploy`) y panel con `npm run dev:cloud` (necesita `ADMIN_ORIGINS` cargado en el servidor). El admin desplegado también se ve en la misma dirección del servidor.

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

**1.3 Aprobar la selfie desde el panel** · Rol: Admin
- [ x ] Pasos: panel → Selfies → aprobar la de Ana y la de Beto.
- Esperado: en la app pasa a "Junquero verificado" (etiqueta verde con el pájaro del logo). La imagen se borra del servidor y queda solo el estado.
- Variante: [ ! ] rechazar una selfie → en la app aparece "Verificación rechazada" y se puede sacar otra.

---

## 5. Hacer la changa y cobrar (escenario A)

Con la changa individual presencial ya acordada.

**5.10 Changa a distancia con pedido de cambios** · Rol: Ana y Beto
- [ x ] Pasos: Beto entrega → Ana pide cambios (hasta 2 rondas) → Beto vuelve a entregar → Ana aprueba.
- Esperado: no hay QR; se libera con "Está todo bien". Una tercera ronda de cambios no se permite.

---

## 11. Panel de administración (escenario H)

Servidor local o de dev, panel contra ese servidor, entrando con la cuenta Admin.

**11.5 Usuarios** · Rol: Admin
- [ x ] Esperado: se ve la lista con reputación y verificación.

**11.7 Reclamos de emergencia** · Rol: Admin
- [ x ] Pasos: con un reclamo sin jurados suficientes (8.3.14), resolver firmando como árbitro.
- Esperado: el contrato aplica el reparto. Queda en el registro con motivo.

**11.8 Registro de acciones** · Rol: Admin
- [ x ] Esperado: cada acción de moderación aparece con billetera, fecha y motivo.


## 15. Casos transversales

**15.5 Relayer sin gas** · [ ] Vaciar el saldo de ETH del relayer. Esperado: la app muestra un error de servicio sin mover plata; el panel marca el problema en la salud. Volver a cargar y comprobar que se recupera.

---

## 16. Resumen de estado

Completar al terminar cada sesión de pruebas. Las que ya pasaron están en `Junquero - pruebas realizadas.md` (116).

| Bloque | Pruebas | Fallan | Pendientes |
| --- | --- | --- | --- |
| 1. Registro y perfil | 1.3 (variante de rechazar selfie) | 1 | 0 |
| 5. Hacer la changa y cobrar | 5.10 | 0 | 1 |
| 11. Panel | 11.5, 11.7 y 11.8 | 0 | 3 |
| 15. Transversales | 15.5 | 0 | 1 |

**Fallas encontradas** (anotar acá y arreglar después):

| # | Prueba | Qué pasó | Entorno y hora | Arreglada |
| --- | --- | --- | --- | --- |
| | | | | |
