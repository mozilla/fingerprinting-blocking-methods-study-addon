let StudyController = {

  USER_HAS_FP_ON: "0: User has fingerprinting protections enabled.",
  USER_TURNED_FP_ON: "1: User has turned fingerprinting protections on.",
  
  async init() {
    let fpPrefEnabled = await browser.fpPrefs.isFpProtectionEnabled();
    console.log(`Fingerprinting enabled pref is ${fpPrefEnabled}`);

    if ( fpPrefEnabled ) {
      // Immediatly remove from study group.
      browser.normandyAddonStudy.endStudy(this.USER_HAS_FP_ON)
    
    } else {
      // Remove from study if user change fpPref
      browser.fpPrefs.onFpPrefChanged.addListener(() => {
        browser.normandyAddonStudy.endStudy(this.USER_TURNED_FP_ON)
      })
    }
  },

}

StudyController.init()