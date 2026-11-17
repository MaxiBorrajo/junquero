import { encodeFunctionData, parseAbi, type Hex } from "viem";

const receiptAbi = parseAbi(["function claim(uint256 orderId)"]);

// Quien hizo el trabajo reclama su comprobante intransferible una vez cerrado y pagado.
export const encodeClaimReceipt = (orderId: bigint): Hex => encodeFunctionData({ abi: receiptAbi, functionName: "claim", args: [orderId] });
