/*******************************************************************************

    uBlock Origin - a browser extension to block requests.
    Copyright (C) 2014-2015 The uBlock Origin authors
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

    A number of unused properties have been removed.
*/

// For background page

'use strict';

/******************************************************************************/

{
// >>>>> start of local scope

/******************************************************************************/
/******************************************************************************/

const browser = self.browser;
const manifest = browser.runtime.getManifest();

vAPI.cantWebsocket =
    browser.webRequest.ResourceType instanceof Object === false  ||
    browser.webRequest.ResourceType.WEBSOCKET !== 'websocket';

vAPI.canWASM = vAPI.webextFlavor.soup.has('chromium') === false;
if ( vAPI.canWASM === false ) {
    const csp = manifest.content_security_policy;
    vAPI.canWASM = csp !== undefined && csp.indexOf("'wasm-eval'") !== -1;
}

vAPI.supportsUserStylesheets = vAPI.webextFlavor.soup.has('user_stylesheet');

// The real actual webextFlavor value may not be set in stone, so listen
// for possible future changes.
window.addEventListener('webextFlavor', function() {
    vAPI.supportsUserStylesheets =
        vAPI.webextFlavor.soup.has('user_stylesheet');
}, { once: true });

/******************************************************************************/

vAPI.app = {
    name: manifest.name.replace(/ dev\w+ build/, ''),
    version: (( ) => {
        let version = manifest.version;
        const match = /(\d+\.\d+\.\d+)(?:\.(\d+))?/.exec(version);
        if ( match && match[2] ) {
            const v = parseInt(match[2], 10);
            version = match[1] + (v < 100 ? 'b' + v : 'rc' + (v - 100));
        }
        return version;
    })(),

    intFromVersion: function(s) {
        const parts = s.match(/(?:^|\.|b|rc)\d+/g);
        if ( parts === null ) { return 0; }
        let vint = 0;
        for ( let i = 0; i < 4; i++ ) {
            const pstr = parts[i] || '';
            let pint;
            if ( pstr === '' ) {
                pint = 0;
            } else if ( pstr.startsWith('.') || pstr.startsWith('b') ) {
                pint = parseInt(pstr.slice(1), 10);
            } else if ( pstr.startsWith('rc') ) {
                pint = parseInt(pstr.slice(2), 10) + 100;
            } else {
                pint = parseInt(pstr, 10);
            }
            vint = vint * 1000 + pint;
        }
        return vint;
    }
};

/******************************************************************************/
/******************************************************************************/

vAPI.storage = webext.storage.local;

/******************************************************************************/
/******************************************************************************/

// https://github.com/gorhill/uMatrix/issues/234
// https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/privacy/network

// https://github.com/gorhill/uBlock/issues/2048
//   Do not mess up with existing settings if not assigning them stricter
//   values.

vAPI.browserSettings = (( ) => {
    // Not all platforms support `browser.privacy`.
    const bp = webext.privacy;
    if ( bp instanceof Object === false ) { return; }

    return {
        // Whether the WebRTC-related privacy API is crashy is an open question
        // only for Chromium proper (because it can be compiled without the
        // WebRTC feature): hence avoid overhead of the evaluation (which uses
        // an iframe) for platforms where it's a non-issue.
        // https://github.com/uBlockOrigin/uBlock-issues/issues/9
        //   Some Chromium builds are made to look like a Chrome build.
        webRTCSupported: vAPI.webextFlavor.soup.has('chromium') === false || undefined,

        // Calling with `true` means IP address leak is not prevented.
        // https://github.com/gorhill/uBlock/issues/533
        //   We must first check wether this Chromium-based browser was compiled
        //   with WebRTC support. To do this, we use an iframe, this way the
        //   empty RTCPeerConnection object we create to test for support will
        //   be properly garbage collected. This prevents issues such as
        //   a computer unable to enter into sleep mode, as reported in the
        //   Chrome store:
        // https://github.com/gorhill/uBlock/issues/533#issuecomment-167931681
        setWebrtcIPAddress: function(setting) {
            // We don't know yet whether this browser supports WebRTC: find out.
            if ( this.webRTCSupported === undefined ) {
                // If asked to leave WebRTC setting alone at this point in the
                // code, this means we never grabbed the setting in the first
                // place.
                if ( setting ) { return; }
                this.webRTCSupported = { setting: setting };
                let iframe = document.createElement('iframe');
                const messageHandler = ev => {
                    if ( ev.origin !== self.location.origin ) { return; }
                    window.removeEventListener('message', messageHandler);
                    const setting = this.webRTCSupported.setting;
                    this.webRTCSupported = ev.data === 'webRTCSupported';
                    this.setWebrtcIPAddress(setting);
                    iframe.parentNode.removeChild(iframe);
                    iframe = null;
                };
                window.addEventListener('message', messageHandler);
                iframe.src = 'is-webrtc-supported.html';
                document.body.appendChild(iframe);
                return;
            }

            // We are waiting for a response from our iframe. This makes the code
            // safe to re-entrancy.
            if ( typeof this.webRTCSupported === 'object' ) {
                this.webRTCSupported.setting = setting;
                return;
            }

            // https://github.com/gorhill/uBlock/issues/533
            // WebRTC not supported: `webRTCMultipleRoutesEnabled` can NOT be
            // safely accessed. Accessing the property will cause full browser
            // crash.
            if ( this.webRTCSupported !== true ) { return; }

            const bpn = bp.network;

            if ( setting ) {
                bpn.webRTCIPHandlingPolicy.clear({
                    scope: 'regular',
                });
            } else {
                // https://github.com/uBlockOrigin/uAssets/issues/333#issuecomment-289426678
                //   Leverage virtuous side-effect of strictest setting.
                // https://github.com/gorhill/uBlock/issues/3009
                //   Firefox currently works differently, use
                //   `default_public_interface_only` for now.
                bpn.webRTCIPHandlingPolicy.set({
                    value: vAPI.webextFlavor.soup.has('chromium')
                        ? 'disable_non_proxied_udp'
                        : 'default_public_interface_only',
                    scope: 'regular',
                });
            }
        },

        set: function(details) {
            for ( const setting in details ) {
                if ( details.hasOwnProperty(setting) === false ) { continue; }
                switch ( setting ) {
                case 'prefetching':
                    const enabled = !!details[setting];
                    if ( enabled ) {
                        bp.network.networkPredictionEnabled.clear({
                            scope: 'regular',
                        });
                    } else {
                        bp.network.networkPredictionEnabled.set({
                            value: false,
                            scope: 'regular',
                        });
                    }
                    if ( vAPI.prefetching instanceof Function ) {
                        vAPI.prefetching(enabled);
                    }
                    break;

                case 'hyperlinkAuditing':
                    if ( !!details[setting] ) {
                        bp.websites.hyperlinkAuditingEnabled.clear({
                            scope: 'regular',
                        });
                    } else {
                        bp.websites.hyperlinkAuditingEnabled.set({
                            value: false,
                            scope: 'regular',
                        });
                    }
                    break;

                case 'webrtcIPAddress':
                    this.setWebrtcIPAddress(!!details[setting]);
                    break;

                default:
                    break;
                }
            }
        }
    };
})();

/******************************************************************************/
/******************************************************************************/

vAPI.isBehindTheSceneTabId = function(tabId) {
    return tabId < 0;
};

vAPI.unsetTabId = 0;
vAPI.noTabId = -1;      // definitely not any existing tab

// To ensure we always use a good tab id
const toTabId = function(tabId) {
    return typeof tabId === 'number' && isNaN(tabId) === false
        ? tabId
        : 0;
};

// https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webNavigation
// https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs

vAPI.Tabs = class {
    constructor() {
        browser.webNavigation.onCreatedNavigationTarget.addListener(details => {
            if ( typeof details.url !== 'string' ) {
                details.url = '';
            }
            if ( /^https?:\/\//.test(details.url) === false ) {
                details.frameId = 0;
                details.url = this.sanitizeURL(details.url);
                this.onNavigation(details);
            }
            this.onCreated(details);
        });

        browser.webNavigation.onCommitted.addListener(details => {
            details.url = this.sanitizeURL(details.url);
            this.onNavigation(details);
        });

        // https://github.com/gorhill/uBlock/issues/3073
        //   Fall back to `tab.url` when `changeInfo.url` is not set.
        browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if ( typeof changeInfo.url !== 'string' ) {
                changeInfo.url = tab && tab.url;
            }
            if ( changeInfo.url ) {
                changeInfo.url = this.sanitizeURL(changeInfo.url);
            }
            this.onUpdated(tabId, changeInfo, tab);
        });

        browser.tabs.onActivated.addListener(details => {
            this.onActivated(details);
        });

        // https://github.com/uBlockOrigin/uBlock-issues/issues/151
        // https://github.com/uBlockOrigin/uBlock-issues/issues/680#issuecomment-515215220
        if ( browser.windows instanceof Object ) {
            browser.windows.onFocusChanged.addListener(async windowId => {
                if ( windowId === browser.windows.WINDOW_ID_NONE ) { return; }
                const tabs = await vAPI.tabs.query({ active: true, windowId });
                if ( tabs.length === 0 ) { return; }
                const tab = tabs[0];
                this.onActivated({ tabId: tab.id, windowId: tab.windowId });
            });
        }

        browser.tabs.onRemoved.addListener((tabId, details) => {
            this.onClosed(tabId, details);
        });
     }

    async executeScript() {
        let result;
        try {
            result = await webext.tabs.executeScript(...arguments);
        }
        catch(reason) {
        }
        return Array.isArray(result) ? result : [];
    }

    async get(tabId) {
        if ( tabId === null ) {
            return this.getCurrent();
        }
        if ( tabId <= 0 ) { return null; }
        let tab;
        try {
            tab = await webext.tabs.get(tabId);
        }
        catch(reason) {
        }
        return tab instanceof Object ? tab : null;
    }

    async getCurrent() {
        const tabs = await this.query({ active: true, currentWindow: true });
        return tabs.length !== 0 ? tabs[0] : null;
    }

    async query(queryInfo) {
        let tabs;
        try {
            tabs = await webext.tabs.query(queryInfo);
        }
        catch(reason) {
        }
        return Array.isArray(tabs) ? tabs : [];
    }

    // Properties of the details object:
    // - url: 'URL',    => the address that will be opened
    // - tabId: 1,      => the tab is used if set, instead of creating a new one
    // - index: -1,     => undefined: end of the list, -1: following tab, or
    //                     after index
    // - active: false, => opens the tab in background - true and undefined:
    //                     foreground
    // - select: true,  => if a tab is already opened with that url, then select
    //                     it instead of opening a new one
    // - popup: true    => open in a new window

    async open(details) {
        let targetURL = details.url;
        if ( typeof targetURL !== 'string' || targetURL === '' ) {
            return null;
        }

        // extension pages
        if ( /^[\w-]{2,}:/.test(targetURL) !== true ) {
            targetURL = vAPI.getURL(targetURL);
        }

        if ( !details.select ) {
            this.create(targetURL, details);
            return;
        }

        // https://github.com/gorhill/uBlock/issues/3053#issuecomment-332276818
        //   Do not try to lookup uBO's own pages with FF 55 or less.
        if (
            vAPI.webextFlavor.soup.has('firefox') &&
            vAPI.webextFlavor.major < 56
        ) {
            this.create(targetURL, details);
            return;
        }

        // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/query#Parameters
        //   "Note that fragment identifiers are not matched."
        //   Fragment identifiers ARE matched -- we need to remove the fragment.
        const pos = targetURL.indexOf('#');
        const targetURLWithoutHash = pos === -1
            ? targetURL
            : targetURL.slice(0, pos);

        const tabs = await vAPI.tabs.query({ url: targetURLWithoutHash });
        if ( tabs.length === 0 ) {
            this.create(targetURL, details);
            return;
        }
        let tab = tabs[0];
        const updateDetails = { active: true };
        // https://github.com/uBlockOrigin/uBlock-issues/issues/592
        if ( tab.url.startsWith(targetURL) === false ) {
            updateDetails.url = targetURL;
        }
        tab = await vAPI.tabs.update(tab.id, updateDetails);
        if ( vAPI.windows instanceof Object === false ) { return; }
        vAPI.windows.update(tab.windowId, { focused: true });
    }

    async update() {
        let tab;
        try {
            tab = await webext.tabs.update(...arguments);
        }
        catch (reason) {
        }
        return tab instanceof Object ? tab : null;
    }

    // Replace the URL of a tab. Noop if the tab does not exist.
    replace(tabId, url) {
        tabId = toTabId(tabId);
        if ( tabId === 0 ) { return; }

        let targetURL = url;

        // extension pages
        if ( /^[\w-]{2,}:/.test(targetURL) !== true ) {
            targetURL = vAPI.getURL(targetURL);
        }

        vAPI.tabs.update(tabId, { url: targetURL });
    }

    async remove(tabId) {
        tabId = toTabId(tabId);
        if ( tabId === 0 ) { return; }
        try {
            await webext.tabs.remove(tabId);
        }
        catch (reason) {
        }
    }

    async reload(tabId, bypassCache = false) {
        tabId = toTabId(tabId);
        if ( tabId === 0 ) { return; }
        try {
            await webext.tabs.reload(
                tabId,
                { bypassCache: bypassCache === true }
            );
        }
        catch (reason) {
        }
    }

    async select(tabId) {
        tabId = toTabId(tabId);
        if ( tabId === 0 ) { return; }
        const tab = await vAPI.tabs.update(tabId, { active: true });
        if ( tab === null ) { return; }
        if ( vAPI.windows instanceof Object === false ) { return; }
        vAPI.windows.update(tab.windowId, { focused: true });
    }

    // https://forums.lanik.us/viewtopic.php?f=62&t=32826
    //   Chromium-based browsers: sanitize target URL. I've seen data: URI with
    //   newline characters in standard fields, possibly as a way of evading
    //   filters. As per spec, there should be no whitespaces in a data: URI's
    //   standard fields.

    sanitizeURL(url) {
        if ( url.startsWith('data:') === false ) { return url; }
        const pos = url.indexOf(',');
        if ( pos === -1 ) { return url; }
        const s = url.slice(0, pos);
        if ( s.search(/\s/) === -1 ) { return url; }
        return s.replace(/\s+/, '') + url.slice(pos);
    }

    onActivated(/* details */) {
    }

    onClosed(/* tabId, details */) {
    }

    onCreated(/* details */) {
    }

    onNavigation(/* details */) {
    }

    onUpdated(/* tabId, changeInfo, tab */) {
    }
};

/******************************************************************************/
/******************************************************************************/

if ( webext.windows instanceof Object ) {
    vAPI.windows = {
        get: async function() {
            let win;
            try {
                win = await webext.windows.get(...arguments);
            }
            catch (reason) {
            }
            return win instanceof Object ? win : null;
        },
        create: async function() {
            let win;
            try {
                win = await webext.windows.create(...arguments);
            }
            catch (reason) {
            }
            return win instanceof Object ? win : null;
        },
        update: async function() {
            let win;
            try {
                win = await webext.windows.update(...arguments);
            }
            catch (reason) {
            }
            return win instanceof Object ? win : null;
        },
    };
}

/******************************************************************************/

vAPI.Net = class {
    constructor() {
        this.validTypes = new Set();
        {
            const wrrt = browser.webRequest.ResourceType;
            for ( const typeKey in wrrt ) {
                if ( wrrt.hasOwnProperty(typeKey) ) {
                    this.validTypes.add(wrrt[typeKey]);
                }
            }
        }
        this.suspendableListener = undefined;
        this.listenerMap = new WeakMap();
        this.suspendDepth = 0;

        browser.webRequest.onBeforeRequest.addListener(
            details => {
                this.normalizeDetails(details);
                if ( this.suspendDepth === 0 || details.tabId < 0 ) {
                    if ( this.suspendableListener === undefined ) { return; }
                    return this.suspendableListener(details);
                }
                return this.suspendOneRequest(details);
            },
            this.denormalizeFilters({ urls: [ 'http://*/*', 'https://*/*' ] }),
            [ 'blocking' ]
        );
    }
    normalizeDetails(/* details */) {
    }
    denormalizeFilters(filters) {
        const urls = filters.urls || [ '<all_urls>' ];
        let types = filters.types;
        if ( Array.isArray(types) ) {
            types = this.denormalizeTypes(types);
        }
        if (
            (this.validTypes.has('websocket')) &&
            (types === undefined || types.indexOf('websocket') !== -1) &&
            (urls.indexOf('<all_urls>') === -1)
        ) {
            if ( urls.indexOf('ws://*/*') === -1 ) {
                urls.push('ws://*/*');
            }
            if ( urls.indexOf('wss://*/*') === -1 ) {
                urls.push('wss://*/*');
            }
        }
        return { types, urls };
    }
    denormalizeTypes(types) {
        return types;
    }
    addListener(which, clientListener, filters, options) {
        const actualFilters = this.denormalizeFilters(filters);
        const actualListener = this.makeNewListenerProxy(clientListener);
        browser.webRequest[which].addListener(
            actualListener,
            actualFilters,
            options
        );
    }
    setSuspendableListener(listener) {
        this.suspendableListener = listener;
    }
    removeListener(which, clientListener) {
        const actualListener = this.listenerMap.get(clientListener);
        if ( actualListener === undefined ) { return; }
        this.listenerMap.delete(clientListener);
        browser.webRequest[which].removeListener(actualListener);
    }
    makeNewListenerProxy(clientListener) {
        const actualListener = details => {
            this.normalizeDetails(details);
            return clientListener(details);
        };
        this.listenerMap.set(clientListener, actualListener);
        return actualListener;
    }
    suspendOneRequest() {
    }
    unsuspendAllRequests() {
    }
    suspend(force = false) {
        if ( this.canSuspend() || force ) {
            this.suspendDepth += 1;
        }
    }
    unsuspend(all = false) {
        if ( this.suspendDepth === 0 ) { return; }
        if ( all ) {
            this.suspendDepth = 0;
        } else {
            this.suspendDepth -= 1;
        }
        if ( this.suspendDepth !== 0 ) { return; }
        this.unsuspendAllRequests(this.suspendableListener);
    }
    canSuspend() {
        return false;
    }
};

/******************************************************************************/

// <<<<< end of local scope
}

/******************************************************************************/
