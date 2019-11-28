This experiment has three branches:
* control
* treatmentDomain
* treatmentScript

The purpose of this experiment is to measure retention under different fingerprinting blocking conditions. No telemetry or results are sent from the addon, testing is centered around (1) the correct installation of the addon (2) ensuring the correct blocking is occurring.

The test plan is documented here and also written as a Google Doc spreadsheet included on Jira ticket.

The pref we are concerned with in this experiment is `privacy.trackingprotection.fingerprinting.enabled`. Referred to as FP-PREF. Status of FP-PREF can be viewed in `about:config` (or in `about:preferences#privacy`).

Purpose of branches:
* contol - no change from default
* treatmentDomain - flip on FP-PREF (ETP Fingerprinting Protection)
* treatmentScript - block custom list of fingerprinting resources (FP-PREF remains off)

### All

All branches should not be functioning / interacting with private browsing mode. Private browsing mode's default tracking protection should remain in place.


### Control

* User should not be allowed to enroll in study if FP-PREF is already on. (End study reason: "0: User has fingerprinting protections enabled.")
* User should be unenrolled from study if they manually flip FP-PREF on.  (End study reason: "1: User has turned fingerprinting protections on.")
* If user does enroll, nothing happens.


### Treatment Domain

* User should not be allowed to enroll in study if FP-PREF is already on. (End study reason: "0: User has fingerprinting protections enabled.")
* User should be unenrolled from study if they manually flip FP-PREF off (End study reason: "2: User has turned fingerprinting protections off.")
* If user does enroll, FP-PREF is flipped on.
* At end of study, FP-PREF should be restored to off.


### Treatment - Script

* User should not be allowed to enroll in study if FP-PREF is already on. (End study reason: "0: User has fingerprinting protections enabled.")
* User should be unenrolled from study if they manually flip FP-PREF on.  (End study reason: "1: User has turned fingerprinting protections on.")
* If user does enroll, a specific list of scripts should be blocked: see below.
* After unenrolling from study addon blocking shouldn't continue.


#### Testing script blocking 

How to observe blocking:
* In the Web Console (Ctl-Shift-I) -> Network - there should be no entry for the blocked script
* In the Browser Console (Ctl-Shift-J), check Show Content Messages - there should be an entry of the form `FPScript Blocking Experiment. Blocking: <script url that was blocked> pagestore.js:309:21`

In the folder FPList, the csv file `disconnect_scripts_with_top_level.csv` contains all the possible sites (45,194) we are aware of where a site (`top_level_url`) contains a script we want to block (`script_url_stemmed`). You could randomly pick from this list to test the add on function. However, there are a number of problems with this strategy:
* Some fingerprinting domains are more dominant than others, so to test coverage, we should test a weighted sample.
* The internet moves on from when the crawls that power this study were done and so the sites may no longer exist, or the sites may have updated the content they load.
* The crawls that power this study visit a sample of the web that includes explicit content, which is not appropriate to request for a test plan and is not necessary to test coverage.

As a result, we include a curated set of pages below to test a selection of rules from the script list.  The block list rules can be seen here: https://github.com/mozilla/fingerprinting-blocking-methods-study-addon/blob/v0.2.0/src/treatmentScript/assets/script_list.txt. More pages can be requested for testing, or you can build your own - see the code in BuildTestPlan.ipynb for ideas.

Because of the possibility that a website has changed since data gathering a test can have three states:
* FAIL (1) - Target resource appears in Web Console -> Network - and is noted in Browser Console -> Content Messages as blocked
* FAIL (2) - Target resource appears in Web Console -> Network - and no blocking noted in Browser Console -> Content Messages
* PASS - Target resource does not appear in Web Console -> Network - and blocking is noted in Browser Console -> Content Messages
* NO TEST - Target resource does not appear in Web Console -> Network - and no blocking noted in Browser Console -> Content Messages

Wait for page to load (up to 10s)

Test cases:

| Site to load                                    | Expected blocked resource (Rule)                                                                                                                                    | Possible result states:FAIL (1), FAIL (2), PASS, NO RESULTSee Intro or TESTPLAN.md for more info. |
|-------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------|
| https://bbcicecream.eu/                         | https://cdn.justuno.com/mwgt_4.1.js?v=2.95 (||justuno.com/*mwgt_4.1.js^)                                                                                            |                                                                                                   |
| https://travelassist.us.com/                    | Anything from clickguard.com e.g. https://io.clickguard.com/s/cHJvdGVjdG9y/PW6E3JNr                                                                                 |                                                                                                   |
| http://www.audiodim.me/                         | Anything from hilltopads.net e.g. http://hilltopads.net/p                                                                                                           |                                                                                                   |
| https://www.ariseworkfromhome.com/              | appcast.io/pixels/*.js e.g. https://click.appcast.io/pixels/generic1-5191.js                                                                                        |                                                                                                   |
| http://farmbtc.info/                            | bitmedia.io/js/adbybm.js/* e.g. https://ad.bitmedia.io/js/adbybm.js/5db6f347494d9f39e109ce40                                                                        |                                                                                                   |
| http://chedot.com/us/start/                     | https://cdn.doubleverify.com/dvbs_src.js (doubleverify.com/dv*.js)                                                                                                  |                                                                                                   |
| https://www.interstatecycle.com/                | widget.rollick.io/* e.g. https://widget.rollick.io/01300                                                                                                            |                                                                                                   |
| https://www.lirealtor.com/                      | https://cdn.doubleverify.com/dvtp_src.js (doubleverify.com/dv*.js)                                                                                                  |                                                                                                   |
| http://wind-activ.ru/                           | https://sonar.semantiqo.com/c82up/checking.js (||semantiqo.com/*checking.js^)                                                                                       |                                                                                                   |
| https://photo.xuite.net/chen24/20362740/197.jpg | ad.techsolutions.com.tw/sdk/adtechsolutions.js (techsolutions.com.tw/*adtechsolutions.js)                                                                           |                                                                                                   |
| https://www.antenne.com/                        | https://pinpoll.com/global.js (pinpoll.com/*global.js)                                                                                                              |                                                                                                   |
| https://www.diez.hn/                            | https://laprensa.friends2follow.com/sites/all/modules/friends2follow/dist/friends2follow_socialstack.min.js (friends2follow.com/*friends2follow_socialstack.min.js) |                                                                                                   |
| https://bluetrend.media/                        | https://a.breaktime.com.tw/js/au.js?spj=Y9LSW18 (breaktime.com.tw/*au.js)                                                                                           |                                                                                                   |
| https://www.skyscanner.nl/                      | https://client.perimeterx.net/PXrf8vapwA/main.min.js (perimeterx.net/*main.min.js)                                                                                  |                                                                                                   |
| https://www.dripdrop.io/                        | https://serve.albacross.com/track.js (albacross.com/*track.js)                                                                                                      |                                                                                                   