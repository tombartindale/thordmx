import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";

const config: ForgeConfig = {
  packagerConfig: {
    name: "ThorDMX Bridge Manager",
    executableName: "thordmx-bridge-manager",
    appBundleId: "com.bartindale.tom.thordmx.manager",
    icon: "./public/icons/icon",
    asar: true,
    ignore: [
      /^\/src/,
      /^\/electron/,
      /^\/node_modules\/.*\/(test|tests|__tests__|spec|docs|example|examples)\//,
      /\.map$/,
      /\.ts$/,
      /tsconfig\.json$/,
      /vite\.config\.ts$/,
      /forge\.config\.ts$/,
      /tailwind\.config\.js$/,
      /postcss\.config\.js$/,
      /\.gitignore$/,
      /README\.md$/,
    ],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: "dmx-bridge-manager",
      setupIcon: "./public/icons/icon.ico",
    }),
    // new MakerZIP({}, ["darwin", "linux"]),
    new MakerDMG({
      icon: "./public/icons/icon.icns",
      format: "ULFO",
    }),
    // new MakerRpm({
    //   options: {
    //     icon: "./public/icons/icon.png",
    //   },
    // }),
    // new MakerDeb({
    //   options: {
    //     icon: "./public/icons/icon.png",
    //     maintainer: "ThorDMX",
    //   },
    // }),
  ],
  plugins: [new AutoUnpackNativesPlugin({})],
};

export default config;
