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
/******************************************************************************/

{

// *****************************************************************************
// start of local namespace

// https://github.com/chrisaljoudi/uBlock/issues/405
// Be more flexible with whitelist syntax

// Any special regexp char will be escaped
const whitelistDirectiveEscape = /[-\/\\^$+?.()|[\]{}]/g;

// All `*` will be expanded into `.*`
const whitelistDirectiveEscapeAsterisk = /\*/g;

// Remember encountered regexps for reuse.
const directiveToRegexpMap = new Map();

// Probably manually entered whitelist directive
const isHandcraftedWhitelistDirective = function(directive) {
    return directive.startsWith('/') && directive.endsWith('/') ||
           directive.indexOf('/') !== -1 && directive.indexOf('*') !== -1;
};

const matchDirective = function(url, hostname, directive) {
    // Directive is a plain hostname.
    if ( directive.indexOf('/') === -1 ) {
        return hostname.endsWith(directive) &&
              (hostname.length === directive.length ||
               hostname.charAt(hostname.length - directive.length - 1) === '.');
    }
    // Match URL exactly.
    if (
        directive.startsWith('/') === false &&
        directive.indexOf('*') === -1
    ) {
        return url === directive;
    }
    // Transpose into a regular expression.
    let re = directiveToRegexpMap.get(directive);
    if ( re === undefined ) {
        let reStr;
        if ( directive.startsWith('/') && directive.endsWith('/') ) {
            reStr = directive.slice(1, -1);
        } else {
            reStr = directive.replace(whitelistDirectiveEscape, '\\$&')
                             .replace(whitelistDirectiveEscapeAsterisk, '.*');
        }
        re = new RegExp(reStr);
        directiveToRegexpMap.set(directive, re);
    }
    return re.test(url);
};

const matchBucket = function(url, hostname, bucket, start) {
    if ( bucket ) {
        for ( let i = start || 0, n = bucket.length; i < n; i++ ) {
            if ( matchDirective(url, hostname, bucket[i]) ) {
                return i;
            }
        }
    }
    return -1;
};

/******************************************************************************/

µBlock.getNetFilteringSwitch = function(url) {
    const hostname = this.URI.hostnameFromURI(url);
    let key = hostname;
    for (;;) {
        if ( matchBucket(url, hostname, this.netWhitelist.get(key)) !== -1 ) {
            return false;
        }
        const pos = key.indexOf('.');
        if ( pos === -1 ) { break; }
        key = key.slice(pos + 1);
    }
    if ( matchBucket(url, hostname, this.netWhitelist.get('//')) !== -1 ) {
        return false;
    }
    return true;
};

/******************************************************************************/

µBlock.toggleNetFilteringSwitch = function(url, scope, newState) {
    const currentState = this.getNetFilteringSwitch(url);
    if ( newState === undefined ) {
        newState = !currentState;
    }
    if ( newState === currentState ) {
        return currentState;
    }

    const netWhitelist = this.netWhitelist;
    const pos = url.indexOf('#');
    let targetURL = pos !== -1 ? url.slice(0, pos) : url;
    const targetHostname = this.URI.hostnameFromURI(targetURL);
    let key = targetHostname;
    let directive = scope === 'page' ? targetURL : targetHostname;

    // Add to directive list
    if ( newState === false ) {
        let bucket = netWhitelist.get(key);
        if ( bucket === undefined ) {
            bucket = [];
            netWhitelist.set(key, bucket);
        }
        bucket.push(directive);
        this.saveWhitelist();
        return true;
    }

    // Remove all directives which cause current URL to be whitelisted
    for (;;) {
        const bucket = netWhitelist.get(key);
        if ( bucket !== undefined ) {
            let i;
            for (;;) {
                i = matchBucket(targetURL, targetHostname, bucket, i);
                if ( i === -1 ) { break; }
                directive = bucket.splice(i, 1)[0];
                if ( isHandcraftedWhitelistDirective(directive) ) {
                    netWhitelist.get('#').push(`# ${directive}`);
                }
            }
            if ( bucket.length === 0 ) {
                netWhitelist.delete(key);
            }
        }
        const pos = key.indexOf('.');
        if ( pos === -1 ) { break; }
        key = key.slice(pos + 1);
    }
    const bucket = netWhitelist.get('//');
    if ( bucket !== undefined ) {
        let i;
        for (;;) {
            i = matchBucket(targetURL, targetHostname, bucket, i);
            if ( i === -1 ) { break; }
            directive = bucket.splice(i, 1)[0];
            if ( isHandcraftedWhitelistDirective(directive) ) {
                netWhitelist.get('#').push(`# ${directive}`);
            }
        }
        if ( bucket.length === 0 ) {
            netWhitelist.delete('//');
        }
    }
    this.saveWhitelist();
    return true;
};

/******************************************************************************/

µBlock.arrayFromWhitelist = function(whitelist) {
    const out = new Set();
    for ( const bucket of whitelist.values() ) {
        for ( const directive of bucket ) {
            out.add(directive);
        }
    }
    return Array.from(out).sort((a, b) => a.localeCompare(b));
};

µBlock.stringFromWhitelist = function(whitelist) {
    return this.arrayFromWhitelist(whitelist).join('\n');
};

/******************************************************************************/

µBlock.whitelistFromArray = function(lines) {
    const whitelist = new Map();

    // Comment bucket must always be ready to be used.
    whitelist.set('#', []);

    // New set of directives, scrap cached data.
    directiveToRegexpMap.clear();

    for ( let line of lines ) {
        line = line.trim();

        // https://github.com/gorhill/uBlock/issues/171
        // Skip empty lines
        if ( line === '' ) { continue; }

        let key, directive;

        // Don't throw out commented out lines: user might want to fix them
        if ( line.startsWith('#') ) {
            key = '#';
            directive = line;
        }
        // Plain hostname
        else if ( line.indexOf('/') === -1 ) {
            if ( this.reWhitelistBadHostname.test(line) ) {
                key = '#';
                directive = '# ' + line;
            } else {
                key = directive = line;
            }
        }
        // Regex-based (ensure it is valid)
        else if (
            line.length > 2 &&
            line.startsWith('/') &&
            line.endsWith('/')
        ) {
            key = '//';
            directive = line;
            try {
                const re = new RegExp(directive.slice(1, -1));
                directiveToRegexpMap.set(directive, re);
            } catch(ex) {
                key = '#';
                directive = '# ' + line;
            }
        }
        // URL, possibly wildcarded: there MUST be at least one hostname
        // label (or else it would be just impossible to make an efficient
        // dict.
        else {
            const matches = this.reWhitelistHostnameExtractor.exec(line);
            if ( !matches || matches.length !== 2 ) {
                key = '#';
                directive = '# ' + line;
            } else {
                key = matches[1];
                directive = line;
            }
        }

        // https://github.com/gorhill/uBlock/issues/171
        // Skip empty keys
        if ( key === '' ) { continue; }

        // Be sure this stays fixed:
        // https://github.com/chrisaljoudi/uBlock/issues/185
        let bucket = whitelist.get(key);
        if ( bucket === undefined ) {
            bucket = [];
            whitelist.set(key, bucket);
        }
        bucket.push(directive);
    }
    return whitelist;
};

µBlock.whitelistFromString = function(s) {
    return this.whitelistFromArray(s.split('\n'));
};

// https://github.com/gorhill/uBlock/issues/3717
µBlock.reWhitelistBadHostname = /[^a-z0-9.\-_\[\]:]/;
µBlock.reWhitelistHostnameExtractor = /([a-z0-9.\-_\[\]]+)(?::[\d*]+)?\/(?:[^\x00-\x20\/]|$)[^\x00-\x20]*$/;

// end of local namespace
// *****************************************************************************

}
