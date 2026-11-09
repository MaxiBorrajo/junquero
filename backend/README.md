# Junquero API

Worker de Cloudflare (`junquero-api`) con Hono, D1 y viem. La app habla solo con esta API y con los contratos.

Comandos: `npm test`, `npm run typecheck`, `npm run deploy`, `npx wrangler d1 migrations apply junquero --remote`.

Secretos del Worker (se cargan con `npx wrangler secret put NOMBRE`): `RPC_URL`, `RELAYER_KEY`, `AUTH_SECRET` (por ejemplo `openssl rand -base64 32 | npx wrangler secret put AUTH_SECRET`).

## Sesión

`POST /auth/login` con `{ address, issuedAt, signature }`. La firma es `personal_sign` (EIP-191) sobre este texto exacto, con la dirección en minúsculas y `issuedAt` en segundos Unix (se acepta hasta 5 minutos de diferencia con el reloj del servidor):

```
Junquero: confirmo que esta billetera es mía.
Billetera: 0xdireccionenminusculas
Emitido: 1794190000
```

Devuelve `{ token, expiresAt, address }`. El token dura 7 días y va en `Authorization: Bearer <token>`. La función `buildLoginMessage` de `src/auth.ts` arma el texto.

## Perfil

- `PUT /me/profile` `{ name (2 a 40), categories: number[] (hasta 10, 0 a 255), work: { lat, lng, radiusM (500 a 50000) } }`. La zona se redondea a 3 decimales.
- `GET /me` devuelve la dirección y el perfil propio (con zona de trabajo y estado de la selfie).
- `GET /profiles/:address` es público: nombre, categorías, zona general (2 decimales), `verified` y fecha de alta. No expone la zona exacta ni el estado de la selfie.

La imagen de la selfie y la foto de perfil esperan a R2. `selfie_status` queda en `none`.

## Changas

La ficha de la changa (qué, dónde, cuándo) vive fuera de la cadena. En la cadena queda solo su hash, en `specHash` de `createOrder`.

1. `POST /me/changas` con la ficha. Devuelve `{ specHash, canonical }` (201 si es nueva, 200 si ya existía). El servidor valida, redondea la zona a 3 decimales y calcula `specHash = keccak256(canonical)`, con las claves ordenadas y sin espacios. La app usa ese `specHash` en `createOrder`.
2. Cuando el indexador ve `OrderCreated` con ese `specHash` y el mismo pagador, la changa pasa a `open`, con monto y moneda, y aparece en el mapa. Si otra cuenta crea una orden con el mismo hash, no se vincula.
3. Sin orden en 24 horas, el borrador se borra. Máximo 20 borradores sin publicar por cuenta.

La ficha no se edita una vez creada la orden, porque el hash queda fijado en la cadena. Cambiarla es cancelar y publicar otra.

Ficha (versión 1), con campos desconocidos rechazados:

| Campo | Regla |
| --- | --- |
| `v` | `1` |
| `title` | 3 a 80 caracteres |
| `description` | hasta 2000, opcional |
| `category` | entero 0 a 255 |
| `modality` | `onsite` o `remote` |
| `nonce` | 8 a 64 caracteres; la app genera uno al azar para que dos fichas iguales tengan hashes distintos |
| `area` | obligatorio si es `onsite`, prohibido si es `remote`: `{ lat, lng, radiusM (200 a 2000) }` |
| `startsAt`, `deadline` | segundos Unix a futuro; `deadline` posterior a `startsAt` |
| `durationMin` | 1 a 10080 |
| `evidence` | hasta 5 textos de hasta 120 caracteres |
| `attachments` | hasta 10 `{ hash, name, mime, size }` |

Privacidad: el servidor no recibe ni guarda la dirección exacta. La app debe mandar como `area` el centro de un círculo de unos 300 metros desplazado al azar respecto del punto real. La dirección exacta se intercambia por el chat cifrado después del acuerdo.

Lectura:
- `GET /changas?minLat&maxLat&minLng&maxLng` (obligatorio, máximo 2 grados por lado) lista las abiertas. `GET /changas?modality=remote` lista las a distancia. Filtros: `category`, `minAmount` y `maxAmount` (en micro-dólares, es decir unidades de 6 decimales), `before` (id, para paginar) y `limit` (hasta 50).
- `GET /changas/:specHash` devuelve las publicadas con ese hash.
- `GET /me/changas` devuelve las propias, con borradores.

El monto se normaliza a 6 decimales según los decimales de la moneda; hoy solo `TestUSDC` está en el mapa de `deployedTokenDecimals` (`src/contracts.ts`). Al agregar DAI hay que sumar sus 18 decimales ahí.

## Postulaciones

Viven fuera de la cadena hasta que se acuerda. Se identifican por el `id` de la changa publicada (el que devuelve `GET /changas`).

- `PUT /me/applications/:changaId` crea o actualiza la propia: `{ amount?, message (hasta 500), attachments? (hasta 3) }`. `amount` es una contraoferta en unidades de la moneda; sin `amount` se acepta el monto publicado. Una por cuenta y changa. 201 si es nueva, 200 si se actualiza.
- `DELETE /me/applications/:changaId` la retira. Se puede volver a postular.
- `GET /me/applications` lista las propias con el estado de la changa.
- `GET /me/changas/:changaId/applications` las ve solo quien publicó, con nombre, zona general y `verified` de cada postulante. La reputación se lee de la cadena.

Reglas: no se puede postular a la propia changa ni a una que no esté `open`; máximo 50 activas por changa y 30 por postulante. Con la variable `REQUIRE_VERIFIED_APPLICANT=true` se exige selfie aprobada (hoy `false`, porque todavía no hay flujo de selfie).

Estados: `active`, `withdrawn`, `chosen` (el indexador ve `OrderAgreed` con ese prestador) y `closed` (otra persona fue elegida o la orden se cerró).

## Cadena

- `POST /relay`: pedido firmado para el Forwarder (ver `src/relay.ts`).
- `GET /health`, `GET /events` y `GET /orders/:id/timeline`: eventos indexados.

## Límites por IP

Relayer 10 por minuto, sesión 10, lecturas 120, escrituras 20 por cuenta. Cambian en `wrangler.jsonc`.
