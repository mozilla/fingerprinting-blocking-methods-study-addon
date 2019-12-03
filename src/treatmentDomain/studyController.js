// Note this is different from the common studyController.js - we want to flip the pref.

let StudyController = {

  USER_HAS_FP_ON: "0: User has fingerprinting protections enabled.",
  USER_TURNED_FP_OFF: "2: User has turned fingerprinting protections off.",
  
  async getFPPref() {
    let fpPrefEnabled = await browser.fpPrefs.isFpProtectionEnabled();
    console.log(`Fingerprinting enabled pref is ${fpPrefEnabled}`);
    return fpPrefEnabled;
  },

  async studySetup() {
    console.log("First run setup for treatmentDomain.");
    
    const result = await browser.storage.local.get("firstRunComplete");
    if ( result.firstRunComplete === true ) {
      return true;
    }
    
    // User may only enroll if they are in "standard" ETP mode
    // Standard mode has FPPref off, but we double check that it's off.
    const fpPref = await this.getFPPref();
    const isStandard = await browser.fpPrefs.isETPStandard();
    
    if ( ( fpPref === true ) || ( isStandard !== true ) ) {
        browser.normandyAddonStudy.endStudy(this.USER_HAS_FP_ON);
        return false;
    }
    await browser.storage.local.set({ firstRunComplete: true });
    return true;
  },
  
  async init() {
    const continueInit = await this.studySetup();
    // console.log(`Continuing: ${continueInit}`);
    
    if ( continueInit === true ) {  
      // Turn on Fingerprinting protection
      browser.fpPrefs.setFpProtectionEnabledTrue();

      // Remove user from study if user change fpPref
      let onFPPrefChanged = () => {
        browser.normandyAddonStudy.endStudy(this.USER_TURNED_FP_OFF)
      }
      browser.fpPrefs.onFpPrefChanged.addListener(onFPPrefChanged);

      // On study termination turn FpProtection back to off - by setting ETP back to Standard
      // BUT, only do this if user has not altered other settings. If user has altered other settings then
      // assume that they are comfortable in Custom mode and leave them there. We do not want to risk downgrading
      // user initiated protections.
      browser.normandyAddonStudy.onUnenroll.addListener(async () => {
        // First remove the listener so we don't get two unenroll events
        browser.fpPrefs.onFpPrefChanged.removeListener(onFPPrefChanged);

        const isDefault = await browser.fpPrefs.isETPSettingsDefault();
        if ( isDefault === true ) {
          // Then reset the browser to Standard
          await browser.fpPrefs.setETPStandard();
        }
      });

    }
  }
};

StudyController.init();