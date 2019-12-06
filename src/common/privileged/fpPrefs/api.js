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
        
        async isFpProtectionEnabled() {
          return Services.prefs.getBoolPref(PREF_FP_ENABLED);
        },

        async isETPStandard() {
          return Services.prefs.getCharPref(PREF_CONTENT_BLOCKING_CATEGORY) == "standard";
        },

        async setFpProtectionEnabledTrue() {
          console.log('Setting `privacy.trackingprotection.fingerprinting.enabled` to true');
          return Services.prefs.setBoolPref(PREF_FP_ENABLED, true);
        },

        async setETPStandard() {
          console.log('Setting `browser.contentblocking.category` to standard');
          return Services.prefs.setCharPref(PREF_CONTENT_BLOCKING_CATEGORY, "standard");
        },

        async isETPSettingsDefault() {
          // Return true if all ETP settings are default (except fingerprinting which we are flipping.)
          
          const crypto = await Services.prefs.getBoolPref("privacy.trackingprotection.cryptomining.enabled");
          const cryptoIsDefault = crypto === true;
          
          const pbmode = await Services.prefs.getBoolPref("privacy.trackingprotection.pbmode.enabled");
          const pbmodeIsDefault = pbmode === true;
          
          const tp = await Services.prefs.getBoolPref("privacy.trackingprotection.enabled"); 
          const tpIsDefault = tp === false;
          
          const social = Services.prefs.getBoolPref("privacy.trackingprotection.socialtracking.enabled");
          const socialIsDefault = social === false;
          
          const cookie = Services.prefs.getIntPref("network.cookie.cookieBehavior");
          const cookieIsDefault = cookie === 4;
          
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