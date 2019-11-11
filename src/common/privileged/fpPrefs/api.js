/* global ExtensionAPI */
"use strict";

const PREF_FP_ENABLED = "privacy.trackingprotection.fingerprinting.enabled";

const { ExtensionCommon } = ChromeUtils.import(
  "resource://gre/modules/ExtensionCommon.jsm",
);
const { EventManager, EventEmitter } = ExtensionCommon;
const { Services } = ChromeUtils.import(
  "resource://gre/modules/Services.jsm"
);

this.fpPrefs = class extends ExtensionAPI {

  getAPI(context) {
    
    return {
      fpPrefs: {
        
        async isFpProtectionEnabled() {
          return Services.prefs.getBoolPref(PREF_FP_ENABLED);
        },

        onFpPrefChanged: new EventManager({
          context,
          name: "onFpPrefChanged",
          register: fire => {
            const listener = async () => {
              await fire.async();
            };
            Services.prefs.addObserver(PREF_FP_ENABLED, listener);
            return () => {
              Services.prefs.removeObserver(PREF_FP_ENABLED, listener);
            };
          },
        }).api(),
      }
    };
  }

};