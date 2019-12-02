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
    const result = await browser.storage.local.get("firstRunComplete");
    if ( result.firstRunComplete === true ) {
      return true;
    }
    console.log("First run setup for treatmentDomain.");
    const fpPref = await this.getFPPref()
    if ( fpPref === true ) {
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
      // Turn on domain protection
      browser.fpPrefs.setFpProtectionEnabledTrue();

      // Remove user from study if user change fpPref
      let onFPPrefChanged = () => {
        browser.normandyAddonStudy.endStudy(this.USER_TURNED_FP_OFF)
      }
      browser.fpPrefs.onFpPrefChanged.addListener(onFPPrefChanged);

      // On study termination turn FpProtection back to off 
      // Note that code would not get this far if user had already set to True.
      browser.normandyAddonStudy.onUnenroll.addListener(async () => {
        // First remove the listener so we don't get two unenroll events
        browser.fpPrefs.onFpPrefChanged.removeListener(onFPPrefChanged);
        // Then reset the browser pref
        await browser.fpPrefs.setFpProtectionEnabledFalse();
      });

    }
  }
};

StudyController.init();