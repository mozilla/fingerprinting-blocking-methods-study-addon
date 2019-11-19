/* eslint-env node */

const defaultConfig = {
  run: {
    firefox: process.env.FIREFOX_BINARY || "firefox",
    browserConsole: true,
    startUrl: [
      "about:debugging", 
      "about:preferences#privacy"
    ],
    pref: ["extensions.legacy.enabled=true"],
  }
};

module.exports = defaultConfig;
