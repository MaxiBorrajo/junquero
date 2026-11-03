# Estándares usados

Verificado contra el código fuente instalado: OpenZeppelin Contracts v5.7.0 (`lib/openzeppelin-contracts`) y Permit2 (`lib/permit2`).

| Necesidad | Pieza | Qué hace (leído del código) | Uso |
| --- | --- | --- | --- |
| Roles | `access/AccessControl` | Roles por `bytes32`, sin enumeración on-chain | ParameterRegistry, Treasury, Credentials, Reputation |
| Firmas tipadas | `utils/cryptography/EIP712` + `ECDSA` | Dominio con chainId y contrato, hash tipado | Acuerdos, liberación, aprobaciones grupales |
| Firmas de cuentas y contratos | `SignatureChecker.isValidSignatureNow` | ECDSA o ERC-1271 | Verificación de toda firma |
| Lote de firmas | `SignatureChecker.areValidSignaturesNow` (firmantes ERC-7913) | Valida N firmas sobre un hash, rechaza duplicados; firmantes ordenados por keccak abaratan la unicidad | Aprobación grupal (máx 20) |
| Permit | `token/ERC20/extensions/ERC20Permit` (IERC20Permit) | Aprobación por firma EIP-2612 con nonces | Depósito con USDC |
| Autorización de transferencia | `draft-ERC3009` | `transferWithAuthorization` / `receiveWithAuthorization`; USDC lo implementa | Alternativa a permit para USDC (evaluar) |
| Permit2 | `permit2/src/interfaces/ISignatureTransfer` | `permitTransferFrom` con firma, para cualquier ERC-20 tras una aprobación única | USDT, DAI, tokens sin permit; se usa la interfaz contra la dirección canónica desplegada, no se compila el código (pragma 0.8.17) |
| Transferencias | `token/ERC20/utils/SafeERC20` | Maneja tokens que no devuelven bool | Todo el dinero |
| Reentrancia | `utils/ReentrancyGuard` y `ReentrancyGuardTransient` | Mutex en storage o en transient storage (Cancun) | Escrow, Arbitration |
| Meta-transacciones | `metatx/ERC2771Forwarder` y `ERC2771Context` | El forwarder verifica EIP-712 con nonce y deadline, ejecuta `execute`/`executeBatch`; el contexto lee el firmante del sufijo del calldata | Relayer; el forwarder no cobra gas, el relayer lo paga |
| Votos | `governance/utils/Votes` | Checkpoints, delegación, `getPastVotes`; el hijo implementa `_getVotingUnits` | VotingWeight (peso por actividad, sin transferencia) |
| Gobernanza | `Governor`, `GovernorVotes`, `GovernorTimelockControl`, `TimelockController` | Propuesta, votación, cola y ejecución con espera | ProtocolGovernor |
| Soulbound | No existe ERC-5192 en OZ | Hay que escribirlo: ERC721 que bloquea en `_update` y emite `Locked` | Receipt |

Pendiente de leer al implementar cada pieza: firmas exactas de `Governor` (versión de `clock`), `AccessControlDefaultAdminRules` como opción para el traspaso del rol de administrador, y la dirección de Permit2 en Sepolia y Arbitrum.
