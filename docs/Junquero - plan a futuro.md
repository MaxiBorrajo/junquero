# Junquero: plan a futuro

Ideas para después de la entrega. Nada de esto está construido ni validado todavía; son hipótesis a comprobar.

## 1. Facilitar la entrada: pasar pesos a la app

**Problema.** Para usar Junquero hoy hay que conseguir USDC, instalar MetaMask y firmar mensajes. Para una persona que busca un plomero es un salto muy grande, y es el freno de crecimiento más fuerte, más que cualquier función de la app. Contra WhatsApp más efectivo, Junquero gana en seguridad pero pierde en comodidad.

**Qué se quiere.** Que una persona pueda pasar pesos y tener un saldo utilizable sin entender de cadenas, y que crear la cuenta sea fácil sin quitarle el control de su plata.

### Camino A: pasar pesos desde una billetera o app local

- La persona carga pesos en una billetera o exchange local (Mercado Pago, Lemon, Belo, Buenbit u otros) y los convierte a una moneda estable (USDC o una moneda estable en pesos, si existe una confiable) que envía a su dirección de Junquero.
- Es el camino que ya describe el documento de confianza y economía para el MVP, pero hoy lo hace cada usuario a mano.
- Mejora a explorar: un asistente dentro de la app que guíe el paso a paso (qué app usar, a qué red enviar, a qué dirección), con alertas si elige una red equivocada.
- Para validar: qué redes y retiros soporta cada servicio, costos reales y tiempos.

### Camino B: crear la cuenta por la persona, con su control

- La app crea una billetera para quien se registra, sin que instale nada: ingreso con mail, teléfono, huella o llave de acceso (passkey).
- La clave queda bajo control del usuario (no la custodia Junquero): se reparte entre el dispositivo y un servicio de recuperación (por ejemplo, con tecnología de cómputo multipartito o llaves de acceso).
- Opciones a evaluar: proveedores de billeteras embebidas (Privy, Web3Auth, Dynamic, thirdweb y billeteras inteligentes como Coinbase Smart Wallet o Safe con llaves de acceso).
- El pago de las operaciones (gas) ya lo cubre un relayer, así que la persona no necesita ETH.
- Ventaja: el alta pasa de varios pasos técnicos a uno. Riesgo: depende de un proveedor y de sus costos.

### Camino C: comprar con pesos dentro de la app (rampa de entrada y salida)

- Integrar un proveedor que cobre en pesos (transferencia, Mercado Pago o tarjeta) y entregue la moneda estable en la billetera de la persona, y a la inversa para retirar.
- Opciones a evaluar: Transak, MoonPay, Ramp o proveedores locales que operen en Argentina.
- Es lo más cómodo para el usuario y lo más caro de integrar: comisiones, verificación de identidad y cumplimiento.

### Billetera integrada y billeteras externas, las dos opciones

Decisión: la billetera dentro de la app es la opción ideal para quien no tiene MetaMask, y las billeteras externas (MetaMask por WalletConnect) se mantienen para quien ya las usa. La persona elige al conectarse.

- **Por qué:** con la billetera integrada, firmar es un paso dentro de Junquero y no hay ida y vuelta a otra app. Hoy el regreso desde MetaMask no es confiable en Android: WalletConnect depende de que MetaMask honre el esquema de regreso (`junquero://`, ya registrado en la app y pasado a AppKit), y no siempre lo hace. La app ya intenta volver sola al terminar la firma (`withWallet`), pero Android puede bloquearlo.
- **Qué hay que resolver:** que la billetera integrada firme igual que hoy (firma de mensaje para derivar la clave del chat, datos tipados para pagos y acuerdos, permisos de token), que la misma cuenta se recupere al cambiar de celular, y que todo siga pasando por `signTyped` y `signText` de `wallet/sign.ts`, que es el único punto de firma.
- **Opciones de proveedor a evaluar:** Privy, Web3Auth, Dynamic, Coinbase Smart Wallet. Se compara costo, recuperación de la cuenta y si la clave del chat se puede derivar de forma estable.
- **Universal link:** el dominio `junquero.app` todavía no existe. Cuando exista, se puede sumar `universal` y `linkMode` a la redirección de AppKit para mejorar el regreso desde las billeteras externas.

### Qué tendría que cambiar en la app

- **Login:** hoy se entra con WalletConnect/MetaMask. Habría que agregar el ingreso con billetera embebida como alternativa, no como reemplazo.
- **Clave de chat:** hoy se calcula a partir de una firma fija de la billetera y debe dar siempre el mismo resultado. Hay billeteras (inteligentes, de llave de acceso o de cómputo repartido) cuyas firmas no son deterministas. Antes de elegir proveedor hay que comprobar que la firma que usamos para la clave de chat sea estable; si no, habría que guardar la clave de chat de otra forma (por ejemplo, derivada de un secreto propio de la billetera) y cambiar `keyManager`.
- **Firmas:** permisos de depósito, acuerdos y QR de liberación se firman con la billetera; el proveedor tiene que soportar firma de datos tipados (EIP-712).
- **Red y moneda:** pasar de Sepolia con moneda de prueba a una red real con una moneda estable real.

### Puntos legales y de riesgo (a revisar con alguien que sepa)

- Si Junquero llegara a custodiar fondos o convertir monedas, puede quedar alcanzada por la regulación argentina de proveedores de servicios de activos virtuales. Mantener la custodia en manos del usuario (billetera no custodial) y usar proveedores ya habilitados reduce ese riesgo.
- Verificación de identidad (KYC) que exijan los proveedores de rampa.
- Riesgo de dependencia: un proveedor que cambia precios o cierra deja a los usuarios sin acceso. Conviene que el usuario pueda exportar o recuperar su billetera.

### Orden sugerido

1. Asistente de carga de pesos dentro de la app (Camino A), que es barato y se puede hacer ya.
2. Pruebas de billeteras embebidas (Camino B) sobre una red de prueba, comprobando la firma de la clave de chat.
3. Rampa de entrada y salida (Camino C), cuando haya volumen que lo justifique y definido el marco legal.

## 2. Hacer visible el valor de la plataforma

- Tarjeta de "pago protegido" en el chat y en la postulación (ya incluida en el plan del chat).
- Reputación que pese: orden de las postulaciones y del mapa según trabajos cerrados y baja tasa de reclamos.
- Sello "protegido" y beneficios por cerrar dentro de la plataforma (más visibilidad, garantía de postulación más baja).
- "Volver a contratar" con un solo toque, con el pago protegido igual: es la forma de retener a quienes ya se conocen.
- Promocionar las changas grupales (vecinos que juntan para una obra) como puerta de entrada.
- Más adelante: un fondo o seguro que cubra un pago fallido hasta un monto.

## 3. Pendientes técnicos de la plataforma

- Módulos del contrato reemplazables en modo demo para no redesplegar todo en cada cambio (ver el chat del 15/11): despliegue sin bloquear los módulos y una función de administrador para cambiar un módulo manteniendo los datos.
- Pago en efectivo en la pantalla de publicar (el contrato ya lo tiene).
- Testigo para changas de más de 300 USDC y votación de parámetros en pantalla (ver `Junquero - pruebas de implementacion futura.md`, secciones 12 a 14).
- Mejor buscador de direcciones con número de puerta (cambiar de proveedor de mapas o sumar uno con datos de direcciones).
- Panel de admin: lista de jurados con su garantía libre, su credencial y sus casos activos (nota del 18/11/2026). El contrato no tiene contador ni lista de jurados: se arma con los eventos `Staked` que ya indexa el servidor y con `availableStake` de cada cuenta.
- Billeteras que no sean MetaMask: la conexión por WalletConnect ya funciona con cualquier billetera común (de clave propia, EOA). Pendiente: el enlace para abrir la billetera al firmar está fijo en `metamask://` (`app/src/wallet/sign.ts`); tendría que usar el de la billetera conectada. Las billeteras de contrato (Safe, billeteras inteligentes) no sirven hoy, porque el permiso del depósito y el reenviador de firmas verifican firmas de cuenta común. Probar con una segunda billetera antes de prometerlo.

## 4. Comentarios y calificación en los dos sentidos

> **Hecho el 26/11/2026 (en parte):** quien publica puede dejar un comentario público opcional al calificar. Va firmado dentro de la liberación (`commentHash`), el texto se guarda en el servidor y se muestra en el comprobante y en el perfil de quien trabajó. **Sigue pendiente** la nota de quien trabajó hacia quien publica, dentro de `Reputation`.

Hoy solo califica quien publicó (1 a 5, firmada al liberar el pago) y no hay texto. Idea: que la calificación lleve un comentario opcional, que los próximos solicitantes lo vean al elegir a un postulante, y que quien hizo el trabajo también pueda calificar y comentar a quien publicó. Se hace si se termina el resto.

**Versión recomendada: fuera de la cadena, sin tocar los contratos**
- Tabla nueva en el servidor (pedido, quién escribe, a quién, nota, comentario, fecha) y un endpoint para escribirla. Solo pueden escribir las dos partes de un pedido terminado, una vez por pedido y por sentido. Las partes salen de `order_parties`.
- App: campo de comentario opcional en el bloque de calificación; lista de reseñas en el perfil público y en la tarjeta de postulante; promedio y reseñas de quien publica, visibles para quien se postula.
- Moderación: botón de reportar y la guarda de datos de contacto (`contactGuard`) también en los comentarios.
- Requiere migración del servidor y `npm run deploy` del servidor. No requiere redesplegar contratos.

**Qué no conviene poner en la cadena**
- El texto de los comentarios: no se puede borrar ni corregir, es texto libre de personas, tiene costo de gas y el Escrow ya está al límite de tamaño. Si algún día hace falta que sea inalterable, guardar solo el hash en la cadena y el texto en el servidor.

**Qué sí aportaría ponerlo en la cadena (cambio de contrato futuro)**
- La nota que el prestador le pone a quien publicó, para que cuente en la reputación del solicitante (`Reputation`, hoy solo cuenta cierres y fallas) y pueda pesar en reglas, por ejemplo en la decisión del jurado.
- Costo: un paso y una firma más para quien ya cobró (poco incentivo para hacerlo), redespliegue y migración de pedidos en curso. Conviene decidirlo cuando haya uso real. Si las notas ya se guardan en el servidor con pedido y partes, migrarlas es copiar datos.

## 5. Comprobantes como imágenes

> **Hecho el 26/11/2026:** el comprobante se emite solo al cobrar con calificación y tiene `tokenURI`: el servidor devuelve el JSON y una imagen SVG propia, con el diseño tipográfico (número gigante de la nota, juncos del color del rubro y esquinas redondeadas). Lo que sigue más abajo es el planteo original, que se conserva.

Hoy cada comprobante intransferible (NFT) se ve en la app como una medalla simple: un círculo con el nombre del trabajo, el rubro y la fecha de cierre (pantalla "Comprobantes", a la que se llega desde una tarjeta del perfil). Para que sean algo más atractivo y más fáciles de mostrar:

- **Imagen propia de cada comprobante:** una ilustración por rubro (hogar, mudanzas, mascotas, etc.), con variantes por mes o por cantidad de trabajos cerrados, y quizá niveles (bronce, plata, oro) según la trayectoria de la persona.
- **Que se vea fuera de la app:** hoy el contrato `Receipt` no define `tokenURI`, así que una billetera o un mercado de NFT no muestra ninguna imagen. Hace falta agregar `tokenURI` (cambio de contrato) que apunte a metadatos con nombre, rubro, mes e imagen, alojados en el servidor o en un almacenamiento descentralizado. Los metadatos no deben llevar datos personales: solo rubro y mes, como hoy en la cadena.
- **Imagen generada:** puede armarse al vuelo en el servidor (SVG por rubro y mes) para no guardar un archivo por comprobante.
- **En la app:** la medalla pasa a mostrar esa imagen, con la opción de compartirla.
- Decidir si el título del trabajo aparece en la imagen: hoy se muestra en la app porque es el título público de la publicación, pero no está en la cadena.
- **Qué comprobante da una disputa (idea del 18/11/2026, sin decidir):** un trabajo que terminó en reclamo chico (50/50) no da comprobante; hoy lo oculta la app y falta cerrarlo en el contrato (ver "Junquero - cambios de contrato pendientes"). Evaluar un comprobante de "gané la disputa" solo para las que se resolvieron con jurado, es decir, de monto grande. Encaja con el cambio del rating como NFT intransferible.

## 6. Jurados: acuerdo entre jurados y sorteo sin elegir caso (nota del 18/11/2026)

> **Hecho el 26/11/2026:** el pozo del sorteo pasa entre rondas sin reanotarse (los que ya revelaron entran solos a la ronda siguiente, sin sumar a la semilla) y el secreto del sorteo se deriva de una firma de la billetera, así no se pierde al cambiar de teléfono. **Sigue pendiente** el grupo de jurados disponibles que describe esta sección.

**Hoy.** El jurado se anota a cada reclamo y el contrato sortea entre quienes se anotan y revelan su aporte (`commitSeed` y `revealSeed`). Antes de anotarse ve un resumen corto del caso: rubro, modalidad, monto en disputa y los criterios que las partes acordaron antes del trabajo. No ve el título, los relatos, las pruebas ni quiénes son las partes: eso solo lo ven los sorteados.

**Riesgo que quedó abierto.** Una parte puede avisarle a conocidos de un caso puntual para que se anoten y voten igual. Esto ya era posible antes del resumen, porque la lista de reclamos que buscan jurados la ve cualquier jurado habilitado. Lo que lo frena hoy es el costo de entrar (garantía, credencial de nivel mínimo, trabajos cerrados sin reclamos o jurado de arranque), que el sorteo es entre los anotados (hay que ser mayoría entre ellos), la pérdida de garantía por votar en minoría y la apelación con más jurados. Nada de eso alcanza con un grupo chico: con tres jurados de demo cualquier regla es frágil.

**Camino a evaluar: grupo de jurados disponibles.**
- Cada jurado se anota una sola vez como disponible, sin elegir caso, y el sorteo toma del grupo al azar. Nadie sabe de antemano a qué caso va a ir, así que no se puede reclutar para uno puntual.
- Cambia el contrato: hace falta una lista de jurados disponibles que se pueda recorrer y definir qué pasa con quien no responde (hoy quien no vota pierde toda la garantía del caso, lo cual es duro si no se enteró). Redespliegue.
- Idea para el no responder: ventana de aceptación corta con reemplazo automático, sin castigo si se rechaza a tiempo.
- Mientras tanto, conviene medir cuántos jurados reales hay: con menos de unas decenas de jurados el riesgo de acuerdo no se resuelve con ninguna regla.

**Descartado por ahora: sorteo automático entre todos los que dejaron garantía, sin anotarse.** El contrato no tiene lista de jurados y el castigo por no votar es total.

## 7. Acuerdo entre las partes durante un reclamo (nota del 19/11/2026)

**Idea.** Hoy un reclamo solo termina de tres maneras: el reparto 50/50 automático (changa chica), la falta de respuesta o el veredicto de un jurado. Falta una cuarta: que las dos partes se pongan de acuerdo por su cuenta, sin llegar al jurado, o en cualquier momento antes de que el jurado decida. Ejemplo: me hicieron una changa, digo que quedó mal y abro el reclamo; en vez de esperar el sorteo, quien trabajó y yo arreglamos.

**Formas de arreglo que tendría que permitir:**
- **Pagar menos a quien trabajó.** Quien pagó propone un porcentaje o un monto menor y quien trabajó acepta.
- **Pagar más a quien trabajó.** Si el que reclamó es quien trabajó (por ejemplo, el pago no se liberó), puede aceptar menos de lo que pidió o quien pagó puede sumar algo.
- **Una changa derivada para corregir la anterior**, sin costo o con poco costo: se publica y se acuerda una changa nueva ligada a la original, con su propio pago en garantía, y el reclamo se cierra cuando esa changa se completa.
- **Retiro de común acuerdo**: quien reclamó retira el reclamo y el pago sigue su curso normal.

**Cómo podría funcionar.**
- Una propuesta de acuerdo dentro de la pantalla del reclamo, con respuesta de la otra parte (aceptar, rechazar o contraproponer), por el mismo chat que ya existe y con un resumen claro de qué se paga a quién.
- El acuerdo se confirma con la firma de las dos partes. Al confirmarse se cancela el caso, se frena el sorteo si estaba en curso y se reparte el pago según lo acordado.
- Mientras se negocia, los plazos del reclamo siguen corriendo (para no usarlo como demora), o hay una pausa corta y única, a definir.
- Qué pasa con el costo del reclamo y con la garantía de los jurados anotados (se devuelven o no, y quién los pone) es una decisión de diseño pendiente.

**Cambios de contrato.** Hace falta una resolución por acuerdo en el Escrow (hoy `resolveDispute` solo la ejecuta el módulo de arbitraje) que acepte el reparto firmado por las dos partes, y para la changa derivada, un campo que ligue una orden a la que corrige. Eso implica redesplegar. La parte de propuestas, el chat y las pantallas se puede construir en la app y el servidor.

**Cosas a cuidar.**
- Presión sobre la otra parte ("firmá o te dejo sin pago"): el acuerdo siempre es opcional, con la opción de seguir al jurado a la vista, y nunca cierra el reclamo sin las dos firmas.
- Que no se use para demorar: plazo máximo para negociar.
- Reputación: un reclamo cerrado por acuerdo debería contarse distinto a uno perdido ante un jurado.
- Aplica a changas medianas y altas; en las chicas (50/50 automático) no tiene sentido salvo que se quiera permitir igual, a definir.

## 8. Casos que pasan al administrador sin plazo (nota del 19/11/2026)

**Hoy.** Cuando un reclamo con jurado no llega a un veredicto (empate, nadie muestra su voto o no hay jurados suficientes tras las rondas de sorteo), pasa a `NeedsEmergency` y solo lo resuelve el administrador con `resolveEmergency`. El contrato no guarda ninguna fecha límite ni resuelve nada solo: si el administrador no firma, el pago de las partes queda congelado indefinidamente y el costo del reclamo no se devuelve. Tampoco hay aviso: el administrador solo lo ve en el panel (sección Reclamos, con un número), y las partes ven "Lo resuelve el administrador".

**A evaluar (de menor a mayor esfuerzo):**
- **Avisar al administrador** (notificación o correo) cuando entra un caso, y un recordatorio cada cierto tiempo si sigue sin resolver. Solo servidor y panel.
- **Más información para las partes:** en la pantalla del reclamo, desde cuándo está en manos del administrador y qué pasa si tarda.
- **Plazo máximo con resolución automática**, por ejemplo 7 días: si el administrador no resuelve, el pago se reparte 50/50 o se devuelve a quien pagó, y se devuelve el costo a quien reclamó. Cambia el contrato (guardar la fecha en que entró a emergencia y una función que cualquiera pueda llamar al vencer) y exige redesplegar.

**Decisiones pendientes:** cuánto dura el plazo, qué reparto es el justo por defecto, y si el administrador puede prorrogarlo una vez con motivo. Para producción conviene además que el rol de emergencia lo tenga más de una persona, o un multisig, para que no dependa de una sola billetera.

