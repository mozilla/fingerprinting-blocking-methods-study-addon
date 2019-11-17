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
        this.disposeFrameStores();
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
};

µb.PageStore = PageStore;

/******************************************************************************/

// <<<<<
// end of private namespace

}
