# Pruebas de punta a punta

Recorren el flujo real contra una cadena local (anvil) con los contratos desplegados y el servidor corriendo en local,
usando el mismo código de la app (firmas, permisos, relayer, cifrado de evidencia, acuerdo con dos firmas).

Cubren: changa individual con aprobación a distancia, changa con hitos (aprobación remota y QR), changa grupal
(aportes, retiro, veto, acuerdo con coordinador) y reclamo con jurado (relato cifrado, garantía, semilla, sorteo,
pruebas solo para el jurado, voto en dos pasos, veredicto y recompensas).

1. `bash e2e/up.sh` arma el entorno en `/tmp/junquero-e2e` (no toca el repo ni producción).
2. `cd /tmp/junquero-e2e/repo/app && npx vitest run --config vitest.e2e.config.ts`.

Los límites de pedidos del servidor local se suben solo en la copia de prueba. Las claves son las públicas de anvil.
