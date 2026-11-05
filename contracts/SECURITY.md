# Seguridad: análisis y limitaciones conocidas

Revisión del 5 de noviembre de 2026 con Slither (entorno aislado, sin librerías ni pruebas), cobertura de `forge coverage` y pruebas de invariantes. No es una auditoría externa: antes de usar dinero real hay que contratarla.

## Cómo repetir el análisis

```
python3 -m venv venv && venv/bin/pip install slither-analyzer
PATH=$PATH:$HOME/.foundry/bin venv/bin/slither . --filter-paths "lib/|test/|script/"
forge coverage --report summary --no-match-coverage "(test|script|lib)"
```

## Resultado de Slither (181 hallazgos, ninguno pendiente)

| Hallazgo | Cantidad | Veredicto |
| --- | --- | --- |
| `uninitialized-state` (alto) | 13 | Falso positivo. El Escrow reparte su lógica en módulos que comparten la misma caja de datos por `delegatecall`; cada módulo lee datos que escribe otro, y Slither no lo ve |
| `constable-states` | 3 | Falso positivo por la misma razón; volver esas variables constantes rompería el Escrow |
| `arbitrary-send-erc20-permit` (alto) | 2 | Falso positivo. `_collect` siempre recibe como origen al firmante real (`_msgSender()`, que con el relayer es el que firmó), nunca una dirección arbitraria |
| `reentrancy-balance` (alto) | 2 | No aplica. Toda función que llama a `_collect` es `nonReentrant` |
| `weak-prng` (alto) | 1 | Limitación aceptada, ver más abajo |
| `reentrancy-no-eth` (medio) | 13 | No aplica. Los pagos usan una llamada a la moneda de la lista blanca y anotan la deuda si falla; todas las funciones que pagan son `nonReentrant` |
| `divide-before-multiply` (medio) | 5 | Cuatro son el algoritmo estándar de fechas del comprobante. El quinto, la compensación de reserva, se reordenó para no perder precisión |
| `incorrect-equality`, `uninitialized-local` | 6 | Comparaciones y variables en cero a propósito |
| Resto (bajo e informativo) | el resto | Sellos de tiempo esperables, funciones de contexto heredadas y llamadas en bucle acotadas (máximo 30 aportantes y 15 jurados), donde un pago que falla pasa a ser deuda reclamable y no traba el cierre |

Cambios hechos por la revisión:

- La compensación de reserva multiplica antes de dividir.
- En la changa por hitos, el plan se guarda antes de mover dinero, no después.

## Limitaciones conocidas

1. **Azar del jurado.** El sorteo combina los secretos revelados por los candidatos y el hash del bloque anterior. Un candidato que revela último puede decidir no revelar para cambiar el resultado, a costa de no ser elegible. Se reduce con muchos candidatos y no se elimina. Un oráculo de azar (VRF) lo resolvería y queda para producción.
2. **Costo del arbitraje.** Lo adelanta quien reclama. Si gana y la parte perdedora no tiene dinero en el Escrow, termina pagando el costo.
3. **Anticipo.** Es el primer hito. No hay recuperación on-chain si el prestador cobra y no entrega.
4. **Administrador.** Mientras no se traspase el control, un solo administrador configura monedas, parámetros y conexiones. El traspaso al Timelock es un paso aparte (`GOVERNANCE`).
5. **Tesoro y testigo.** El Escrow puede retirar del tesoro solo por el camino de la tarifa del testigo. Si el tesoro está vacío, la tarifa queda como deuda.
6. **Monedas.** Solo las de la lista blanca. Las que cobran comisión por transferencia se rechazan. Una cuenta bloqueada por la moneda no traba un cierre: su parte queda como deuda reclamable.
7. **Módulos.** Los módulos del Escrow se registran una vez y luego se bloquean; para cambiar la lógica hay que desplegar un Escrow nuevo.
8. **Apelación.** No está implementada.
9. **Valores iniciales.** Los parámetros no vienen de datos reales. Se calibran por votación dentro de los límites que fija el contrato.
