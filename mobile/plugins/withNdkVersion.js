const { withDangerousMod } = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

// RN 0.81 defaults to NDK 27, which on Windows fails to link libc++_shared.so
// for native modules that rely on implicit STL linking (worklets,
// expo-modules-core, react-native-screens). NDK 26.x links it implicitly
// and works on Windows. RN 0.81 supports NDK 26+.
const NDK_VERSION = "26.1.10909125";

function withNdkVersion(config) {
  return withDangerousMod(config, [
    "android",
    async (modConfig) => {
      const buildGradlePath = path.join(
        modConfig.modRequest.platformProjectRoot,
        "build.gradle",
      );
      let contents = fs.readFileSync(buildGradlePath, "utf8");

      // Inject ext.ndkVersion at the top so app/build.gradle's
      // `rootProject.ext.ndkVersion` reference resolves to NDK 26.
      const extBlock = `ext {\n  ndkVersion = "${NDK_VERSION}"\n}\n\n`;

      if (contents.includes("ndkVersion = ")) {
        // Already injected — replace existing value (idempotent)
        contents = contents.replace(
          /ndkVersion\s*=\s*"[^"]+"/,
          `ndkVersion = "${NDK_VERSION}"`,
        );
      } else {
        // Insert before the first `buildscript {` block
        contents = contents.replace(
          /(buildscript\s*\{)/,
          `${extBlock}$1`,
        );
      }

      fs.writeFileSync(buildGradlePath, contents);
      return modConfig;
    },
  ]);
}

module.exports = withNdkVersion;
