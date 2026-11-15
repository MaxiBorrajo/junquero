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
- Testigo para changas de más de 300 USDC y votación de parámetros en pantalla (ver el plan de pruebas, secciones 12 a 14).
- Mejor buscador de direcciones con número de puerta (cambiar de proveedor de mapas o sumar uno con datos de direcciones).
