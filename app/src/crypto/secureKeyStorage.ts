import * as SecureStore from "expo-secure-store";
import type { KeyStorage } from "./keyManager";

const secretKey = (address: string) => `junquero.chatkey.${address}`;
const registeredKey = (address: string) => `junquero.chatkey.registered.${address}`;

export const secureKeyStorage: KeyStorage = {
  getSecret: (address) => SecureStore.getItemAsync(secretKey(address)),
  setSecret: (address, secretHex) => SecureStore.setItemAsync(secretKey(address), secretHex),
  async isRegistered(address, publicKey) {
    return (await SecureStore.getItemAsync(registeredKey(address))) === publicKey;
  },
  markRegistered: (address, publicKey) => SecureStore.setItemAsync(registeredKey(address), publicKey),
};
