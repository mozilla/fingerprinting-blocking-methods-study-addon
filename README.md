**fingerprinting-blocking-methods-study-addon**

Study Addon for experiment to test methods of fingerprinting blocking.  For more information on the study see [bugzilla](https://bugzilla.mozilla.org/show_bug.cgi?id=1595604).

The study has three branches:
* control - maintaining current default fingerprinting protections
* treatmentDomain - flips fingerprinting pref to default on ETP domain-based fingerprinting protection
* treatmentScript - blocks specific fingerprinting scripts detected on the ETP fingerprinting domains. This branch uses code from the excellent [uBlock Origin](https://github.com/gorhill/uBlock) to perform the static network filtering. uBlock Origin attribution and license notes [here](https://github.com/mozilla/fingerprinting-blocking-methods-study-addon/blob/master/src/treatmentScript/requestBlocking/LICENSE.md) including information of forking and modifications.

## Testing

See [TESTPLAN.md](TESTPLAN.md)

## Development

```bash
yarn install
yarn build
```

Install and run one of the built variants:

```bash
npx web-ext run -s dist/extension-control-0.1.0
npx web-ext run -s dist/extension-treatmentScript-0.1.0
npx web-ext run -s dist/extension-treatmentDomain-0.1.0
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
  recipeId: 2,
  slug: "FPBlock",
  userFacingName: "FPBlock",
  userFacingDescription: "Study Addon for FPBlock experiment",
  branch: "treatmentDomain",
  active: true,
  addonId: "FPBlock-treatmentDomain@mozilla.org",
  addonVersion: "0.6.0",
  extensionApiId: 1,
  extensionHash: "badhash",
  hashAlgorithm: "sha256",
  studyStartDate: new Date(),
  studyEndDate: null,
});
```