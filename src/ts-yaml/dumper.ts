import {
    YamlException, Kind,
    YamlAny, YamlMap, YamlScalar, YamlSeq
}                                                   from "./common";
import * as common                                  from "./common";
import {Type}                                       from "./type";
import {Schema,KindTagMap,buildinSchema,builder}    from "./schema";
export interface Options {
    /** indentation width to use (in spaces). */
    indent?: number;
    /** when true, will not add an indentation level to array elements */
    noArrayIndent?: boolean;
    /** do not throw on invalid types (like function in the safe schema) and skip pairs and single values with such types. */
    skipInvalid?: boolean;
    /** specifies level of nesting, when to switch from block to flow style for collections. -1 means block style everwhere */
    flowLevel?: number;
    /** Each tag may have own set of styles.	- "tag" => "style" map. */
    styles?: { [x: string]: any; };
    /** specifies a schema to use. */
    schema?: Schema;
    /** if true, sort keys when dumping YAML. If a function, use the function to sort the keys. (default: false) */
    sortKeys?: boolean | ((a: any, b: any) => number);
    /** set max line width. (default: 80) */
    lineWidth?: number;
    /** if true, don't convert duplicate objects into references (default: false) */
    noRefs?: boolean;
    /** if true don't try to be compatible with older yaml versions. Currently: don't quote "yes", "no" and so on, as required for YAML 1.1 (default: false) */
    noCompatMode?: boolean;
    /**
     * if true flow sequences will be condensed, omitting the space between `key: value` or `a, b`. Eg. `'[a,b]'` or `{a:{b:c}}`.
     * Can be useful when using yaml for pretty URL query params as spaces are %-encoded. (default: false).
     */
    condenseFlow?: boolean;
}

/*eslint-disable no-use-before-define*/

const DEFAULT_FULL_SCHEMA = buildinSchema.DEFAULT_FULL;// require('./schema/default_full');
const DEFAULT_SAFE_SCHEMA = buildinSchema.DEFAULT_SAFE;// require('./schema/default_safe');

const _toString       = Object.prototype.toString;
const _hasOwnProperty = Object.prototype.hasOwnProperty;

const CHAR_TAB                  = 0x09; /* Tab */
const CHAR_LINE_FEED            = 0x0A; /* LF */
const CHAR_CARRIAGE_RETURN      = 0x0D; /* CR */
const CHAR_SPACE                = 0x20; /* Space */
const CHAR_EXCLAMATION          = 0x21; /* ! */
const CHAR_DOUBLE_QUOTE         = 0x22; /* " */
const CHAR_SHARP                = 0x23; /* # */
const CHAR_PERCENT              = 0x25; /* % */
const CHAR_AMPERSAND            = 0x26; /* & */
const CHAR_SINGLE_QUOTE         = 0x27; /* ' */
const CHAR_ASTERISK             = 0x2A; /* * */
const CHAR_COMMA                = 0x2C; /* , */
const CHAR_MINUS                = 0x2D; /* - */
const CHAR_COLON                = 0x3A; /* : */
const CHAR_EQUALS               = 0x3D; /* = */
const CHAR_GREATER_THAN         = 0x3E; /* > */
const CHAR_QUESTION             = 0x3F; /* ? */
const CHAR_COMMERCIAL_AT        = 0x40; /* @ */
const CHAR_LEFT_SQUARE_BRACKET  = 0x5B; /* [ */
const CHAR_RIGHT_SQUARE_BRACKET = 0x5D; /* ] */
const CHAR_GRAVE_ACCENT         = 0x60; /* ` */
const CHAR_LEFT_CURLY_BRACKET   = 0x7B; /* { */
const CHAR_VERTICAL_LINE        = 0x7C; /* | */
const CHAR_RIGHT_CURLY_BRACKET  = 0x7D; /* } */

const ESCAPE_SEQUENCES = {
    [0x00]   : '\\0',
    [0x07]   : '\\a',
    [0x08]   : '\\b',
    [0x09]   : '\\t',
    [0x0A]   : '\\n',
    [0x0B]   : '\\v',
    [0x0C]   : '\\f',
    [0x0D]   : '\\r',
    [0x1B]   : '\\e',
    [0x22]   : '\\"',
    [0x5C]   : '\\\\',
    [0x85]   : '\\N',
    [0xA0]   : '\\_',
    [0x2028] : '\\L',
    [0x2029] : '\\P'
};
const DEPRECATED_BOOLEANS_SYNTAX = [
    'y', 'Y', 'yes', 'Yes', 'YES', 'on', 'On', 'ON',
    'n', 'N', 'no', 'No', 'NO', 'off', 'Off', 'OFF'
];

function compileStyleMap(schema : Schema, map : {[key:string]:Type}|null) {
    var result, keys, index, length, tag, style, type;

    if (map === null) return {};

    result = {};
    keys = Object.keys(map);

    for (index = 0, length = keys.length; index < length; index += 1) {
        tag = keys[index];
        style = String(map[tag]);

        if (tag.slice(0, 2) === '!!') {
            tag = 'tag:yaml.org,2002:' + tag.slice(2);
        }
        type = schema.compiledTypeMap.get(tag, Kind.Fallback);

        if (type && _hasOwnProperty.call(type.styleAliases, style)) {
            style = type.styleAliases[style];
        }

        result[tag] = style;
    }

    return result;
}

function encodeHex(character : number):string {
    var string, handle, length;

    string = character.toString(16).toUpperCase();

    if (character <= 0xFF) {
        handle = 'x';
        length = 2;
    } else if (character <= 0xFFFF) {
        handle = 'u';
        length = 4;
    } else if (character <= 0xFFFFFFFF) {
        handle = 'U';
        length = 8;
    } else {
        throw new YamlException('code point within a string may not be greater than 0xFFFFFFFF');
    }

    return '\\' + handle + common.repeat('0', length - string.length) + string;
}

class State {
    schema              : Schema;
    indent              : number;
    noArrayIndent       : boolean;
    skipInvalid         : boolean;
    flowLevel           : number;
    styleMap            : any;
    sortKeys            : boolean | ((a: any, b: any) => number);
    lineWidth           : number;
    noRefs              : boolean;
    noCompatMode        : boolean;
    condenseFlow        : boolean;
    implicitTypes       : KindTagMap;
    explicitTypes       : KindTagMap;
    tag                 : string|null;
    result              : string;
    duplicates          : any[];
    usedDuplicates      : any;
    dump?               : any;
    constructor(options:Options) {
        this.schema        = options['schema'] || DEFAULT_FULL_SCHEMA;
        this.indent        = Math.max(1, (options['indent'] || 2));
        this.noArrayIndent = options['noArrayIndent'] || false;
        this.skipInvalid   = options['skipInvalid'] || false;
        this.flowLevel     = (!options['flowLevel'] && options['flowLevel'] != 0) ? -1 : options['flowLevel'];
        this.styleMap      = compileStyleMap(this.schema, options['styles'] || null);
        this.sortKeys      = options['sortKeys'] || false;
        this.lineWidth     = options['lineWidth'] || 80;
        this.noRefs        = options['noRefs'] || false;
        this.noCompatMode  = options['noCompatMode'] || false;
        this.condenseFlow  = options['condenseFlow'] || false;
        this.implicitTypes = this.schema.compiledImplicit;
        this.explicitTypes = this.schema.compiledExplicit;
        this.tag            = null;
        this.result         = '';
        this.duplicates     = [];
        this.usedDuplicates = null;
    }
}

// Indents every line in a string. Empty lines (\n only) are not indented.
function indentString(string, spaces) {
    var ind = common.repeat(' ', spaces),
        position = 0,
        next = -1,
        result = '',
        line,
        length = string.length;

    while (position < length) {
        next = string.indexOf('\n', position);
        if (next === -1) {
            line = string.slice(position);
            position = length;
        } else {
            line = string.slice(position, next + 1);
            position = next + 1;
        }

        if (line.length && line !== '\n') result += ind;

        result += line;
    }

    return result;
}

function generateNextLine(state : State, level : number) {
    return '\n' + common.repeat(' ', state.indent * level);
}

function testImplicitResolving(state : State, str : string): boolean {
    var index, length, type;

    for (let type of state.implicitTypes.values()) {
        if (type.resolve(str)) {
            return true;
        }
    }

    return false;
}

// [33] s-white ::= s-space | s-tab
function isWhitespace(c:number) : boolean {
    return c === CHAR_SPACE || c === CHAR_TAB;
}

// Returns true if the character can be printed without escaping.
// From YAML 1.2: "any allowed characters known to be non-printable
// should also be escaped. [However,] This isn’t mandatory"
// Derived from nb-char - \t - #x85 - #xA0 - #x2028 - #x2029.
function isPrintable(c:number) : boolean {
    return  (0x00020 <= c && c <= 0x00007E)
        || ((0x000A1 <= c && c <= 0x00D7FF) && c !== 0x2028 && c !== 0x2029)
        || ((0x0E000 <= c && c <= 0x00FFFD) && c !== 0xFEFF /* BOM */)
        ||  (0x10000 <= c && c <= 0x10FFFF);
}

// [34] ns-char ::= nb-char - s-white
// [27] nb-char ::= c-printable - b-char - c-byte-order-mark
// [26] b-char  ::= b-line-feed | b-carriage-return
// [24] b-line-feed       ::=     #xA    /* LF */
// [25] b-carriage-return ::=     #xD    /* CR */
// [3]  c-byte-order-mark ::=     #xFEFF
function isNsChar(c:number) : boolean {
    return isPrintable(c) && !isWhitespace(c)
        // byte-order-mark
        && c !== 0xFEFF
        // b-char
        && c !== CHAR_CARRIAGE_RETURN
        && c !== CHAR_LINE_FEED;
}

// Simplified test for values allowed after the first character in plain style.
function isPlainSafe(c:number, prev:number) : boolean {
    // Uses a subset of nb-char - c-flow-indicator - ":" - "#"
    // where nb-char ::= c-printable - b-char - c-byte-order-mark.
    return isPrintable(c) && c !== 0xFEFF
        // - c-flow-indicator
        && c !== CHAR_COMMA
        && c !== CHAR_LEFT_SQUARE_BRACKET
        && c !== CHAR_RIGHT_SQUARE_BRACKET
        && c !== CHAR_LEFT_CURLY_BRACKET
        && c !== CHAR_RIGHT_CURLY_BRACKET
        // - ":" - "#"
        // /* An ns-char preceding */ "#"
        && c !== CHAR_COLON
        && ((c !== CHAR_SHARP) || !!(prev && isNsChar(prev)));
}

// Simplified test for values allowed as the first character in plain style.
function isPlainSafeFirst(c:number) : boolean {
    // Uses a subset of ns-char - c-indicator
    // where ns-char = nb-char - s-white.
    return isPrintable(c) && c !== 0xFEFF
        && !isWhitespace(c) // - s-white
        // - (c-indicator ::=
        // “-” | “?” | “:” | “,” | “[” | “]” | “{” | “}”
        && c !== CHAR_MINUS
        && c !== CHAR_QUESTION
        && c !== CHAR_COLON
        && c !== CHAR_COMMA
        && c !== CHAR_LEFT_SQUARE_BRACKET
        && c !== CHAR_RIGHT_SQUARE_BRACKET
        && c !== CHAR_LEFT_CURLY_BRACKET
        && c !== CHAR_RIGHT_CURLY_BRACKET
        // | “#” | “&” | “*” | “!” | “|” | “=” | “>” | “'” | “"”
        && c !== CHAR_SHARP
        && c !== CHAR_AMPERSAND
        && c !== CHAR_ASTERISK
        && c !== CHAR_EXCLAMATION
        && c !== CHAR_VERTICAL_LINE
        && c !== CHAR_EQUALS
        && c !== CHAR_GREATER_THAN
        && c !== CHAR_SINGLE_QUOTE
        && c !== CHAR_DOUBLE_QUOTE
        // | “%” | “@” | “`”)
        && c !== CHAR_PERCENT
        && c !== CHAR_COMMERCIAL_AT
        && c !== CHAR_GRAVE_ACCENT;
}

// Determines whether block indentation indicator is required.
function needIndentIndicator(string:string) : boolean {
    var leadingSpaceRe = /^\n* /;
    return leadingSpaceRe.test(string);
}

const enum ScalarStyle {
    Plain       = 1,
    Single      = 2,
    Literal     = 3,
    Folded      = 4,
    Double      = 5
}
// Determines which scalar styles are possible and returns the preferred style.
// lineWidth = -1 => no limit.
// Pre-conditions: str.length > 0.
// Post-conditions:
//    Style.Plain or Style.Single => no \n are in the string.
//    Style.Literal => no lines are suitable for folding (or lineWidth is -1).
//    Style.Folded => a line > lineWidth and can be folded (and lineWidth != -1).
function chooseScalarStyle(string : string, singleLineOnly : boolean, indentPerLevel : number, lineWidth : number, testAmbiguousType : (s:string) =>boolean) : ScalarStyle {
    var i;
    var char, prev_char;
    var hasLineBreak = false;
    var hasFoldableLine = false; // only checked if shouldTrackWidth
    var shouldTrackWidth = lineWidth !== -1;
    var previousLineBreak = -1; // count the first line correctly
    var plain = isPlainSafeFirst(string.charCodeAt(0))
        && !isWhitespace(string.charCodeAt(string.length - 1));

    if (singleLineOnly) {
        // Case: no block styles.
        // Check for disallowed characters to rule out plain and single.
        for (i = 0; i < string.length; i++) {
            char = string.charCodeAt(i);
            if (!isPrintable(char)) {
                return ScalarStyle.Double;
            }
            prev_char = i > 0 ? string.charCodeAt(i - 1) : null;
            plain = plain && isPlainSafe(char, prev_char);
        }
    } else {
        // Case: block styles permitted.
        for (i = 0; i < string.length; i++) {
            char = string.charCodeAt(i);
            if (char === CHAR_LINE_FEED) {
                hasLineBreak = true;
                // Check if any line can be folded.
                if (shouldTrackWidth) {
                    hasFoldableLine = hasFoldableLine ||
                        // Foldable line = too long, and not more-indented.
                        (i - previousLineBreak - 1 > lineWidth &&
                            string[previousLineBreak + 1] !== ' ');
                    previousLineBreak = i;
                }
            } else if (!isPrintable(char)) {
                return ScalarStyle.Double;
            }
            prev_char = i > 0 ? string.charCodeAt(i - 1) : null;
            plain = plain && isPlainSafe(char, prev_char);
        }
        // in case the end is missing a \n
        hasFoldableLine = hasFoldableLine || (shouldTrackWidth &&
            (i - previousLineBreak - 1 > lineWidth &&
                string[previousLineBreak + 1] !== ' '));
    }
    // Although every style can represent \n without escaping, prefer block styles
    // for multiline, since they're more readable and they don't add empty lines.
    // Also prefer folding a super-long line.
    if (!hasLineBreak && !hasFoldableLine) {
        // Strings interpretable as another type have to be quoted;
        // e.g. the string 'true' vs. the boolean true.
        return plain && !testAmbiguousType(string)
            ? ScalarStyle.Plain : ScalarStyle.Single;
    }
    // Edge case: block indentation indicator can only have one digit.
    if (indentPerLevel > 9 && needIndentIndicator(string)) {
        return ScalarStyle.Double;
    }
    // At this point we know block styles are valid.
    // Prefer literal style unless we want to fold.
    return hasFoldableLine ? ScalarStyle.Folded : ScalarStyle.Literal;
}

// Note: line breaking/folding is implemented for only the folded style.
// NB. We drop the last trailing newline (if any) of a returned block scalar
//  since the dumper adds its own newline. This always works:
//    • No ending newline => unaffected; already using strip "-" chomping.
//    • Ending newline    => removed then restored.
//  Importantly, this keeps the "+" chomp indicator from gaining an extra line.
function writeScalar(state : State, string : string, level : number, iskey? : boolean) {
    state.dump = (function () {
        if (string.length === 0) {
            return "''";
        }
        if (!state.noCompatMode &&
            DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1) {
            return "'" + string + "'";
        }

        var indent = state.indent * Math.max(1, level); // no 0-indent scalars
        // As indentation gets deeper, let the width decrease monotonically
        // to the lower bound min(state.lineWidth, 40).
        // Note that this implies
        //  state.lineWidth ≤ 40 + state.indent: width is fixed at the lower bound.
        //  state.lineWidth > 40 + state.indent: width decreases until the lower bound.
        // This behaves better than a constant minimum width which disallows narrower options,
        // or an indent threshold which causes the width to suddenly increase.
        var lineWidth = state.lineWidth === -1
            ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);

        // Without knowing if keys are implicit/explicit, assume implicit for safety.
        var singleLineOnly = iskey
            // No block styles in flow mode.
            || (state.flowLevel > -1 && level >= state.flowLevel);
        function testAmbiguity(string) {
            return testImplicitResolving(state, string);
        }

        switch (chooseScalarStyle(string, singleLineOnly, state.indent, lineWidth, testAmbiguity)) {
            case ScalarStyle.Plain:
                return string;
            case ScalarStyle.Single:
                return "'" + string.replace(/'/g, "''") + "'";
            case ScalarStyle.Literal:
                return '|' + blockHeader(string, state.indent)
                    + dropEndingNewline(indentString(string, indent));
            case ScalarStyle.Folded:
                return '>' + blockHeader(string, state.indent)
                    + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
            case ScalarStyle.Double:
                return '"' + escapeString(string/*, lineWidth*/) + '"'; //TODO: Figure out why lineWidth was used previously
            default:
                throw new YamlException('impossible error: invalid scalar style');
        }
    }());
}

// Pre-conditions: string is valid for a block scalar, 1 <= indentPerLevel <= 9.
function blockHeader(string:string, indentPerLevel:number) : string {
    var indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : '';

    // note the special case: the string '\n' counts as a "trailing" empty line.
    var clip =          string[string.length - 1] === '\n';
    var keep = clip && (string[string.length - 2] === '\n' || string === '\n');
    var chomp = keep ? '+' : (clip ? '' : '-');

    return indentIndicator + chomp + '\n';
}

// (See the note for writeScalar.)
function dropEndingNewline(string:string) : string {
    return string[string.length - 1] === '\n' ? string.slice(0, -1) : string;
}

// Note: a long line without a suitable break point will exceed the width limit.
// Pre-conditions: every char in str isPrintable, str.length > 0, width > 0.
function foldString(string:string, width:number) {
    // In folded style, $k$ consecutive newlines output as $k+1$ newlines—
    // unless they're before or after a more-indented line, or at the very
    // beginning or end, in which case $k$ maps to $k$.
    // Therefore, parse each chunk as newline(s) followed by a content line.
    var lineRe = /(\n+)([^\n]*)/g;

    // first line (possibly an empty line)
    var result = (function () {
        var nextLF = string.indexOf('\n');
        nextLF = nextLF !== -1 ? nextLF : string.length;
        lineRe.lastIndex = nextLF;
        return foldLine(string.slice(0, nextLF), width);
    }());
    // If we haven't reached the first content line yet, don't add an extra \n.
    var prevMoreIndented = string[0] === '\n' || string[0] === ' ';
    var moreIndented;

    // rest of the lines
    var match;
    while ((match = lineRe.exec(string))) {
        var prefix = match[1], line = match[2];
        moreIndented = (line[0] === ' ');
        result += prefix
            + (!prevMoreIndented && !moreIndented && line !== ''
                ? '\n' : '')
            + foldLine(line, width);
        prevMoreIndented = moreIndented;
    }

    return result;
}

// Greedy line breaking.
// Picks the longest line under the limit each time,
// otherwise settles for the shortest line over the limit.
// NB. More-indented lines *cannot* be folded, as that would add an extra \n.
function foldLine(line:string, width:number) {
    if (line === '' || line[0] === ' ') return line;

    // Since a more-indented line adds a \n, breaks can't be followed by a space.
    var breakRe = / [^ ]/g; // note: the match index will always be <= length-2.
    var match;
    // start is an inclusive index. end, curr, and next are exclusive.
    var start = 0, end, curr = 0, next = 0;
    var result = '';

    // Invariants: 0 <= start <= length-1.
    //   0 <= curr <= next <= max(0, length-2). curr - start <= width.
    // Inside the loop:
    //   A match implies length >= 2, so curr and next are <= length-2.
    while ((match = breakRe.exec(line))) {
        next = match.index;
        // maintain invariant: curr - start <= width
        if (next - start > width) {
            end = (curr > start) ? curr : next; // derive end <= length-2
            result += '\n' + line.slice(start, end);
            // skip the space that was output as \n
            start = end + 1;                    // derive start <= length-1
        }
        curr = next;
    }

    // By the invariants, start <= length-1, so there is something left over.
    // It is either the whole string or a part starting from non-whitespace.
    result += '\n';
    // Insert a break if the remainder is too long and there is a break available.
    if (line.length - start > width && curr > start) {
        result += line.slice(start, curr) + '\n' + line.slice(curr + 1);
    } else {
        result += line.slice(start);
    }

    return result.slice(1); // drop extra \n joiner
}

// Escapes a double-quoted string.
function escapeString(string : string) : string {
    var result = '';
    var char, nextChar;
    var escapeSeq;

    for (var i = 0; i < string.length; i++) {
        char = string.charCodeAt(i);
        // Check for surrogate pairs (reference Unicode 3.0 section "3.7 Surrogates").
        if (char >= 0xD800 && char <= 0xDBFF/* high surrogate */) {
            nextChar = string.charCodeAt(i + 1);
            if (nextChar >= 0xDC00 && nextChar <= 0xDFFF/* low surrogate */) {
                // Combine the surrogate pair and store it escaped.
                result += encodeHex((char - 0xD800) * 0x400 + nextChar - 0xDC00 + 0x10000);
                // Advance index one extra since we already used that char here.
                i++; continue;
            }
        }
        escapeSeq = ESCAPE_SEQUENCES[char];
        result += !escapeSeq && isPrintable(char)
            ? string[i]
            : escapeSeq || encodeHex(char);
    }

    return result;
}

function writeFlowSequence(state : State, level : number, object : any) {
    var _result = '',
        _tag    = state.tag,
        index,
        length;

    for (index = 0, length = object.length; index < length; index += 1) {
        // Write only valid elements.
        if (writeNode(state, level, object[index], false, false)) {
            if (index !== 0) _result += ',' + (!state.condenseFlow ? ' ' : '');
            _result += state.dump;
        }
    }

    state.tag = _tag;
    state.dump = '[' + _result + ']';
}

function writeBlockSequence(state : State, level : number, object : any, compact : boolean) {
    var _result = '',
        _tag    = state.tag,
        index,
        length;

    for (index = 0, length = object.length; index < length; index += 1) {
        // Write only valid elements.
        if (writeNode(state, level + 1, object[index], true, true)) {
            if (!compact || index !== 0) {
                _result += generateNextLine(state, level);
            }

            if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
                _result += '-';
            } else {
                _result += '- ';
            }

            _result += state.dump;
        }
    }

    state.tag = _tag;
    state.dump = _result || '[]'; // Empty sequence if no valid values.
}

function writeFlowMapping(state : State, level : number, object: any) {
    var _result       = '',
        _tag          = state.tag,
        objectKeyList = Object.keys(object),
        index,
        length,
        objectKey,
        objectValue,
        pairBuffer;

    for (index = 0, length = objectKeyList.length; index < length; index += 1) {

        pairBuffer = '';
        if (index !== 0) pairBuffer += ', ';

        if (state.condenseFlow) pairBuffer += '"';

        objectKey = objectKeyList[index];
        objectValue = object[objectKey];

        if (!writeNode(state, level, objectKey, false, false)) {
            continue; // Skip this pair because of invalid key;
        }

        if (state.dump.length > 1024) pairBuffer += '? ';

        pairBuffer += state.dump + (state.condenseFlow ? '"' : '') + ':' + (state.condenseFlow ? '' : ' ');

        if (!writeNode(state, level, objectValue, false, false)) {
            continue; // Skip this pair because of invalid value.
        }

        pairBuffer += state.dump;

        // Both key and value are valid.
        _result += pairBuffer;
    }

    state.tag = _tag;
    state.dump = '{' + _result + '}';
}

function writeBlockMapping(state : State, level : number, object : any, compact : boolean) {
    var _result       = '',
        _tag          = state.tag,
        objectKeyList = Object.keys(object),
        index,
        length,
        objectKey,
        objectValue,
        explicitPair,
        pairBuffer;

    // Allow sorting keys so that the output file is deterministic
    if (state.sortKeys === true) {
        // Default sorting
        objectKeyList.sort();
    } else if (typeof state.sortKeys === 'function') {
        // Custom sort function
        objectKeyList.sort(state.sortKeys);
    } else if (state.sortKeys) {
        // Something is wrong
        throw new YamlException('sortKeys must be a boolean or a function');
    }

    for (index = 0, length = objectKeyList.length; index < length; index += 1) {
        pairBuffer = '';

        if (!compact || index !== 0) {
            pairBuffer += generateNextLine(state, level);
        }

        objectKey = objectKeyList[index];
        objectValue = object[objectKey];

        if (!writeNode(state, level + 1, objectKey, true, true, true)) {
            continue; // Skip this pair because of invalid key.
        }

        explicitPair = (state.tag !== null && state.tag !== '?') ||
            (state.dump && state.dump.length > 1024);

        if (explicitPair) {
            if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
                pairBuffer += '?';
            } else {
                pairBuffer += '? ';
            }
        }

        pairBuffer += state.dump;

        if (explicitPair) {
            pairBuffer += generateNextLine(state, level);
        }

        if (!writeNode(state, level + 1, objectValue, true, explicitPair)) {
            continue; // Skip this pair because of invalid value.
        }

        if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
            pairBuffer += ':';
        } else {
            pairBuffer += ': ';
        }

        pairBuffer += state.dump;

        // Both key and value are valid.
        _result += pairBuffer;
    }

    state.tag = _tag;
    state.dump = _result || '{}'; // Empty mapping if no valid pairs.
}

function detectType(state : State, object : any, explicit : boolean) {
    var typeList : KindTagMap,  style : string, matchedType : Type|null;

    typeList = explicit ? state.explicitTypes : state.implicitTypes;

    matchedType = explicit && builder.getYamlType(object) || null;

    if (!matchedType) {
        for (let type of typeList.values()) {
            if ((type.instanceOf || type.predicate) &&
                (!type.instanceOf || ((typeof object === 'object') && (object instanceof type.instanceOf))) &&
                (!type.predicate || type.predicate(object))) {
                matchedType = type;
            }
        }
    } else {
        // in this situation, this check is pretty useless.
        if (matchedType.predicate && !matchedType.predicate(object)) {
            matchedType = null;
        }
    }

    if (matchedType) {
        let _result : any;
        state.tag = explicit ? matchedType.tag : '?';

        if (matchedType.represent) {
            style = state.styleMap[matchedType.tag] || matchedType.defaultStyle;

            if (_toString.call(matchedType.represent) === '[object Function]') {
                _result = (matchedType.represent as ((data: any, style?: string) => any))(object, style);
            } else if (_hasOwnProperty.call(matchedType.represent, style)) {
                _result = matchedType.represent![style](object, style);
            } else {
                throw new YamlException('!<' + matchedType.tag + '> tag resolver accepts not "' + style + '" style');
            }

            state.dump = _result;
        }

        return true;
    }

    return false;
}

// Serializes `object` and writes it to global `result`.
// Returns true on success, or false on invalid object.
//
function writeNode(state : State, level : number, object : any, block : boolean, compact : boolean, iskey? : boolean) {
    state.tag = null;
    state.dump = object;

    if (!detectType(state, object, false)) {
        detectType(state, object, true);
    }

    var type = _toString.call(state.dump);

    if (block) {
        block = (state.flowLevel < 0 || state.flowLevel > level);
    }

    var objectOrArray = type === '[object Object]' || type === '[object Array]',
        duplicateIndex,
        duplicate;

    if (objectOrArray) {
        duplicateIndex = state.duplicates.indexOf(object);
        duplicate = duplicateIndex !== -1;
    }

    if ((state.tag !== null && state.tag !== '?') || duplicate || (state.indent !== 2 && level > 0)) {
        compact = false;
    }

    if (duplicate && state.usedDuplicates[duplicateIndex]) {
        state.dump = '*ref_' + duplicateIndex;
    } else {
        if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) {
            state.usedDuplicates[duplicateIndex] = true;
        }
        if (type === '[object Object]') {
            if (block && (Object.keys(state.dump).length !== 0)) {
                writeBlockMapping(state, level, state.dump, compact);
                if (duplicate) {
                    state.dump = '&ref_' + duplicateIndex + state.dump;
                }
            } else {
                writeFlowMapping(state, level, state.dump);
                if (duplicate) {
                    state.dump = '&ref_' + duplicateIndex + ' ' + state.dump;
                }
            }
        } else if (type === '[object Array]') {
            var arrayLevel = (state.noArrayIndent && (level > 0)) ? level - 1 : level;
            if (block && (state.dump.length !== 0)) {
                writeBlockSequence(state, arrayLevel, state.dump, compact);
                if (duplicate) {
                    state.dump = '&ref_' + duplicateIndex + state.dump;
                }
            } else {
                writeFlowSequence(state, arrayLevel, state.dump);
                if (duplicate) {
                    state.dump = '&ref_' + duplicateIndex + ' ' + state.dump;
                }
            }
        } else if (type === '[object String]') {
            if (state.tag !== '?') {
                writeScalar(state, state.dump as string, level, iskey);
            }
        } else {
            if (state.skipInvalid) return false;
            throw new YamlException('unacceptable kind of an object to dump ' + type);
        }

        if (state.tag !== null && state.tag !== '?') {
            state.dump = '!<' + state.tag + '> ' + state.dump;
        }
    }

    return true;
}

function getDuplicateReferences(object : any, state : State) {
    var objects = [],
        duplicatesIndexes = [],
        index,
        length;

    inspectNode(object, objects, duplicatesIndexes);

    for (index = 0, length = duplicatesIndexes.length; index < length; index += 1) {
        state.duplicates.push(objects[duplicatesIndexes[index]]);
    }
    state.usedDuplicates = new Array(length);
}

function inspectNode(object : any , objects : any[], duplicatesIndexes : any[]) {
    var objectKeyList,
        index,
        length;

    if (object !== null && typeof object === 'object') {
        index = objects.indexOf(object);
        if (index !== -1) {
            if (duplicatesIndexes.indexOf(index) === -1) {
                duplicatesIndexes.push(index);
            }
        } else {
            objects.push(object);

            if (Array.isArray(object)) {
                for (index = 0, length = object.length; index < length; index += 1) {
                    inspectNode(object[index], objects, duplicatesIndexes);
                }
            } else {
                objectKeyList = Object.keys(object);

                for (index = 0, length = objectKeyList.length; index < length; index += 1) {
                    inspectNode(object[objectKeyList[index]], objects, duplicatesIndexes);
                }
            }
        }
    }
}

export function dump(input : any, options? : Options) {
    options = options || {};

    var state = new State(options);

    if (!state.noRefs) getDuplicateReferences(input, state);

    if (writeNode(state, 0, input, true, true)) return state.dump + '\n';

    return '';
}

export function safeDump(input : any, options? : Options) {
    return dump(input, { schema: DEFAULT_SAFE_SCHEMA,... options});
}

