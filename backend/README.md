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

`PUT /me/profile` reemplaza todo el perfil e incluye `photo` opcional (el sha256 de una imagen ya subida con `/me/files`). Sin `photo` se quita la foto.

## Archivos

Se guardan en R2 (bucket `junquero`, binding `FILES`), con clave `files/<dirección>/<sha256>`. El hash de un archivo es su **SHA-256**, que la app calcula antes de subir; R2 lo verifica al recibirlo sin gastar CPU del Worker.

- `PUT /me/files`: cuerpo con los bytes del archivo y encabezados `Content-Type`, `Content-Length` y `X-Content-SHA256` (64 caracteres hexadecimales). Devuelve `{ hash, url }` (201 si es nuevo, 200 si ya estaba). Tipos admitidos: JPEG, PNG, WebP, MP4, MOV, PDF, Word, Excel, TXT y CSV, hasta 25 MB. Cuota por cuenta: 200 archivos y 200 MB.
- `GET /files/:dirección/:hash`: público, con caché inmutable. Los documentos se descargan, no se abren en el navegador.
- En una ficha de changa o en una postulación, cada adjunto `{ hash: "0x" + sha256, name, mime, size }` debe coincidir con un archivo subido por la misma cuenta; si no, 400.
- Un archivo que nadie referencia (ficha, postulación o foto de perfil) se borra a las 24 horas.

Estos archivos son públicos para quien conozca el hash. La evidencia de cierre y los adjuntos del chat, que son privados y van cifrados, se resuelven con el chat.

## Selfie

- `PUT /me/selfie` (JPEG o PNG, hasta 2 MB, mismos encabezados que `/me/files`): requiere perfil creado y deja `selfieStatus: "pending"`. Una nueva reemplaza a la pendiente. Con la selfie ya aprobada devuelve 409.
- `GET /me/selfie` devuelve la propia mientras esté pendiente.
- `GET /admin/selfies` lista las pendientes, `GET /admin/selfies/:dirección` muestra la imagen y `POST /admin/selfies/:dirección` con `{ approved: true | false }` resuelve. Solo las direcciones de `ADMIN_ADDRESSES` (hoy la cuenta administradora de los contratos).
- Al resolver, la imagen se borra de R2 y queda solo el estado (`approved` o `rejected`). Una selfie rechazada se puede volver a enviar.

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

## Chat cifrado

Hay un chat por postulación (el `id` de la postulación). El servidor guarda solo texto cifrado y no puede leerlo.

Claves (lo que tiene que hacer la app):
1. La clave de chat se deriva de la billetera: firmar con `personal_sign` el texto fijo `Junquero: clave de chat v1`, tomar `keccak256(firma)` como semilla de 32 bytes y generar el par con `crypto_box_seed_keypair` de libsodium. La firma de MetaMask es determinista, así que la misma billetera recupera la misma clave en otro teléfono.
2. Publicar la clave pública con `PUT /me/chat-key` `{ publicKey (64 caracteres hexadecimales), signature }`, donde la firma es `personal_sign` de `Junquero: esta es mi clave de chat.\nBilletera: <dirección en minúsculas>\nClave: <publicKey en minúsculas>` (`buildChatKeyMessage` en `src/auth.ts`).
3. Para escribirle a alguien, pedir su clave con `GET /me/chat-keys/:dirección`.
4. Cada mensaje se cifra con `crypto_box_easy` usando un nonce aleatorio de 24 bytes. En la API, `nonce` y `body` (el texto cifrado) van en base64.

API:
- `GET /me/chats`: mis chats con título de la changa, contraparte, `writable`, último mensaje y si hay algo sin leer.
- `GET /me/chats/:id/messages?after=<seq>&limit=` historial. `POST /me/chats/:id/messages` `{ nonce, body, clientId }` envía; `clientId` (8 a 64 caracteres) hace idempotentes los reintentos de la cola sin conexión (200 si ya existía). `POST /me/chats/:id/read` `{ seq }` marca leído.
- Tiempo real: `POST /me/chats/:id/ticket` devuelve un ticket de 60 segundos; luego se abre un WebSocket a `/chat/:id/ws?ticket=...`. El cliente manda `{ t: "send", id, nonce, body }` y recibe `{ t: "ack", id, seq }` o `{ t: "error", id, status, error }`; todos los conectados reciben `{ t: "message", message }`. `{ t: "ping" }` responde `{ t: "pong" }`.
- Reglas: solo las dos partes. Escribir requiere que la postulación esté `active` o `chosen` y que la changa no esté liquidada o cancelada; si no, el chat queda de solo lectura. Máximo 20 mensajes por minuto por persona y 8192 caracteres por mensaje.

## Notificaciones push

- `PUT /me/push-token` `{ token: "ExponentPushToken[...]", platform: "android" | "ios" }` registra el dispositivo (hasta 5 por cuenta; un token que pasa a otra cuenta se mueve). `DELETE /me/push-token` `{ token }` lo quita.
- Los avisos salen por el servicio de Expo, en lotes de hasta 100, desde la tarea de cada minuto. Llevan texto genérico y solo `{ kind, ref }` como datos: nunca direcciones, montos ni texto del chat.
- Los dispara el indexador al ver el evento (acordada, entrega registrada, cancelación, pago liberado, jurado sorteado y recordatorios de plazo del jurado, que se cancelan si el jurado ya actuó o el caso se resolvió), el recordatorio de una hora antes del inicio de la changa, una nueva postulación, la revisión de la selfie y un mensaje de chat cuando la otra persona no tiene conexión abierta. Un aviso de chat por conversación hasta que se envíe; los siguientes mensajes no generan otro hasta entonces.
- Si una persona no tiene dispositivos, el aviso se descarta. Un token que Expo informa como `DeviceNotRegistered` se borra. Ante una falla del servicio se reintenta hasta 5 veces. Los enviados se borran a los 7 días.
- Los textos están en `TEMPLATES` de `src/notifications.ts`.

## Cadena

- `POST /relay`: pedido firmado para el Forwarder (ver `src/relay.ts`).
- `GET /health`, `GET /events` y `GET /orders/:id/timeline`: eventos indexados.

## Límites por IP

Relayer 10 por minuto, sesión 10, lecturas 120, archivos 300, escrituras 20 por cuenta. Cambian en `wrangler.jsonc`.
