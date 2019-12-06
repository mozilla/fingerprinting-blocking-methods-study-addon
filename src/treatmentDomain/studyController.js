// Note this is different from the common studyController.js - we want to flip the pref.

let StudyController = {

  UNENROLLED: "FPBlock Unenroll",

  async studySetup() {
    console.log("First run setup for treatmentDomain.");
    
    const result = await browser.storage.local.get("firstRunComplete");
    if ( result.firstRunComplete === true ) {
      return true;
    }
    
    // User may only enroll if they are in "standard" ETP mode
    // Standard mode has FPPref off, but we double check that it's off.
    const fpPref = await browser.fpPrefs.isFpProtectionEnabled();
    const isStandard = await browser.fpPrefs.isETPStandard();
    console.log(`Fingerprinting enabled pref is ${fpPref}`);
    
    if ( ( fpPref === true ) || ( isStandard !== true ) ) {
        browser.normandyAddonStudy.endStudy(this.UNENROLLED);
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
      let onFPPrefChanged = async () => {
        await browser.storage.local.set({ userChangedFPPref: true });
        browser.normandyAddonStudy.endStudy(this.UNENROLLED)
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
        const result = await browser.storage.local.get("userChangedFPPref");
        if ( ( isDefault === true ) && ( result.userChangedFPPref !== true )) {
          // Then reset the browser to Standard
          browser.fpPrefs.setETPStandard();
        }
      });

    }
  }
};

StudyController.init();