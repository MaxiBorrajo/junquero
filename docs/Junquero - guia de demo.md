# Junquero: guía de ensayo de la demo

Demo del martes 1/12/2026. Máximo 20 minutos. Una sola persona maneja Ana y Beto.

## 1. Quién usa qué

| Rol | Dispositivo | Proyectado |
| --- | --- | --- |
| Ana (publica y paga) | Emulador 1 (`junquero-play`) | Sí |
| Beto (trabaja) | Emulador 2 (`junquero-play2`) | Sí |
| Jurado 1 | Tu celular | No |
| Jurado 2 | Celular del profe | No |
| Jurado 3 | Celular de un compañero | No |
| Admin | Navegador de la notebook | Sí |

Son exactamente 3 jurados: así los 3 quedan sorteados seguro, pero no hay reemplazo.

## 2. Los trabajos

| Nombre | Qué es | En qué estado tiene que estar al empezar | Para qué |
| --- | --- | --- | --- |
| A | Presencial, se publica en vivo | No existe todavía | Publicar, postularse, chat, acuerdo, costo de cancelar |
| B | Presencial, 15 USDC | Acordado y con la hora de inicio ya pasada, sin "Llegué" | Llegada, evidencia, QR, calificación, comprobante |
| C | 50 USDC | Entregado y sin aprobar | Reclamo con jurado |
| D | Por hitos | Acordado | Mostrar el tablero de hitos |

Por qué A y B: en un trabajo presencial "Llegué" solo funciona después de la hora acordada, y al publicar se exige al menos 1 hora de anticipación. En vivo se dice: "este es otro trabajo, que ya llegó a su horario".

- **C vence solo:** si pasan 24 horas desde la entrega, el pago se libera. Entregalo el mismo día.
- **C tiene que ser de más de 20 USDC:** con 20 o menos no hay jurado.
- **B conviene hacerlo de 15 USDC** para que se distinga de C en la lista.
- Prepará **una copia de B y de C** por si algo falla.

## 3. Preparación

### 3.1 Primero: probar que la notebook aguanta

Hacelo antes que todo lo demás. Cerrá lo que no uses (incluido el editor).

```bash
emulator -avd junquero-play  -gpu host -port 5554
emulator -avd junquero-play2 -gpu host -port 5556
adb devices
free -h
```

- [ ] Los dos emuladores andan y responden sin trabarse durante 10 minutos.
- [ ] El segundo tiene MetaMask instalada (o se puede instalar). Su configuración figura sin Play Store.

Si no pasa, usá el plan de un solo celular para Beto y sumá otro compañero como jurado.

### 3.2 Claves (pendiente de resolver)

En esta computadora no está `~/.foundry/keystores`. Sin las claves no se puede:

- [ ] Importar Ana, Beto y los jurados en MetaMask.
- [ ] Entrar al panel como admin.
- [ ] Bajar los plazos del reclamo a 3 minutos.

Las claves no se pasan por chat ni se suben al repositorio.

### 3.3 APK nuevo

El APK que hay es del 10/11 y es anterior al despliegue actual. Un solo APK sirve para emuladores y celulares.

```bash
cd app
npx expo prebuild --platform android
# volver a poner en android/gradle.properties la línea org.gradle.jvmargs del README
cd android
./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64 \
  -x lintVitalRelease -x lintVitalAnalyzeRelease -x lintVitalReportRelease --max-workers=2
adb -s emulator-5554 install -r app/build/outputs/apk/release/app-release.apk
adb -s emulator-5556 install -r app/build/outputs/apk/release/app-release.apk
```

Con el APK release no hace falta tener Metro corriendo.

### 3.4 Plazos a 3 minutos (necesita la cuenta admin)

Desde `contracts/`, con Foundry en el `PATH`. No cambia código.

```bash
PARAM=DISPUTE_RESPONSE_WINDOW,JUROR_INVITE_WINDOW,SEED_REVEAL_WINDOW,VOTE_COMMIT_WINDOW,VOTE_REVEAL_WINDOW,APPEAL_WINDOW \
VALUE=180 forge script script/SetParameter.s.sol:SetParameter \
  --rpc-url sepolia --account admin --sender 0x4E5e9eE0aAAbDA5B4e6118EE20e1bBe68b136511 --broadcast
```

### 3.5 Cuentas y datos

- [ ] Ana y Beto con perfil y selfie aprobada desde el panel.
- [ ] Chat activado en Ana, Beto y los 3 jurados.
- [ ] Los 3 jurados con 10 USDC de garantía depositada (hoy tienen 0): Perfil, Ser jurado, Depositar garantía.
- [ ] Ana con USDC de prueba (hoy sobra).
- [ ] La cuenta del relayer con ETH de Sepolia.
- [ ] 5 o 6 trabajos publicados cerca de la UNQ, para que el mapa tenga pines.
- [ ] Notificaciones activadas en los 3 celulares: Perfil, Ajustes.
- [ ] Una foto en la galería del emulador 2, para la evidencia: `adb -s emulator-5556 push foto.jpg /sdcard/Pictures/`
- [ ] Ubicación del emulador 2 en la UNQ: `adb -s emulator-5556 emu geo fix -58.2783 -34.7063`

### 3.6 Pantalla

- [ ] Solo si además querés proyectar tu celular: `sudo apt install scrcpy`. Para los emuladores no hace falta.
- [ ] Ventanas acomodadas: Ana a la izquierda, Beto a la derecha. El panel en otra pestaña, con la sesión ya iniciada.
- [ ] Notificaciones de la notebook apagadas.

## 4. Guion

Los minutos son orientativos. Para los jurados manda la notificación y el plazo que muestra la app.

### Minuto 0 a 1: presentación

Decir: el problema (quien contrata y quien trabaja desconfían), la solución (el pago queda en garantía) y los roles (quién publica, quién trabaja, jurados y admin).

### Minuto 1 a 2: abrir el reclamo (trabajo C)

1. Ana: abrir C, "Tengo un problema", contar qué pasó, sumar una foto, "Abrir reclamo".
2. Beto: abrir C, escribir su versión y responder.
3. Avisar a los jurados: "ya pueden anotarse".

Decir: "El pago quedó congelado. Mientras el jurado se arma, les muestro cómo es cuando todo sale bien".

### Minuto 2 a 6: publicar y acordar (trabajo A)

1. Ana: mostrar el mapa y publicar A.
2. Beto: encontrarlo en el mapa, "Postularme".
3. Mensajes: un mensaje de cada lado.
4. Ana: mandar la propuesta de acuerdo.
5. Beto: "Aceptar".

Decir: el pago entra en garantía al publicar; el chat va cifrado; el acuerdo lleva las dos firmas.

Mientras se confirma cada paso (hay segundos de espera), explicá lo que está pasando en vez de mirar la pantalla en silencio.

### Minuto 6 a 10: hacer y cobrar (trabajo B)

1. Beto: abrir B, "Llegué".
2. Beto: subir la prueba, "Subir 1 archivo y firmar", "Terminé".
3. Ana: abrir B, revisar la prueba, poner estrellas y comentario.
4. Ana: "Mostrar código".
5. Beto: "Escanear código", "Escribir código", tipear el código de 8 caracteres, "Cobrar".
6. Beto: mostrar el comprobante (NFT) y su perfil.

Decir: el comprobante se emite solo al cobrar con calificación y no se puede transferir. El indexador puede tardar cerca de un minuto en mostrarlo en el perfil: si no aparece, seguí y volvé.

**Cerca del minuto 9**, cuando llegue "Ya hay jurados": abrir el reclamo de C en Ana y en Beto y dejarlo unos segundos. Así la app les comparte las pruebas cifradas a los jurados. Sin este paso, no las ven.

### Minuto 10 a 13: el reclamo

1. Mostrar en Ana el avance: sorteo, cuántos se anotaron y cuántos revelaron.
2. Explicar: los jurados no saben quiénes son las partes; ven Parte A y Parte B.
3. Explicar el voto secreto: primero se guarda y después se muestra, así nadie copia.
4. Cuando los 3 mostraron el voto, abrir el veredicto.

### Minuto 13 a 17: el resto

1. Trabajo D: tablero de hitos.
2. Trabajo A: "Cancelar trabajo", mostrar cuánto cuesta y volver **sin confirmar**.
3. Panel: resumen, trabajos, reportes, selfies.

### Minuto 17 a 19: cierre

1. Trabajo C: mostrar el pago ya liberado según el veredicto.
2. Qué quedó afuera y por qué (sección 6).

## 5. Papel para los jurados

Imprimir uno por persona.

> **Sos jurado. Son cuatro toques. Cada uno tiene 3 minutos: hacelo apenas te llegue el aviso.**
>
> 1. **Anotarte:** Reclamos, abrir el reclamo, "Anotarme".
> 2. **Revelar:** cuando llegue "Revelá tu número del sorteo", Reclamos, "Revelar".
> 3. **Votar:** cuando llegue "Te sortearon", Mis casos, mirar las pruebas, elegir Parte A o Parte B, "Guardar mi voto en secreto" y firmar.
> 4. **Mostrar el voto:** cuando termine el plazo de votar, "Mostrar mi voto".
>
> No es plata real. Si algo no responde, levantá la mano.

## 6. Si preguntan

| Pregunta | Respuesta |
| --- | --- |
| ¿Se puede votar parámetros? | Los contratos de gobernanza están; no hay pantalla, y en este despliegue el control no está traspasado |
| ¿Pago en efectivo y trabajo grupal? | Quedaron fuera de lo que se muestra |
| ¿Cambio o mezcla de tokens, pruebas de conocimiento cero? | No están implementados |
| ¿Qué pasa si quien publicó no responde? | El pago se libera solo a las 24 horas |
| ¿Y si no aparecen jurados? | Hay más rondas y, al final, lo resuelve el administrador |
| ¿Quién paga el gas? | Un relayer de la plataforma |
| ¿Se puede apelar? | Sí, una vez, con un jurado más grande. No se muestra porque necesita 7 jurados más |

## 7. Plan B

| Qué pasa | Qué hacés |
| --- | --- |
| Una confirmación tarda | Seguir explicando; si pasa de un minuto, usar la copia ya preparada |
| La billetera se desconecta | "Reconectar billetera" |
| Falla el código de cobro | Ana usa "Aprobar a distancia" y Beto "Cobrar ahora" |
| Un jurado pierde un plazo | Seguir y mostrar el video del ensayo |
| No hay internet | Mostrar el video completo |

- [ ] Video grabado de un ensayo completo, guardado en la notebook y en el celular.

## 8. Calendario

| Día | Qué |
| --- | --- |
| Viernes 27 | Emuladores (3.1), claves (3.2), APK (3.3) |
| Sábado 28 | Cuentas y datos (3.5), plazos (3.4), probar un reclamo entero |
| Domingo 29 | Ensayo completo con cronómetro, solo |
| Lunes 30 | Ensayo con los jurados y grabación. Preparar B (dejarlo acordado) y D |
| Martes 1 | Preparar C y su copia (entregados), cargar baterías, abrir todo |

### Registro de ensayos

| Ensayo | Duración total | Qué falló | Qué cambio |
| --- | --- | --- | --- |
| 1 | | | |
| 2 | | | |
