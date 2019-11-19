/*******************************************************************************

    uBlock Origin - a browser extension to block requests.
    Copyright (C) 2014-present Raymond Hill

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/gorhill/uBlock
*/

'use strict';

/******************************************************************************/

// Start isolation from global scope

µBlock.webRequest = (( ) => {

/******************************************************************************/

// Intercept and filter web requests.

const onBeforeRequest = function(details) {
    const fctxt = µBlock.filteringContext.fromWebrequestDetails(details);

    // Special handling for root document.
    // https://github.com/chrisaljoudi/uBlock/issues/1001
    // This must be executed regardless of whether the request is behind-the-scene
    if ( details.type === 'main_frame' ) {
        return onBeforeRootFrameRequest(fctxt);
    }

    // Special treatment: behind-the-scene requests
    const tabId = details.tabId;
    if ( tabId < 0 ) {
        return onBeforeBehindTheSceneRequest(fctxt);
    }

    // Lookup the page store associated with this tab id.
    const µb = µBlock;
    let pageStore = µb.pageStoreFromTabId(tabId);
    if ( pageStore === null ) {
        const tabContext = µb.tabContextManager.mustLookup(tabId);
        if ( tabContext.tabId < 0 ) {
            return onBeforeBehindTheSceneRequest(fctxt);
        }
        vAPI.tabs.onNavigation({ tabId, frameId: 0, url: tabContext.rawURL });
        pageStore = µb.pageStoreFromTabId(tabId);
    }

    // console.log('This is where the magic happens');
    const result = pageStore.filterRequest(fctxt);

    // Not blocked
    if ( result !== 1 ) {
        if ( details.parentFrameId !== -1 && details.type === 'sub_frame' ) {
            pageStore.setFrame(details.frameId, details.url);
        }
        return;
    }

    return { cancel: true };
};

/******************************************************************************/

const onBeforeRootFrameRequest = function(fctxt) {
    const µb = µBlock;
    const requestURL = fctxt.url;

    // Special handling for root document.
    // https://github.com/chrisaljoudi/uBlock/issues/1001
    //   This must be executed regardless of whether the request is
    //   behind-the-scene
    const requestHostname = fctxt.getHostname();
    let result = 0;

    // If the site is whitelisted, disregard strict blocking
    if ( µb.getNetFilteringSwitch(requestURL) === false ) {
        result = 2;
    }

    // Static filtering: We always need the long-form result here.
    const snfe = µb.staticNetFilteringEngine;

    // Check for specific block
    if ( result === 0 ) {
        fctxt.type = 'main_frame';
        result = snfe.matchString(fctxt, 0b0001);
    }

    // Check for generic block
    if ( result === 0 ) {
        fctxt.type = 'no_type';
        result = snfe.matchString(fctxt, 0b0001);
        // https://github.com/chrisaljoudi/uBlock/issues/1128
        // Do not block if the match begins after the hostname, except when
        // the filter is specifically of type `other`.
        // https://github.com/gorhill/uBlock/issues/490
        // Removing this for the time being, will need a new, dedicated type.
        if (
            result === 1 &&
            toBlockDocResult(requestURL, requestHostname, logData) === false
        ) {
            result = 0;
         }
    }

};

/******************************************************************************/

// https://github.com/gorhill/uBlock/issues/3208
//   Mind case insensitivity.

const toBlockDocResult = function(url, hostname, logData) {
    if ( typeof logData.regex !== 'string' ) { return false; }
    const re = new RegExp(logData.regex, 'i');
    const match = re.exec(url.toLowerCase());
    if ( match === null ) { return false; }

    // https://github.com/chrisaljoudi/uBlock/issues/1128
    // https://github.com/chrisaljoudi/uBlock/issues/1212
    //   Verify that the end of the match is anchored to the end of the
    //   hostname.
    const end = match.index + match[0].length -
                url.indexOf(hostname) - hostname.length;
    return end === 0 || end === 1;
};

/******************************************************************************/

// Intercept and filter behind-the-scene requests.

// https://github.com/gorhill/uBlock/issues/870
// Finally, Chromium 49+ gained the ability to report network request of type
// `beacon`, so now we can block them according to the state of the
// "Disable hyperlink auditing/beacon" setting.

const onBeforeBehindTheSceneRequest = function(fctxt) {
    const µb = µBlock;
    const pageStore = µb.pageStoreFromTabId(fctxt.tabId);
    if ( pageStore === null ) { return; }

    // https://bugs.chromium.org/p/chromium/issues/detail?id=637577#c15
    //   Do not filter behind-the-scene network request of type `beacon`: there
    //   is no point. In any case, this will become a non-issue once
    //   <https://bugs.chromium.org/p/chromium/issues/detail?id=522129> is
    //   fixed.

    // Blocking behind-the-scene requests can break a lot of stuff: prevent
    // browser updates, prevent extension updates, prevent extensions from
    // working properly, etc.
    // So we filter if and only if the "advanced user" mode is selected.
    // https://github.com/gorhill/uBlock/issues/3150
    //   Ability to globally block CSP reports MUST also apply to
    //   behind-the-scene network requests.

    // 2018-03-30:
    //   Filter all behind-the-scene network requests like any other network
    //   requests. Hopefully this will not break stuff as it used to be the
    //   case.

    let result = 0;

    // https://github.com/uBlockOrigin/uBlock-issues/issues/339
    //   Need to also test against `-scheme` since tabOrigin is normalized.
    //   Not especially elegant but for now this accomplishes the purpose of
    //   not dealing with network requests fired from a synthetic scope,
    //   that is unless advanced user mode is enabled.

    if (
        fctxt.tabOrigin.endsWith('-scheme') === false &&
        µb.URI.isNetworkURI(fctxt.tabOrigin) ||
        µb.userSettings.advancedUserEnabled ||
        fctxt.type === 'csp_report'
    ) {
        result = pageStore.filterRequest(fctxt);

        // The "any-tab" scope is not whitelist-able, and in such case we must
        // use the origin URL as the scope. Most such requests aren't going to
        // be blocked, so we further test for whitelisting and modify the
        // result only when the request is being blocked.
        if (
            result === 1 &&
            µb.getNetFilteringSwitch(fctxt.tabOrigin) === false
        ) {
            result = 2;
            fctxt.filter = { engine: 'u', result: 2, raw: 'whitelisted' };
        }
    }

    // Blocked?
    if ( result === 1 ) {
        return { cancel: true };
    }
};

/******************************************************************************/

return {
    start: (( ) => {
        vAPI.net = new vAPI.Net();

        if (
            vAPI.net.canSuspend() &&
            µBlock.hiddenSettings.suspendTabsUntilReady !== 'no' ||
            vAPI.net.canSuspend() !== true &&
            µBlock.hiddenSettings.suspendTabsUntilReady === 'yes'
        ) {
            vAPI.net.suspend(true);
        }
        return function() {
            vAPI.net.setSuspendableListener(onBeforeRequest);
            vAPI.net.unsuspend(true);
        };
    })()
};

/******************************************************************************/

})();

/******************************************************************************/
