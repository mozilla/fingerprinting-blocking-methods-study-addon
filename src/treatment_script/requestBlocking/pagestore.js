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

/*******************************************************************************

A PageRequestStore object is used to store net requests in two ways:

To record distinct net requests
To create a log of net requests

**/

{

// start of private namespace
// >>>>>

/******************************************************************************/

const µb = µBlock;

/******************************************************************************/

const NetFilteringResultCache = class {
    constructor() {
        this.init();
    }

    init() {
        this.blocked = new Map();
        this.results = new Map();
        this.hash = 0;
        this.timer = undefined;
        return this;
    }

    rememberResult(fctxt, result) {
        if ( fctxt.tabId <= 0 ) { return; }
        if ( this.results.size === 0 ) {
            this.pruneAsync();
        }
        const key = fctxt.getDocHostname() + ' ' + fctxt.type + ' ' + fctxt.url;
        this.results.set(key, {
            result: result,
            logData: fctxt.filter,
            tstamp: Date.now()
        });
        if ( result !== 1 ) { return; }
        const now = Date.now();
        this.blocked.set(key, now);
        this.hash = now;
    }

    rememberBlock(fctxt) {
        if ( fctxt.tabId <= 0 ) { return; }
        if ( this.blocked.size === 0 ) {
            this.pruneAsync();
        }
        const now = Date.now();
        this.blocked.set(
            fctxt.getDocHostname() + ' ' + fctxt.type + ' ' + fctxt.url,
            now
        );
        this.hash = now;
    }

    empty() {
        this.blocked.clear();
        this.results.clear();
        this.hash = 0;
        if ( this.timer !== undefined ) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
    }

    prune() {
        const obsolete = Date.now() - this.shelfLife;
        for ( const entry of this.blocked ) {
            if ( entry[1] <= obsolete ) {
                this.results.delete(entry[0]);
                this.blocked.delete(entry[0]);
            }
        }
        for ( const entry of this.results ) {
            if ( entry[1].tstamp <= obsolete ) {
                this.results.delete(entry[0]);
            }
        }
        if ( this.blocked.size !== 0 || this.results.size !== 0 ) {
            this.pruneAsync();
        }
    }

    pruneAsync() {
        if ( this.timer !== undefined ) { return; }
        this.timer = vAPI.setTimeout(
            ( ) => {
                this.timer = undefined;
                this.prune();
            },
            this.shelfLife
        );
    }

    lookupResult(fctxt) {
        return this.results.get(
            fctxt.getDocHostname() + ' ' +
            fctxt.type + ' ' +
            fctxt.url
        );
    }

    lookupAllBlocked(hostname) {
        const result = [];
        for ( const entry of this.blocked ) {
            const pos = entry[0].indexOf(' ');
            if ( entry[0].slice(0, pos) === hostname ) {
                result[result.length] = entry[0].slice(pos + 1);
            }
        }
        return result;
    }

    static factory() {
        return new NetFilteringResultCache();
    }
};

NetFilteringResultCache.prototype.shelfLife = 15000;

/******************************************************************************/

// Frame stores are used solely to associate a URL with a frame id. The
// name `pageHostname` is used because of historical reasons. A more
// appropriate name is `frameHostname` -- something to do in a future
// refactoring.

// To mitigate memory churning
const frameStoreJunkyard = [];
const frameStoreJunkyardMax = 50;

const FrameStore = class {
    constructor(frameURL) {
        this.init(frameURL);
    }

    init(frameURL) {
        const µburi = µb.URI;
        this.pageHostname = µburi.hostnameFromURI(frameURL);
        this.pageDomain =
            µburi.domainFromHostname(this.pageHostname) || this.pageHostname;
        return this;
    }

    dispose() {
        this.pageHostname = this.pageDomain = '';
        if ( frameStoreJunkyard.length < frameStoreJunkyardMax ) {
            frameStoreJunkyard.push(this);
        }
        return null;
    }

    static factory(frameURL) {
        const entry = frameStoreJunkyard.pop();
        if ( entry === undefined ) {
            return new FrameStore(frameURL);
        }
        return entry.init(frameURL);
    }
};

/******************************************************************************/

// To mitigate memory churning
const pageStoreJunkyard = [];
const pageStoreJunkyardMax = 10;

const PageStore = class {
    constructor(tabId, context) {
        this.extraData = new Map();
        this.journal = [];
        this.journalTimer = null;
        this.journalLastCommitted = this.journalLastUncommitted = undefined;
        this.journalLastUncommittedURL = undefined;
        this.netFilteringCache = NetFilteringResultCache.factory();
        this.init(tabId, context);
    }

    static factory(tabId, context) {
        let entry = pageStoreJunkyard.pop();
        if ( entry === undefined ) {
            entry = new PageStore(tabId, context);
        } else {
            entry.init(tabId, context);
        }
        return entry;
    }

    // https://github.com/gorhill/uBlock/issues/3201
    //   The context is used to determine whether we report behavior change
    //   to the logger.

    init(tabId, context) {
        const tabContext = µb.tabContextManager.mustLookup(tabId);
        this.tabId = tabId;

        // If we are navigating from-to same site, remember whether large
        // media elements were temporarily allowed.
        if (
            typeof this.allowLargeMediaElementsUntil !== 'number' ||
            tabContext.rootHostname !== this.tabHostname
        ) {
            this.allowLargeMediaElementsUntil = 0;
        }

        this.tabHostname = tabContext.rootHostname;
        this.title = tabContext.rawURL;
        this.rawURL = tabContext.rawURL;
        this.hostnameToCountMap = new Map();
        this.contentLastModified = 0;
        this.frames = new Map();
        this.logData = undefined;
        this.perLoadBlockedRequestCount = 0;
        this.perLoadAllowedRequestCount = 0;
        this.remoteFontCount = 0;
        this.popupBlockedCount = 0;
        this.largeMediaCount = 0;
        this.largeMediaTimer = null;
        this.internalRedirectionCount = 0;
        this.extraData.clear();

        // The current filtering context is cloned because:
        // - We may be called with or without the current context having been
        //   initialized.
        // - If it has been initialized, we do not want to change the state
        //   of the current context.
        const fctxt = µb.logger.enabled
            ? µb.filteringContext
                .duplicate()
                .fromTabId(tabId)
                .setURL(tabContext.rawURL)
            : undefined;

        // https://github.com/uBlockOrigin/uBlock-issues/issues/314
        const masterSwitch = tabContext.getNetFilteringSwitch();

        this.noCosmeticFiltering = true;
        /* µb.sessionSwitches.evaluateZ(
            'no-cosmetic-filtering',
            tabContext.rootHostname
        ) === true; */
        /* if (
            masterSwitch &&
            this.noCosmeticFiltering &&
            µb.logger.enabled &&
            context === 'tabCommitted'
        ) {
            fctxt.setRealm('cosmetic')
                 .setType('dom')
                 .setFilter(µb.sessionSwitches.toLogData())
                 .toLogger();
        } */

        return this;
    }

    reuse(context) {
        // When force refreshing a page, the page store data needs to be reset.

        // If the hostname changes, we can't merely just update the context.
        const tabContext = µb.tabContextManager.mustLookup(this.tabId);
        if ( tabContext.rootHostname !== this.tabHostname ) {
            context = '';
        }

        // If URL changes without a page reload (more and more common), then
        // we need to keep all that we collected for reuse. In particular,
        // not doing so was causing a problem in `videos.foxnews.com`:
        // clicking a video thumbnail would not work, because the frame
        // hierarchy structure was flushed from memory, while not really being
        //  flushed on the page.
        if ( context === 'tabUpdated' ) {
            // As part of https://github.com/chrisaljoudi/uBlock/issues/405
            // URL changed, force a re-evaluation of filtering switch
            this.rawURL = tabContext.rawURL;
            return this;
        }

        // A new page is completely reloaded from scratch, reset all.
        if ( this.largeMediaTimer !== null ) {
            clearTimeout(this.largeMediaTimer);
            this.largeMediaTimer = null;
        }
        this.disposeFrameStores();
        this.init(this.tabId, context);
        return this;
    }

    dispose() {
        this.tabHostname = '';
        this.title = '';
        this.rawURL = '';
        this.hostnameToCountMap = null;
        this.netFilteringCache.empty();
        this.allowLargeMediaElementsUntil = 0;
        if ( this.largeMediaTimer !== null ) {
            clearTimeout(this.largeMediaTimer);
            this.largeMediaTimer = null;
        }
        this.disposeFrameStores();
        if ( this.journalTimer !== null ) {
            clearTimeout(this.journalTimer);
            this.journalTimer = null;
        }
        this.journal = [];
        this.journalLastUncommittedURL = undefined;
        if ( pageStoreJunkyard.length < pageStoreJunkyardMax ) {
            pageStoreJunkyard.push(this);
        }
        return null;
    }

    disposeFrameStores() {
        for ( const frameStore of this.frames.values() ) {
            frameStore.dispose();
        }
        this.frames.clear();
    }

    getFrame(frameId) {
        return this.frames.get(frameId) || null;
    }

    setFrame(frameId, frameURL) {
        const frameStore = this.frames.get(frameId);
        if ( frameStore !== undefined ) {
            frameStore.init(frameURL);
        } else {
            this.frames.set(frameId, FrameStore.factory(frameURL));
        }
    }
 
    getNetFilteringSwitch() {
        return µb.tabContextManager
                 .mustLookup(this.tabId)
                 .getNetFilteringSwitch();
    }

    // https://github.com/gorhill/uBlock/issues/2053
    //   There is no way around using journaling to ensure we deal properly with
    //   potentially out of order navigation events vs. network request events.
    journalAddRequest(hostname, result) {
        if ( hostname === '' ) { return; }
        this.journal.push(
            hostname,
            result === 1 ? 0x00000001 : 0x00010000
        );
        if ( this.journalTimer === null ) {
            this.journalTimer = vAPI.setTimeout(
                ( ) => { this.journalProcess(true); },
                µb.hiddenSettings.requestJournalProcessPeriod
            );
        }
    }

    journalAddRootFrame(type, url) {
        if ( type === 'committed' ) {
            this.journalLastCommitted = this.journal.length;
            if (
                this.journalLastUncommitted !== undefined &&
                this.journalLastUncommitted < this.journalLastCommitted &&
                this.journalLastUncommittedURL === url
            ) {
                this.journalLastCommitted = this.journalLastUncommitted;
                this.journalLastUncommitted = undefined;
            }
        } else if ( type === 'uncommitted' ) {
            this.journalLastUncommitted = this.journal.length;
            this.journalLastUncommittedURL = url;
        }
        if ( this.journalTimer !== null ) {
            clearTimeout(this.journalTimer);
        }
        this.journalTimer = vAPI.setTimeout(
            ( ) => { this.journalProcess(true); },
            µb.hiddenSettings.requestJournalProcessPeriod
        );
    }

    journalProcess(fromTimer) {
        if ( !fromTimer ) {
            clearTimeout(this.journalTimer);
        }
        this.journalTimer = null;

        const journal = this.journal;
        const now = Date.now();
        let aggregateCounts = 0;
        let pivot = this.journalLastCommitted || 0;

        // Everything after pivot originates from current page.
        for ( let i = pivot; i < journal.length; i += 2 ) {
            const hostname = journal[i];
            let hostnameCounts = this.hostnameToCountMap.get(hostname);
            if ( hostnameCounts === undefined ) {
                hostnameCounts = 0;
                this.contentLastModified = now;
            }
            let count = journal[i+1];
            this.hostnameToCountMap.set(hostname, hostnameCounts + count);
            aggregateCounts += count;
        }
        this.perLoadBlockedRequestCount += aggregateCounts & 0xFFFF;
        this.perLoadAllowedRequestCount += aggregateCounts >>> 16 & 0xFFFF;
        this.journalLastCommitted = undefined;

        // https://github.com/chrisaljoudi/uBlock/issues/905#issuecomment-76543649
        //   No point updating the badge if it's not being displayed.
        if ( (aggregateCounts & 0xFFFF) && µb.userSettings.showIconBadge ) {
            µb.updateToolbarIcon(this.tabId, 0x02);
        }

        // Everything before pivot does not originate from current page -- we
        // still need to bump global blocked/allowed counts.
        for ( let i = 0; i < pivot; i += 2 ) {
            aggregateCounts += journal[i+1];
        }
        if ( aggregateCounts !== 0 ) {
            µb.localSettings.blockedRequestCount +=
                aggregateCounts & 0xFFFF;
            µb.localSettings.allowedRequestCount +=
                aggregateCounts >>> 16 & 0xFFFF;
            µb.localSettingsLastModified = now;
        }
        journal.length = 0;
    }

    filterRequest(fctxt) {
        fctxt.filter = undefined;
        // Static filtering
        let result = µb.staticNetFilteringEngine.matchString(fctxt);
        if (result === 1 ) {
            // BIRD TODO: I would really like to make this more visible to user by putting it in web console.
            console.log('FPScript Blocking Experiment. Blocking:', fctxt.url);
        }
        return result;
    }

    getBlockedResources(request, response) {
        console.log('in getBlockedResources');
        const normalURL = µb.normalizePageURL(this.tabId, request.frameURL);
        const resources = request.resources;
        const fctxt = µb.filteringContext;
        fctxt.fromTabId(this.tabId)
             .setDocOriginFromURL(normalURL);
        // Force some resources to go through the filtering engine in order to
        // populate the blocked-resources cache. This is required because for
        // some resources it's not possible to detect whether they were blocked
        // content script-side (i.e. `iframes` -- unlike `img`).
        if ( Array.isArray(resources) && resources.length !== 0 ) {
            for ( const resource of resources ) {
                this.filterRequest(
                    fctxt.setType(resource.type)
                         .setURL(resource.url)
                );
            }
        }
        if ( this.netFilteringCache.hash === response.hash ) { return; }
        response.hash = this.netFilteringCache.hash;
        response.blockedResources =
            this.netFilteringCache.lookupAllBlocked(fctxt.getDocHostname());
    }
};

µb.PageStore = PageStore;

/******************************************************************************/

// <<<<<
// end of private namespace

}
