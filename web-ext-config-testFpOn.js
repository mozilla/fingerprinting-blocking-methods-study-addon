/* eslint-env node */

const defaultConfig = {
  run: {
    firefox: process.env.FIREFOX_BINARY || "firefox",
    browserConsole: true,
    startUrl: ["about:debugging"],
    pref: [
        "extensions.legacy.enabled=true",
        "privacy.trackingprotection.fingerprinting.enabled=true"
    ],
  }
};

module.exports = defaultConfig;
