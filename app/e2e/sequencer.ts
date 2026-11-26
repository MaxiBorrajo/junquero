import { BaseSequencer, type TestSpecification } from "vitest/node";

// agreementExpiry avanza el reloj de la cadena hasta la hora real (el acuerdo vence en horas de reloj real) y deja la cadena adelantada: las
// firmas de las pruebas que corran después vencerían. Por eso va siempre al final.
export default class E2eSequencer extends BaseSequencer {
  async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const sorted = await super.sort(files);
    const last = (file: TestSpecification) => file.moduleId.includes("agreementExpiry");
    return [...sorted.filter((file) => !last(file)), ...sorted.filter(last)];
  }
}
