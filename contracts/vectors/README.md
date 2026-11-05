# Vectores de firma

`signatures.json` lo genera `forge test --match-contract VectorsTest` (archivo `test/Vectors.t.sol`). Cada mensaje fue aceptado por los contratos en esa misma prueba, así que sirve para comprobar que la app firma exactamente lo mismo.

Contenido:

- `contracts`: direcciones usadas en la prueba, que forman parte de los dominios EIP-712.
- `accounts`: claves de prueba determinísticas. No usar fuera de pruebas locales.
- `types`: los tipos EIP-712 de cada mensaje, en el formato de viem.
- `vectors`: para cada mensaje, `primaryType`, `domain` (`escrow`, `forwarder` o `usdc`), `message`, `structHash`, `digest` y las firmas.

Dominios:

| Clave | name | version | verifyingContract |
| --- | --- | --- | --- |
| `escrow` | `Escrow` | `1` | `contracts.escrow` |
| `forwarder` | `Forwarder` | `1` | `contracts.forwarder` |
| `usdc` | `USDC` | `1` en la prueba (el USDC real usa `2`) | `contracts.usdc` |

Todos los números del `message` están como texto decimal; convertirlos a `bigint` antes de firmar. Con viem, `signTypedData` con la clave de `accounts` debe producir la misma firma, porque las dos usan ECDSA determinístico. La prueba de la app tiene que comparar `hashTypedData(...)` con `digest` y la firma con `signatures`.
