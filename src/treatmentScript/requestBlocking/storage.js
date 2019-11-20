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

/* global punycode, publicSuffixList */

'use strict';

/******************************************************************************/

µBlock.getBytesInUse = async function() {
    const promises = [];
    let bytesInUse;

    // Not all platforms implement this method.
    promises.push(
        vAPI.storage.getBytesInUse instanceof Function
            ? vAPI.storage.getBytesInUse(null)
            : undefined
    );

    if (
        navigator.storage instanceof Object &&
        navigator.storage.estimate instanceof Function
    ) {
        promises.push(navigator.storage.estimate());
    }

    const results = await Promise.all(promises);

    const processCount = count => {
        if ( typeof count !== 'number' ) { return; }
        if ( bytesInUse === undefined ) { bytesInUse = 0; }
        bytesInUse += count;
        return bytesInUse;
    };

    processCount(results[0]);
    if ( results.length > 1 && results[1] instanceof Object ) {
        processCount(results[1].usage);
    }
    µBlock.storageUsed = bytesInUse;
    return bytesInUse;
};

/******************************************************************************/

µBlock.saveLocalSettings = (( ) => {
    const saveAfter = 4 * 60 * 1000;

    const onTimeout = ( ) => {
        const µb = µBlock;
        if ( µb.localSettingsLastModified > µb.localSettingsLastSaved ) {
            µb.saveLocalSettings();
        }
        vAPI.setTimeout(onTimeout, saveAfter);
    };

    vAPI.setTimeout(onTimeout, saveAfter);

    return function() {
        this.localSettingsLastSaved = Date.now();
        return vAPI.storage.set(this.localSettings);
    };
})();

/******************************************************************************/

µBlock.saveUserSettings = function() {
    vAPI.storage.set(this.userSettings);
};

/******************************************************************************/

µBlock.loadHiddenSettings = async function() {
    const bin = await vAPI.storage.get('hiddenSettings');
    if ( bin instanceof Object === false ) { return; }

    const hs = bin.hiddenSettings;
    if ( hs instanceof Object ) {
        const hsDefault = this.hiddenSettingsDefault;
        for ( const key in hsDefault ) {
            if (
                hsDefault.hasOwnProperty(key) &&
                hs.hasOwnProperty(key) &&
                typeof hs[key] === typeof hsDefault[key]
            ) {
                this.hiddenSettings[key] = hs[key];
            }
        }
        if ( typeof this.hiddenSettings.suspendTabsUntilReady === 'boolean' ) {
            this.hiddenSettings.suspendTabsUntilReady =
                this.hiddenSettings.suspendTabsUntilReady
                    ? 'yes'
                    : 'unset';
        }
    }
    self.log.verbosity = this.hiddenSettings.consoleLogLevel;
    this.fireDOMEvent('hiddenSettingsChanged');
};

// Note: Save only the settings which values differ from the default ones.
// This way the new default values in the future will properly apply for those
// which were not modified by the user.

µBlock.saveHiddenSettings = function() {
    const bin = { hiddenSettings: {} };
    for ( const prop in this.hiddenSettings ) {
        if (
            this.hiddenSettings.hasOwnProperty(prop) &&
            this.hiddenSettings[prop] !== this.hiddenSettingsDefault[prop]
        ) {
            bin.hiddenSettings[prop] = this.hiddenSettings[prop];
        }
    }
    vAPI.storage.set(bin);
    this.saveImmediateHiddenSettings();
    self.log.verbosity = this.hiddenSettings.consoleLogLevel;
};

/******************************************************************************/

µBlock.hiddenSettingsFromString = function(raw) {
    const out = Object.assign({}, this.hiddenSettingsDefault);
    const lineIter = new this.LineIterator(raw);
    while ( lineIter.eot() === false ) {
        const line = lineIter.next();
        const matches = /^\s*(\S+)\s+(.+)$/.exec(line);
        if ( matches === null || matches.length !== 3 ) { continue; }
        const name = matches[1];
        if ( out.hasOwnProperty(name) === false ) { continue; }
        const value = matches[2];
        switch ( typeof out[name] ) {
        case 'boolean':
            if ( value === 'true' ) {
                out[name] = true;
            } else if ( value === 'false' ) {
                out[name] = false;
            }
            break;
        case 'string':
            out[name] = value;
            break;
        case 'number':
            out[name] = parseInt(value, 10);
            if ( isNaN(out[name]) ) {
                out[name] = this.hiddenSettingsDefault[name];
            }
            break;
        default:
            break;
        }
    }
    return out;
};

µBlock.stringFromHiddenSettings = function() {
    const out = [];
    for ( const key of Object.keys(this.hiddenSettings).sort() ) {
        out.push(key + ' ' + this.hiddenSettings[key]);
    }
    return out.join('\n');
};

/******************************************************************************/

// These settings must be available immediately on startup, without delay
// through the vAPI.localStorage. Add/remove settings as needed.

µBlock.saveImmediateHiddenSettings = function() {
    const props = [
        'consoleLogLevel',
        'disableWebAssembly',
        'suspendTabsUntilReady',
    ];
    const toSave = {};
    for ( const prop of props ) {
        if ( this.hiddenSettings[prop] !== this.hiddenSettingsDefault[prop] ) {
            toSave[prop] = this.hiddenSettings[prop];
        }
    }
    if ( Object.keys(toSave).length !== 0 ) {
        vAPI.localStorage.setItem(
            'immediateHiddenSettings',
            JSON.stringify(toSave)
        );
    } else {
        vAPI.localStorage.removeItem('immediateHiddenSettings');
    }
};

/******************************************************************************/

µBlock.savePermanentFirewallRules = function() {
    vAPI.storage.set({
        dynamicFilteringString: this.permanentFirewall.toString()
    });
};

/******************************************************************************/

µBlock.savePermanentURLFilteringRules = function() {
    vAPI.storage.set({
        urlFilteringString: this.permanentURLFiltering.toString()
    });
};

/******************************************************************************/

µBlock.saveHostnameSwitches = function() {
    vAPI.storage.set({
        hostnameSwitchesString: this.permanentSwitches.toString()
    });
};

/******************************************************************************/

µBlock.saveWhitelist = function() {
    vAPI.storage.set({
        netWhitelist: this.arrayFromWhitelist(this.netWhitelist)
    });
    this.netWhitelistModifyTime = Date.now();
};

/*******************************************************************************

    TODO(seamless migration):
    The code related to 'remoteBlacklist' can be removed when I am confident
    all users have moved to a version of uBO which no longer depends on
    the property 'remoteBlacklists, i.e. v1.11 and beyond.

**/

µBlock.loadSelectedFilterLists = async function() {
    const bin = await vAPI.storage.get('selectedFilterLists');
    if ( bin instanceof Object && Array.isArray(bin.selectedFilterLists) ) {
        this.selectedFilterLists = bin.selectedFilterLists;
        return;
    }

    // https://github.com/gorhill/uBlock/issues/747
    //   Select default filter lists if first-time launch.
    const lists = await this.assets.metadata();
    const selectedListKeys = [ this.userFiltersPath ];
    for ( const key in lists ) {
        if ( lists.hasOwnProperty(key) === false ) { continue; }
        const list = lists[key];
        if ( list.off !== true ) {
            selectedListKeys.push(key);
            continue;
        }
    }
    this.saveSelectedFilterLists(selectedListKeys);
};

µBlock.saveSelectedFilterLists = function(newKeys, append = false) {
    const oldKeys = this.selectedFilterLists.slice();
    if ( append ) {
        newKeys = newKeys.concat(oldKeys);
    }
    const newSet = new Set(newKeys);
    // Purge unused filter lists from cache.
    for ( const oldKey of oldKeys ) {
        if ( newSet.has(oldKey) === false ) {
            this.removeFilterList(oldKey);
        }
    }
    newKeys = Array.from(newSet);
    this.selectedFilterLists = newKeys;
    return vAPI.storage.set({ selectedFilterLists: newKeys });
};

/******************************************************************************/

µBlock.applyFilterListSelection = function(details) {
    let selectedListKeySet = new Set(this.selectedFilterLists);
    let externalLists = this.userSettings.externalLists;

    // Filter lists to select
    if ( Array.isArray(details.toSelect) ) {
        if ( details.merge ) {
            for ( let i = 0, n = details.toSelect.length; i < n; i++ ) {
                selectedListKeySet.add(details.toSelect[i]);
            }
        } else {
            selectedListKeySet = new Set(details.toSelect);
        }
    }

    // Imported filter lists to remove
    if ( Array.isArray(details.toRemove) ) {
        const removeURLFromHaystack = (haystack, needle) => {
            return haystack.replace(
                new RegExp(
                    '(^|\\n)' +
                    this.escapeRegex(needle) +
                    '(\\n|$)', 'g'),
                '\n'
            ).trim();
        };
        for ( let i = 0, n = details.toRemove.length; i < n; i++ ) {
            const assetKey = details.toRemove[i];
            selectedListKeySet.delete(assetKey);
            externalLists = removeURLFromHaystack(externalLists, assetKey);
            this.removeFilterList(assetKey);
        }
    }

    // Filter lists to import
    if ( typeof details.toImport === 'string' ) {
        // https://github.com/gorhill/uBlock/issues/1181
        //   Try mapping the URL of an imported filter list to the assetKey
        //   of an existing stock list.
        const assetKeyFromURL = url => {
            const needle = url.replace(/^https?:/, '');
            const assets = this.availableFilterLists;
            for ( const assetKey in assets ) {
                const asset = assets[assetKey];
                if ( asset.content !== 'filters' ) { continue; }
                if ( typeof asset.contentURL === 'string' ) {
                    if ( asset.contentURL.endsWith(needle) ) { return assetKey; }
                    continue;
                }
                if ( Array.isArray(asset.contentURL) === false ) { continue; }
                for ( let i = 0, n = asset.contentURL.length; i < n; i++ ) {
                    if ( asset.contentURL[i].endsWith(needle) ) {
                        return assetKey;
                    }
                }
            }
            return url;
        };
        const importedSet = new Set(this.listKeysFromCustomFilterLists(externalLists));
        const toImportSet = new Set(this.listKeysFromCustomFilterLists(details.toImport));
        for ( const urlKey of toImportSet ) {
            if ( importedSet.has(urlKey) ) { continue; }
            const assetKey = assetKeyFromURL(urlKey);
            if ( assetKey === urlKey ) {
                importedSet.add(urlKey);
            }
            selectedListKeySet.add(assetKey);
        }
        externalLists = Array.from(importedSet).sort().join('\n');
    }

    const result = Array.from(selectedListKeySet);
    if ( externalLists !== this.userSettings.externalLists ) {
        this.userSettings.externalLists = externalLists;
        vAPI.storage.set({ externalLists: externalLists });
    }
    this.saveSelectedFilterLists(result);
};

/******************************************************************************/

µBlock.listKeysFromCustomFilterLists = function(raw) {
    const out = new Set();
    const reIgnore = /^[!#]/;
    const reValid = /^[a-z-]+:\/\/\S+/;
    const lineIter = new this.LineIterator(raw);
    while ( lineIter.eot() === false ) {
        const location = lineIter.next().trim();
        if ( reIgnore.test(location) || !reValid.test(location) ) { continue; }
        out.add(location);
    }
    return Array.from(out);
};

/******************************************************************************/

µBlock.saveUserFilters = function(content) {
    // https://github.com/gorhill/uBlock/issues/1022
    //   Be sure to end with an empty line.
    content = content.trim();
    if ( content !== '' ) { content += '\n'; }
    this.removeCompiledFilterList(this.userFiltersPath);
    return this.assets.put(this.userFiltersPath, content);
};

µBlock.loadUserFilters = function() {
    return this.assets.get(this.userFiltersPath);
};

µBlock.appendUserFilters = async function(filters, options) {
    filters = filters.trim();
    if ( filters.length === 0 ) { return; }

    // https://github.com/uBlockOrigin/uBlock-issues/issues/372
    //   Auto comment using user-defined template.
    let comment = '';
    if (
        options instanceof Object &&
        options.autoComment === true &&
        this.hiddenSettings.autoCommentFilterTemplate.indexOf('{{') !== -1
    ) {
        const d = new Date();
        comment =
            '! ' +
            this.hiddenSettings.autoCommentFilterTemplate
                .replace('{{date}}', d.toLocaleDateString())
                .replace('{{time}}', d.toLocaleTimeString())
                .replace('{{origin}}', options.origin);
    }

    const details = await this.loadUserFilters();
    if ( details.error ) { return; }

    // The comment, if any, will be applied if and only if it is different
    // from the last comment found in the user filter list.
    if ( comment !== '' ) {
        const pos = details.content.lastIndexOf(comment);
        if (
            pos === -1 ||
            details.content.indexOf('\n!', pos + 1) !== -1
        ) {
            filters = '\n' + comment + '\n' + filters;
        }
    }

    // https://github.com/chrisaljoudi/uBlock/issues/976
    //   If we reached this point, the filter quite probably needs to be
    //   added for sure: do not try to be too smart, trying to avoid
    //   duplicates at this point may lead to more issues.
    await this.saveUserFilters(details.content.trim() + '\n' + filters);

    const compiledFilters = this.compileFilters(
        filters,
        { assetKey: this.userFiltersPath }
    );
    const snfe = this.staticNetFilteringEngine;
    const cfe = this.cosmeticFilteringEngine;
    const acceptedCount = snfe.acceptedCount + cfe.acceptedCount;
    const discardedCount = snfe.discardedCount + cfe.discardedCount;
    this.applyCompiledFilters(compiledFilters, true);
    const entry = this.availableFilterLists[this.userFiltersPath];
    const deltaEntryCount =
        snfe.acceptedCount +
        cfe.acceptedCount - acceptedCount;
    const deltaEntryUsedCount =
        deltaEntryCount -
        (snfe.discardedCount + cfe.discardedCount - discardedCount);
    entry.entryCount += deltaEntryCount;
    entry.entryUsedCount += deltaEntryUsedCount;
    vAPI.storage.set({ 'availableFilterLists': this.availableFilterLists });
    this.staticNetFilteringEngine.freeze();
    this.selfieManager.destroy();

    // https://www.reddit.com/r/uBlockOrigin/comments/cj7g7m/
    // https://www.reddit.com/r/uBlockOrigin/comments/cnq0bi/
    if ( options.killCache ) {
        browser.webRequest.handlerBehaviorChanged();
    }
};

µBlock.createUserFilters = function(details) {
    this.appendUserFilters(details.filters, details);
    // https://github.com/gorhill/uBlock/issues/1786
    this.cosmeticFilteringEngine.removeFromSelectorCache(details.pageDomain);
};

/******************************************************************************/

µBlock.getAvailableLists = async function() {
    let oldAvailableLists = {},
        newAvailableLists = {};

    // User filter list.
    newAvailableLists[this.userFiltersPath] = {
        group: 'user',
        title: '1pPageName'
    };

    // Custom filter lists.
    const importedListKeys = this.listKeysFromCustomFilterLists(
        this.userSettings.externalLists
    );
    for ( const listKey of importedListKeys ) {
        const entry = {
            content: 'filters',
            contentURL: listKey,
            external: true,
            group: 'custom',
            submitter: 'user',
            title: ''
        };
        newAvailableLists[listKey] = entry;
        this.assets.registerAssetSource(listKey, entry);
    }

    // Convert a no longer existing stock list into an imported list.
    const customListFromStockList = assetKey => {
        const oldEntry = oldAvailableLists[assetKey];
        if ( oldEntry === undefined || oldEntry.off === true ) { return; }
        let listURL = oldEntry.contentURL;
        if ( Array.isArray(listURL) ) {
            listURL = listURL[0];
        }
        const newEntry = {
            content: 'filters',
            contentURL: listURL,
            external: true,
            group: 'custom',
            submitter: 'user',
            title: oldEntry.title || ''
        };
        newAvailableLists[listURL] = newEntry;
        this.assets.registerAssetSource(listURL, newEntry);
        importedListKeys.push(listURL);
        this.userSettings.externalLists += '\n' + listURL;
        this.userSettings.externalLists = this.userSettings.externalLists.trim();
        vAPI.storage.set({ externalLists: this.userSettings.externalLists });
        this.saveSelectedFilterLists([ listURL ], true);
    };

    // Load previously saved available lists -- these contains data
    // computed at run-time, we will reuse this data if possible.
    const [ bin, entries ] = await Promise.all([
        vAPI.storage.get('availableFilterLists'),
        this.assets.metadata(),
    ]);
    
    oldAvailableLists = bin && bin.availableFilterLists || {};

    for ( const assetKey in entries ) {
        if ( entries.hasOwnProperty(assetKey) === false ) { continue; }
        const entry = entries[assetKey];
        if ( entry.content !== 'filters' ) { continue; }
        newAvailableLists[assetKey] = Object.assign({}, entry);
    }

    // Load set of currently selected filter lists.
    const listKeySet = new Set(this.selectedFilterLists);
    for ( const listKey in newAvailableLists ) {
        if ( newAvailableLists.hasOwnProperty(listKey) ) {
            newAvailableLists[listKey].off = !listKeySet.has(listKey);
        }
    }

    //finalize();
    // Final steps:
    // - reuse existing list metadata if any;
    // - unregister unreferenced imported filter lists if any.
    // Reuse existing metadata.
    for ( const assetKey in oldAvailableLists ) {
        const oldEntry = oldAvailableLists[assetKey];
        const newEntry = newAvailableLists[assetKey];
        // List no longer exists. If a stock list, try to convert to
        // imported list if it was selected.
        if ( newEntry === undefined ) {
            this.removeFilterList(assetKey);
            if ( assetKey.indexOf('://') === -1 ) {
                customListFromStockList(assetKey);
            }
            continue;
        }
        if ( oldEntry.entryCount !== undefined ) {
            newEntry.entryCount = oldEntry.entryCount;
        }
        if ( oldEntry.entryUsedCount !== undefined ) {
            newEntry.entryUsedCount = oldEntry.entryUsedCount;
        }
        // This may happen if the list name was pulled from the list
        // content.
        // https://github.com/chrisaljoudi/uBlock/issues/982
        // There is no guarantee the title was successfully extracted from
        // the list content.
        if (
            newEntry.title === '' &&
            typeof oldEntry.title === 'string' &&
            oldEntry.title !== ''
        ) {
            newEntry.title = oldEntry.title;
        }
    }

    // Remove unreferenced imported filter lists.
    for ( const assetKey in newAvailableLists ) {
        const newEntry = newAvailableLists[assetKey];
        if ( newEntry.submitter !== 'user' ) { continue; }
        if ( importedListKeys.indexOf(assetKey) !== -1 ) { continue; }
        delete newAvailableLists[assetKey];
        this.assets.unregisterAssetSource(assetKey);
        this.removeFilterList(assetKey);
    }

    return newAvailableLists;
};

/******************************************************************************/

µBlock.loadFilterLists = (( ) => {
    const loadedListKeys = [];
    let loadingPromise;

    const t0 = Date.now();

    const onDone = function() {
        log.info(`loadFilterLists() took ${Date.now()-t0} ms`);

        this.staticNetFilteringEngine.freeze();
        vAPI.net.unsuspend();

        vAPI.storage.set({ 'availableFilterLists': this.availableFilterLists });

        this.selfieManager.destroy();
        this.lz4Codec.relinquish();
        this.compiledFormatChanged = false;

        loadingPromise = undefined;
    };

    const applyCompiledFilters = function(assetKey, compiled) {
        // BIRD: TODO: We actually don't care about these counts.

        const snfe = this.staticNetFilteringEngine;
        let acceptedCount = snfe.acceptedCount,
            discardedCount = snfe.discardedCount;
        this.applyCompiledFilters(compiled, assetKey === this.userFiltersPath);
        if ( this.availableFilterLists.hasOwnProperty(assetKey) ) {
            const entry = this.availableFilterLists[assetKey];
            entry.entryCount = snfe.acceptedCount - acceptedCount;
            entry.entryUsedCount = entry.entryCount - (snfe.discardedCount - discardedCount);
        }
        loadedListKeys.push(assetKey);
    };

    const onFilterListsReady = function(lists) {
        this.availableFilterLists = lists;

        vAPI.net.suspend();
        this.staticNetFilteringEngine.reset();
        this.selfieManager.destroy();

        // We need to build a complete list of assets to pull first: this is
        // because it *may* happens that some load operations are synchronous:
        // This happens for assets which do not exist, ot assets with no
        // content.
        const toLoad = [];
        for ( const assetKey in lists ) {
            if ( lists.hasOwnProperty(assetKey) === false ) { continue; }
            if ( lists[assetKey].off ) { continue; }

            toLoad.push(
                this.getCompiledFilterList(assetKey).then(details => {
                    applyCompiledFilters.call(
                        this,
                        details.assetKey,
                        details.content
                    );
                })
            );
        }

        return Promise.all(toLoad);
    };

    return function() {
        if ( loadingPromise instanceof Promise === false ) {
            loadedListKeys.length = 0;
            loadingPromise = Promise.all([
                this.getAvailableLists().then(lists =>
                    onFilterListsReady.call(this, lists)
                )
            ]).then(( ) => {
                onDone.call(this);
            });
        }
        return loadingPromise;
    };
})();

/******************************************************************************/

µBlock.getCompiledFilterList = async function(assetKey) {
    const compiledPath = 'compiled/' + assetKey;

    if ( this.compiledFormatChanged === false ) {
        let compiledDetails = await this.assets.get(compiledPath);
        if ( compiledDetails.content !== '' ) {
            compiledDetails.assetKey = assetKey;
            return compiledDetails;
        }
    }

    const rawDetails = await this.assets.get(assetKey);
    // Compiling an empty string results in an empty string.
    if ( rawDetails.content === '' ) {
        rawDetails.assetKey = assetKey;
        return rawDetails;
    }

    this.extractFilterListMetadata(assetKey, rawDetails.content);

    // Fetching the raw content may cause the compiled content to be
    // generated somewhere else in uBO, hence we try one last time to
    // fetch the compiled content in case it has become available.
    let compiledDetails = await this.assets.get(compiledPath);
    if ( compiledDetails.content === '' ) {
        compiledDetails.content = this.compileFilters(
            rawDetails.content,
            { assetKey: assetKey }
        );
        this.assets.put(compiledPath, compiledDetails.content);
    }

    compiledDetails.assetKey = assetKey;
    return compiledDetails;
};

/******************************************************************************/

// https://github.com/gorhill/uBlock/issues/3406
//   Lower minimum update period to 1 day.

µBlock.extractFilterListMetadata = function(assetKey, raw) {
    const listEntry = this.availableFilterLists[assetKey];
    if ( listEntry === undefined ) { return; }
    // Metadata expected to be found at the top of content.
    const head = raw.slice(0, 1024);
    // https://github.com/gorhill/uBlock/issues/313
    // Always try to fetch the name if this is an external filter list.
    if ( listEntry.title === '' || listEntry.group === 'custom' ) {
        const matches = head.match(/(?:^|\n)(?:!|# )[\t ]*Title[\t ]*:([^\n]+)/i);
        if ( matches !== null ) {
            // https://bugs.chromium.org/p/v8/issues/detail?id=2869
            //   orphanizeString is to work around String.slice()
            //   potentially causing the whole raw filter list to be held in
            //   memory just because we cut out the title as a substring.
            listEntry.title = this.orphanizeString(matches[1].trim());
        }
    }
    // Extract update frequency information
    const matches = head.match(/(?:^|\n)(?:!|# )[\t ]*Expires[\t ]*:[\t ]*(\d+)[\t ]*(h)?/i);
    if ( matches !== null ) {
        let v = Math.max(parseInt(matches[1], 10), 1);
        if ( matches[2] !== undefined ) {
            v = Math.ceil(v / 24);
        }
        if ( v !== listEntry.updateAfter ) {
            this.assets.registerAssetSource(assetKey, { updateAfter: v });
        }
    }
};

/******************************************************************************/

µBlock.removeCompiledFilterList = function(assetKey) {
    this.assets.remove('compiled/' + assetKey);
};

µBlock.removeFilterList = function(assetKey) {
    this.removeCompiledFilterList(assetKey);
    this.assets.remove(assetKey);
};

/******************************************************************************/

µBlock.compileFilters = function(rawText, details) {
    const writer = new this.CompiledLineIO.Writer();

    // Populate the writer with information potentially useful to the
    // client compilers.
    if ( details ) {
        if ( details.assetKey ) {
            writer.properties.set('assetKey', details.assetKey);
        }
    }

    // Useful references:
    //    https://adblockplus.org/en/filter-cheatsheet
    //    https://adblockplus.org/en/filters
    const staticNetFilteringEngine = this.staticNetFilteringEngine;
    const reIsWhitespaceChar = /\s/;
    const reMaybeLocalIp = /^[\d:f]/;
    const reIsLocalhostRedirect = /\s+(?:0\.0\.0\.0|broadcasthost|localhost|local|ip6-\w+)\b/;
    const reLocalIp = /^(?:0\.0\.0\.0|127\.0\.0\.1|::1|fe80::1%lo0)/;
    const lineIter = new this.LineIterator(this.processDirectives(rawText));

    while ( lineIter.eot() === false ) {
        // rhill 2014-04-18: The trim is important here, as without it there
        // could be a lingering `\r` which would cause problems in the
        // following parsing code.
        let line = lineIter.next().trim();
        if ( line.length === 0 ) { continue; }

        // Strip comments
        const c = line.charAt(0);
        if ( c === '!' || c === '[' ) { continue; }
        if ( c === '#' ) { continue; }

        // Catch comments somewhere on the line
        // Remove:
        //   ... #blah blah blah
        //   ... # blah blah blah
        // Don't remove:
        //   ...#blah blah blah
        // because some ABP filters uses the `#` character (URL fragment)
        const pos = line.indexOf('#');
        if ( pos !== -1 && reIsWhitespaceChar.test(line.charAt(pos - 1)) ) {
            line = line.slice(0, pos).trim();
        }

        // https://github.com/gorhill/httpswitchboard/issues/15
        // Ensure localhost et al. don't end up in the ubiquitous blacklist.
        // With hosts files, we need to remove local IP redirection
        if ( reMaybeLocalIp.test(c) ) {
            // Ignore hosts file redirect configuration
            // 127.0.0.1 localhost
            // 255.255.255.255 broadcasthost
            if ( reIsLocalhostRedirect.test(line) ) { continue; }
            line = line.replace(reLocalIp, '').trim();
        }

        if ( line.length === 0 ) { continue; }

        staticNetFilteringEngine.compile(line, writer);
    }

    return writer.toString();
};

/******************************************************************************/

// https://github.com/gorhill/uBlock/issues/1395
//   Added `firstparty` argument: to avoid discarding cosmetic filters when
//   applying 1st-party filters.

µBlock.applyCompiledFilters = function(rawText, firstparty) {
    if ( rawText === '' ) { return; }
    let reader = new this.CompiledLineIO.Reader(rawText);
    this.staticNetFilteringEngine.fromCompiledContent(reader);
};

/******************************************************************************/

// https://github.com/AdguardTeam/AdguardBrowserExtension/issues/917

µBlock.processDirectives = function(content) {
    const reIf = /^!#(if|endif)\b([^\n]*)/gm;
    const stack = [];
    const shouldDiscard = ( ) => stack.some(v => v);
    const parts = [];
    let  beg = 0, discard = false;

    while ( beg < content.length ) {
        const match = reIf.exec(content);
        if ( match === null ) { break; }

        switch ( match[1] ) {
        case 'if':
            let expr = match[2].trim();
            const target = expr.charCodeAt(0) === 0x21 /* '!' */;
            if ( target ) { expr = expr.slice(1); }
            const token = this.processDirectives.tokens.get(expr);
            const startDiscard =
                token === 'false' &&
                    target === false ||
                token !== undefined &&
                    vAPI.webextFlavor.soup.has(token) === target;
            if ( discard === false && startDiscard ) {
                parts.push(content.slice(beg, match.index));
                discard = true;
            }
            stack.push(startDiscard);
            break;

        case 'endif':
            stack.pop();
            const stopDiscard = shouldDiscard() === false;
            if ( discard && stopDiscard ) {
                beg = match.index + match[0].length + 1;
                discard = false;
            }
            break;

        default:
            break;
        }
    }

    if ( stack.length === 0 && parts.length !== 0 ) {
        parts.push(content.slice(beg));
        content = parts.join('\n');
    }
    return content.trim();
};

µBlock.processDirectives.tokens = new Map([
    [ 'ext_ublock', 'ublock' ],
    [ 'env_chromium', 'chromium' ],
    [ 'env_edge', 'edge' ],
    [ 'env_firefox', 'firefox' ],
    [ 'env_mobile', 'mobile' ],
    [ 'env_safari', 'safari' ],
    [ 'cap_html_filtering', 'html_filtering' ],
    [ 'cap_user_stylesheet', 'user_stylesheet' ],
    [ 'false', 'false' ],
]);

/******************************************************************************/

µBlock.loadPublicSuffixList = async function() {
    if ( this.hiddenSettings.disableWebAssembly === false ) {
        publicSuffixList.enableWASM();
    }

    try {
        const result = await this.assets.get(`compiled/${this.pslAssetKey}`);
        if ( publicSuffixList.fromSelfie(result.content, this.base64) ) {
            return;
        }
    } catch (ex) {
        console.error(ex);
        return;
    }

    const result = await this.assets.get(this.pslAssetKey);
    if ( result.content !== '' ) {
        this.compilePublicSuffixList(result.content);
    }
};

µBlock.compilePublicSuffixList = function(content) {
    publicSuffixList.parse(content, punycode.toASCII);
    this.assets.put(
        'compiled/' + this.pslAssetKey,
        publicSuffixList.toSelfie(µBlock.base64)
    );
};

/******************************************************************************/

// This is to be sure the selfie is generated in a sane manner: the selfie will
// be generated if the user doesn't change his filter lists selection for
// some set time.

µBlock.selfieManager = (( ) => {
    const µb = µBlock;
    let createTimer;
    let destroyTimer;

    // As of 2018-05-31:
    //   JSON.stringify-ing ourselves results in a better baseline
    //   memory usage at selfie-load time. For some reasons.

    const create = async function() {
        await Promise.all([
            µb.assets.put(
                'selfie/main',
                JSON.stringify({
                    magic: µb.systemSettings.selfieMagic,
                    availableFilterLists: µb.availableFilterLists,
                })
            ),
            µb.staticNetFilteringEngine.toSelfie(
                'selfie/staticNetFilteringEngine'
            ),
        ]);
        µb.lz4Codec.relinquish();
        µb.selfieIsInvalid = false;
    };

    const loadMain = async function() {
        const details = await µb.assets.get('selfie/main');
        if (
            details instanceof Object === false ||
            typeof details.content !== 'string' ||
            details.content === ''
        ) {
            return false;
        }
        let selfie;
        try {
            selfie = JSON.parse(details.content);
        } catch(ex) {
        }
        if (
            selfie instanceof Object === false ||
            selfie.magic !== µb.systemSettings.selfieMagic
        ) {
            return false;
        }
        µb.availableFilterLists = selfie.availableFilterLists;
        return true;
    };

    const load = async function() {
        if ( µb.selfieIsInvalid ) {
            return false;
        }
        try {
            const results = await Promise.all([
                loadMain(),
                µb.staticNetFilteringEngine.fromSelfie(
                    'selfie/staticNetFilteringEngine'
                ),
            ]);
        }
        catch (reason) {
            log.info(reason);
        }
        destroy();
        return false;
    };

    const destroy = function() {
        µb.cacheStorage.remove('selfie'); // TODO: obsolete, remove eventually.
        µb.assets.remove(/^selfie\//);
        µb.selfieIsInvalid = true;
        createTimer = vAPI.setTimeout(( ) => {
            createTimer = undefined;
            create();
        }, µb.hiddenSettings.selfieAfter * 60000);
    };

    const destroyAsync = function() {
        if ( destroyTimer !== undefined ) { return; }
        if ( createTimer !== undefined ) {
            clearTimeout(createTimer);
            createTimer = undefined;
        }
        destroyTimer = vAPI.setTimeout(
            ( ) => {
                destroyTimer = undefined;
                destroy();
            },
            1019
        );
        µb.selfieIsInvalid = true;
    };

    return { load, destroy: destroyAsync };
})();

