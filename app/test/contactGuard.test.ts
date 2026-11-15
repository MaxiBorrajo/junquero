import { describe, expect, it } from "vitest";
import { detectContact } from "../src/lib/contactGuard";

describe("detectContact", () => {
  it.each([
    ["Llamame al 11 5555 1234", "phone"],
    ["mi cel es +54 9 11 5555-1234", "phone"],
    ["1155551234", "phone"],
    ["(011) 4567-8901", "phone"],
    ["escribime a juan.perez@gmail.com", "email"],
    ["mirá https://wa.me/5491155551234", "link"],
    ["pasame el wsp: wa.me/549115555", "link"],
    ["www.miweb.com.ar tiene fotos", "link"],
    ["seguime en @juanperez", "link"],
    ["entrá a instagram.com/juan", "link"],
  ])("blocks %s", (text, kind) => {
    expect(detectContact(text)).toBe(kind);
  });

  it.each([
    "Hola, ¿cuándo podés pasar?",
    "Son 150000 pesos por el trabajo",
    "Te pago 1.500.000 si lo terminás hoy",
    "Puedo ir el 15/11 a las 10:30",
    "Tengo 3 años de experiencia y 2 ayudantes",
    "El presupuesto es de 25,50 USDC",
    "Vivo en Neuquén 1021",
  ])("allows %s", (text) => {
    expect(detectContact(text)).toBeNull();
  });
});
