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

// Load all: executed once.

(async ( ) => {
// >>>>> start of private scope

const µb = µBlock;

/******************************************************************************/

vAPI.app.onShutdown = function() {
    const µb = µBlock;
    µb.staticNetFilteringEngine.reset();
};

/******************************************************************************/

// https://github.com/chrisaljoudi/uBlock/issues/226
// Whitelist in memory.
// Whitelist parser needs PSL to be ready.
// gorhill 2014-12-15: not anymore

const onNetWhitelistReady = function(netWhitelistRaw) {
    if ( typeof netWhitelistRaw === 'string' ) {
        netWhitelistRaw = netWhitelistRaw.split('\n');
    }
    µb.netWhitelist = µb.whitelistFromArray(netWhitelistRaw);
    µb.netWhitelistModifyTime = Date.now();
};

/******************************************************************************/

// User settings are in memory

const onUserSettingsReady = function(fetched) {
    const userSettings = µb.userSettings;
    fromFetch(userSettings, fetched);
};

/******************************************************************************/

// Housekeeping, as per system setting changes

const onSystemSettingsReady = function(fetched) {
    if ( fetched.compiledMagic !== µb.systemSettings.compiledMagic ) {
        µb.assets.remove(/^compiled\//);
        µb.compiledFormatChanged = true;
        µb.selfieIsInvalid = true;
    }
    if ( fetched.selfieMagic !== µb.systemSettings.selfieMagic ) {
        µb.selfieIsInvalid = true;
    }
    if ( µb.selfieIsInvalid ) {
        fetched.selfie = null;
        µb.selfieManager.destroy();
        vAPI.storage.set(µb.systemSettings);
    }
};

/******************************************************************************/

const onFirstFetchReady = function(fetched) {
    // https://github.com/uBlockOrigin/uBlock-issues/issues/507
    //   Firefox-specific: somehow `fetched` is undefined under certain
    //   circumstances even though we asked to load with default values.
    if ( fetched instanceof Object === false ) {
        fetched = createDefaultProps();
    }

    // Order is important -- do not change:
    onSystemSettingsReady(fetched);
    fromFetch(µb.localSettings, fetched);
    onUserSettingsReady(fetched);
    fromFetch(µb.restoreBackupSettings, fetched);
    onNetWhitelistReady(fetched.netWhitelist);
};

/******************************************************************************/

const toFetch = function(from, fetched) {
    for ( const k in from ) {
        if ( from.hasOwnProperty(k) === false ) { continue; }
        fetched[k] = from[k];
    }
};

const fromFetch = function(to, fetched) {
    for ( const k in to ) {
        if ( to.hasOwnProperty(k) === false ) { continue; }
        if ( fetched.hasOwnProperty(k) === false ) { continue; }
        to[k] = fetched[k];
    }
};

const createDefaultProps = function() {
    const fetchableProps = {
        'commandShortcuts': [],
        'compiledMagic': 0,
        'dynamicFilteringString': [
            'behind-the-scene * * noop',
            'behind-the-scene * image noop',
            'behind-the-scene * 3p noop',
            'behind-the-scene * inline-script noop',
            'behind-the-scene * 1p-script noop',
            'behind-the-scene * 3p-script noop',
            'behind-the-scene * 3p-frame noop'
        ].join('\n'),
        'urlFilteringString': '',
        'hostnameSwitchesString': [
            'no-large-media: behind-the-scene false',
        ].join('\n'),
        'lastRestoreFile': '',
        'lastRestoreTime': 0,
        'lastBackupFile': '',
        'lastBackupTime': 0,
        'netWhitelist': µb.netWhitelistDefault,
        'selfieMagic': 0,
        'version': '0.0.0.0'
    };
    toFetch(µb.localSettings, fetchableProps);
    toFetch(µb.userSettings, fetchableProps);
    toFetch(µb.restoreBackupSettings, fetchableProps);
    return fetchableProps;
};

/******************************************************************************/

try {
    await µb.loadHiddenSettings();
    log.info(`Hidden settings ready ${Date.now()-vAPI.T0} ms after launch`);

    const cacheBackend = await µb.cacheStorage.select(
        µb.hiddenSettings.cacheStorageAPI
    );
    log.info(`Backend storage for cache will be ${cacheBackend}`);

    await Promise.all([
        µb.loadSelectedFilterLists().then(( ) => {
            log.info(`List selection ready ${Date.now()-vAPI.T0} ms after launch`);
        }),
        vAPI.storage.get(createDefaultProps()).then(fetched => {
            log.info(`First fetch ready ${Date.now()-vAPI.T0} ms after launch`);
            onFirstFetchReady(fetched);
        }),
        µb.loadPublicSuffixList().then(( ) => {
            log.info(`PSL ready ${Date.now()-vAPI.T0} ms after launch`);
        }),
    ]);

    const selfieIsValid = await µb.selfieManager.load();
    if ( selfieIsValid === true ) {
        log.info(`Selfie ready ${Date.now()-vAPI.T0} ms after launch`);
    } else {
        await µb.loadFilterLists();
        log.info(`Filter lists ready ${Date.now()-vAPI.T0} ms after launch`);
    }
} catch (ex) {
    console.trace(ex);
}

// Final initialization steps after all needed assets are in memory.

// Start network observers.
µb.webRequest.start();

// Ensure that the resources allocated for decompression purpose (likely
// large buffers) are garbage-collectable immediately after launch.
// Otherwise I have observed that it may take quite a while before the
// garbage collection of these resources kicks in. Relinquishing as soon
// as possible ensure minimal memory usage baseline.
µb.lz4Codec.relinquish();

log.info(`All ready ${Date.now()-vAPI.T0} ms after launch`);

// <<<<< end of private scope
})();
