**fingerprinting-blocking-methods-study-addon**

Study Addon for experiment to test methods of fingerprinting blocking

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
  branch: "control",
  active: true,
  addonId: "FPBlock-treatmentDomain@mozilla.org",
  addonVersion: "0.4.0",
  extensionApiId: 1,
  extensionHash: "badhash",
  hashAlgorithm: "sha256",
  studyStartDate: new Date(),
  studyEndDate: null,
});
```