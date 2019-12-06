/* global ExtensionAPI */
"use strict";

const PREF_FP_ENABLED = "privacy.trackingprotection.fingerprinting.enabled";
const PREF_CONTENT_BLOCKING_CATEGORY = "browser.contentblocking.category";

const { ExtensionCommon } = ChromeUtils.import(
  "resource://gre/modules/ExtensionCommon.jsm",
);
const { EventManager } = ExtensionCommon;
const { Services } = ChromeUtils.import(
  "resource://gre/modules/Services.jsm"
);

this.fpPrefs = class extends ExtensionAPI {

  getAPI(context) {
    
    return {
      fpPrefs: {
        
        isFpProtectionEnabled() {
          return Services.prefs.getBoolPref(PREF_FP_ENABLED);
        },

        isETPStandard() {
          return Services.prefs.getCharPref(PREF_CONTENT_BLOCKING_CATEGORY) === "standard";
        },

        setFpProtectionEnabledTrue() {
          console.log('Setting `privacy.trackingprotection.fingerprinting.enabled` to true');
          return Services.prefs.setBoolPref(PREF_FP_ENABLED, true);
        },

        setETPStandard() {
          console.log('Setting `browser.contentblocking.category` to standard');
          return Services.prefs.setCharPref(PREF_CONTENT_BLOCKING_CATEGORY, "standard");
        },

        isETPSettingsDefault() {
          // Return true if all ETP settings are default (except fingerprinting which we are flipping.)
          const cryptoIsDefault = !Services.prefs.prefHasUserValue("privacy.trackingprotection.cryptomining.enabled");
          const pbmodeIsDefault = !Services.prefs.prefHasUserValue("privacy.trackingprotection.pbmode.enabled");
          const tpIsDefault = !Services.prefs.prefHasUserValue("privacy.trackingprotection.enabled"); 
          const socialIsDefault = !Services.prefs.prefHasUserValue("privacy.trackingprotection.socialtracking.enabled");
          const cookieIsDefault = !Services.prefs.prefHasUserValue("network.cookie.cookieBehavior");
          return cryptoIsDefault && pbmodeIsDefault && tpIsDefault && socialIsDefault && cookieIsDefault; 
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
        }).api()

      }
      
    };
  }

};