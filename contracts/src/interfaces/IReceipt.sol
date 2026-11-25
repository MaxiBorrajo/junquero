// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Lo que el Escrow le pide al comprobante: emitirlo solo, al cobrar con calificación. El resto (rubro, mes, partes, ficha y monto) lo lee de la orden.
interface IReceipt {
    function mintRated(uint256 orderId, uint8 rating, bytes32 commentHash) external;
}
