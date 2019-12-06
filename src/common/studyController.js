let StudyController = {

  UNENROLLED: "FPBlock Unenroll",
  
  init() {
    let fpPrefEnabled = browser.fpPrefs.isFpProtectionEnabled();
    console.log(`Fingerprinting enabled pref is ${fpPrefEnabled}`);

    if ( fpPrefEnabled ) {
      // Immediatly remove from study group.
      browser.normandyAddonStudy.endStudy(this.UNENROLLED)
    
    } else {
      // Remove from study if user change fpPref
      browser.fpPrefs.onFpPrefChanged.addListener(() => {
        browser.normandyAddonStudy.endStudy(this.UNENROLLED)
      })
    }
  },

}

StudyController.init()