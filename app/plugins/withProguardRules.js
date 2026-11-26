// Reglas extra para el minimizador (R8) del APK de release. La carpeta android/ se regenera con `expo prebuild`, así que se agregan desde acá.
const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

const RULES = [
  "# La librería de la billetera (JNA) menciona clases de escritorio que no existen en Android.",
  "-dontwarn java.awt.**",
];

module.exports = function withProguardRules(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const file = path.join(cfg.modRequest.platformProjectRoot, "app", "proguard-rules.pro");
      const current = fs.readFileSync(file, "utf8");
      if (!current.includes("java.awt")) fs.writeFileSync(file, `${current.replace(/\n*$/, "\n")}\n${RULES.join("\n")}\n`);
      return cfg;
    },
  ]);
};
