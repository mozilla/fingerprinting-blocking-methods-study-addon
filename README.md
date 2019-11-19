**fingerprinting-blocking-methods-study-addon**

Study Addon for experiment to test methods of fingerprinting blocking

## Testing

### Control

* Basic control - study activates - nothing happens
* User should not be allowed to enroll if they have flipped fp pref. Test with: `npx web-ext run -s dist/extension-control-0.1.0 -c web-ext-config-testFpOn.js`
* User should be unenrolled if they flip fp pref. Start with `npx web-ext run -s dist/extension-control-0.1.0` user is enrolled in study. Manually flip pref either in preferences (Privacy and Security) or about:config. User should be unenrolled from study.

### Treatment - Script

* User should not already be enrolled in v2 fp study (is that something I need to write code for)?
* User should not be allowed to enroll if they have flipped fp pref. Test with: `npx web-ext run -s dist/extension-treatment_function-0.1.0 -c web-ext-config-testFpOn.js` - I'm not sure about this - but this is safer option.
* User should be unenrolled if they flip fp pref. Start with `npx web-ext run -s dist/extension-treatment_function-0.1.0` user is enrolled in study. Manually flip pref either in preferences (Privacy and Security) or about:config. User should be unenrolled from study. Should be unenrolled, as this will lead to domain level FP blocking kicking in and will pollute results.
* Test updateAfter set short, and make sure everything still runs. User's could change clock and we want things to continue running. This will require installing, then keepign profile for at least the time chanage.
* Test that after removing the study addon all cache, storage, etc is cleaned up.

## Questions

* Do we want to do anything with regards to skiplist pref?
* Do we need to show an indication in privacy panel that they're being protected through this alternate mechanism? For now am planning console logging so devs can see what's happening.
* hidden property in manifest (from federated learning)
* Do we want to do domain blocking via requestBlocking or pref flip?
* Do we want to update / have ability to update list?
* Blocking reporting? (currently *browser* console logging - no user opt-out)
* Behind-the-scenes requests

## Development

```bash
yarn install
yarn build
```

Install and run one of the built variants:

```bash
npx web-ext run -s dist/extension-control-0.1.0
npx web-ext run -s dist/extension-treatment_function-0.1.0
```

For the add-on to work, it must be used in a version of Firefox with the
Normandy Studies web-extension APIs available. These should be available in
Firefox 69 or above, starting with Nightly 2019-06-28. Additionally, it must
be run on a pre-release build, such as Nightly, Dev-Edition, or an unbranded
build, and the preference `extensions.legacy.enabled` must be set to true.

This add-on assumes it was installed by Normandy as a part of a study. To test this add-on without
involving a Normandy server, run the code below in the Browser Console. This step can be done before
or after the add-on is installed.

As far as I can tell, only addonId needs to match.

```js
const { AddonStudies } = ChromeUtils.import(
  "resource://normandy/lib/AddonStudies.jsm",
);
await AddonStudies.add({
  recipeId: 1,
  slug: "FPBlock",
  userFacingName: "FPBlock",
  userFacingDescription: "Study Addon for FPBlock experiment",
  branch: "control",
  active: true,
  addonId: "fpblock-control@mozilla.org",
  addonVersion: "0.1.0",
  extensionApiId: 1,
  extensionHash: "badhash",
  hashAlgorithm: "sha256",
  studyStartDate: new Date(),
  studyEndDate: null,
});
```

Note that if the add-on is not present when the browser starts up, the study will automatically end.
