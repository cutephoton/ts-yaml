import {Schema} from "./schema";

export enum Kind {
    Sequence= "sequence", Mapping = "mapping", Scalar = "scalar", Fallback = "fallback"
}

const PATTERN_TAG_HANDLE            = /^(?:!|!!|![a-z\-]+!)$/i;
const PATTERN_TAG_URI               = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;
const RE_TAG_PARTS                  = /^tag:(([^,:]+)(?:,((?:\d\d\d\d)(?:-(?:\d\d(?:-\d\d)?)?)?))?):([^#]+)?(#.*)?/;
const YamlType                      : unique symbol = Symbol('[[YamlType]]');
// Need to conform to these specs:
//      https://tools.ietf.org/html/rfc4151 (tag)
//      https://tools.ietf.org/html/rfc3986 (uri)
//      https://tools.ietf.org/html/rfc1035 (domain)


//---------------------------------------------------------------------------
// ---- Types ---------------------------------------------------------------

// Branded Tag Strings
//    branded strings to provide context to developers for what a string means
export type TagWithKind     = string & {__TAG__     : "TagWithKind"};
export type Tag             = string & {__TAG__     : "Tag"};
export type TagURI          = Tag    & {__STYLE__   : "URI"};
export type TagHandle       = Tag    & {__STYLE__   : "HANDLE"};
export interface TagParts {
    authority       : string;
    authorityName   : string;
    authorityDate?  : string;
    specific?       : string;
    fragment?       : string;
}

// These types don't actually exist...
//    They are used as placeholders to avoid moving data around unexpectedly.
//    In effect, the basic YAML types are branded so it's clear what is/is not
//    decoded. However I have yet to start using these types.
export type YamlMap         = {[key : string]: any} &
                                          { [YamlType] : Kind.Mapping};
export type YamlSeq         = any[]     & { [YamlType] : Kind.Sequence};
export type YamlScalar      = string    & { [YamlType] : Kind.Mapping};
export type YamlAny         = YamlMap|YamlSeq|YamlScalar;

// Lots of maps used! :)
export type SimpleMap<T>    = {[key : string]: T};
export type SetLike<T>      = Set<T>|Array<T>;
export type MapLike<T>      = Map<string,T>|{[key : string]: T};

// Used to decode array/iterator/scalar types.
export type IterScalarType<T> =
    T extends Iterable<infer U> ? U :
        T;

export type ArrayScalarType<T> =
    T extends Array<infer U> ? U :
        T;

export type ArrayIterScalarType<T> =
    T extends Array<infer U> ? U :
        T extends Iterable<infer U> ? U :
            T;

//---------------------------------------------------------------------------
// ---- Tag Functions -------------------------------------------------------

export function makeTagWithKind(kind:Kind,tag:Tag) : TagWithKind {
    return `[${kind}]${tag}` as TagWithKind;
}

export function makeTag(tag:string) : Tag {
    return tag as Tag;
}

export function makeTagURI (tag:string) : TagURI {
    return tag as TagURI;
}

export function isTag(tag:undefined|null|string|Tag) : tag is Tag {
    return typeof tag === 'string' && (PATTERN_TAG_URI.test(tag) || PATTERN_TAG_HANDLE.test(tag));
}

export function isTagURI(tag:undefined|null|string|Tag) : tag is TagURI {
    return typeof tag === 'string' && PATTERN_TAG_URI.test(tag);
}

export function isTagHandle(tag:undefined|null|string|Tag) : tag is TagHandle {
    return typeof tag === 'string' && PATTERN_TAG_HANDLE.test(tag);
}

export function tagURIParts ( uri : TagURI ) : TagParts|null {
    let m = uri.match(RE_TAG_PARTS);
    return !m ? null : {
        authority:      m[1],
        authorityName:  m[2],
        authorityDate:  m[3],
        specific:       m[4],
        fragment:       m[5],
    };
}

//---------------------------------------------------------------------------
// ---- YAML Virtual Types --------------------------------------------------

export function isYamlScalar(v:any) : v is YamlScalar {
    return typeof v === 'string';
}
export function isYamlSeq(v:any) : v is YamlSeq {
    return v && Array.isArray(v);
}
export function isYamlMap(v:any) : v is YamlMap {
    return typeof v === 'object' && v !== null;
}

//---------------------------------------------------------------------------
// ---- Utilities -----------------------------------------------------------

export function isNothing(subject) : subject is undefined {
    return (typeof subject === 'undefined') || (subject === null);
}

export function isObject<T>(subject:T|any): subject is T {
    return (typeof subject === 'object') && (subject !== null);
}

function isIterable<T extends Iterable<T>> (subject: T|any): subject is T {
    return (typeof subject === 'object') && Symbol.iterator in subject;
}

export function toArray<T extends Iterable<any>|any,U=IterScalarType<T>>(sequence:T) : U[] {
    if (isIterable(sequence)) {
        return Array.from(sequence);
    } else if (isObject(sequence)) {
        return [ sequence ] as any as U[];
    }
    return [];
}

export function isNegativeZero(number:number) {
    return (number === 0) && (Number.NEGATIVE_INFINITY === 1 / number);
}
export function repeat(str : string, count:number) {
    return ''.padStart(count, str);
}

//---------------------------------------------------------------------------
// ---- Common Classes: Exception & Mark ------------------------------------
export class YamlException extends Error {
    readonly reason         : string;
    readonly mark?          : Mark;
    constructor (reason : string, mark? : Mark) {
        super();

        this.name       = 'YamlException';
        this.reason     = reason;
        this.mark       = mark;
        this.message    = (this.reason || '(unknown reason)') + (this.mark ? ' ' + this.mark.toString() : '');
        //... why is this needed?
        /*
        // Include stack trace in error object
        if (Error.captureStackTrace) {
            // Chrome and NodeJS
            Error.captureStackTrace(this, this.constructor);
        } else {
            // FF, IE 10+ and Safari 6+. Fallback for others
            this.stack = (new Error()).stack || '';
        }

         */
    }
    toString(compact) {
        var result = this.name + ': ';

        result += this.reason || '(unknown reason)';

        if (!compact && this.mark) {
            result += ' ' + this.mark.toString();
        }

        return result;
    };
}

export class Mark {
    constructor (
        readonly name : string|null,
        readonly buffer : string|null,
        readonly position : number,
        readonly line : number,
        readonly column : number
    ){}
    getSnippet (indent? : number, maxLength? : number) : string|null {
        var head, start, tail, end, snippet;

        if (!this.buffer) return null;

        indent = indent || 4;
        maxLength = maxLength || 75;

        head = '';
        start = this.position;

        while (start > 0 && '\x00\r\n\x85\u2028\u2029'.indexOf(this.buffer.charAt(start - 1)) === -1) {
            start -= 1;
            if (this.position - start > (maxLength / 2 - 1)) {
                head = ' ... ';
                start += 5;
                break;
            }
        }

        tail = '';
        end = this.position;

        while (end < this.buffer.length && '\x00\r\n\x85\u2028\u2029'.indexOf(this.buffer.charAt(end)) === -1) {
            end += 1;
            if (end - this.position > (maxLength / 2 - 1)) {
                tail = ' ... ';
                end -= 5;
                break;
            }
        }

        snippet = this.buffer.slice(start, end);

        return ''.padStart(indent,' ') + head + snippet + tail + '\n' +
            ''.padStart(indent + this.position - start + head.length,' ') + '^';
    }
    toString(compact?:boolean) {
        var snippet, where = '';

        if (this.name) {
            where += 'in "' + this.name + '" ';
        }

        where += 'at line ' + (this.line + 1) + ', column ' + (this.column + 1);

        if (!compact) {
            snippet = this.getSnippet();

            if (snippet) {
                where += ':\n' + snippet;
            }
        }

        return where;
    }
}

export interface BufferInfo {
    uri         : string|null;
}
export interface Buffer extends BufferInfo {
    content     : string;
}

/*
export class Report implements Report.Details {
    readonly document               : YamlDocument;
    readonly message                : string;
    readonly mark?                  : Mark;
    readonly classification?        : Report.Classification;
    readonly severity?              : Report.Severity;

    constructor (info:Report.Details);
    constructor (document:YamlDocument, message : string, mark? : Mark, severity? : Report.Severity, classification? : Report.Classification);
    constructor(
        documentOrReport:YamlDocument|Report.Details, message? : string, mark? : Mark, severity? : Report.Severity, classification? : Report.Classification
    ) {
        if (YamlDocument.isDocument(documentOrReport)) {
            if (!message) {
                throw new TypeError('Long constructor was missing message.');
            }
            this.document           = documentOrReport;
            this.message            = message;
            this.mark               = mark;
            this.classification     = classification                        || Report.Classification.General;
            this.severity           = severity                              || Report.Severity.Fatal;
        } else if (Report.isDetail(documentOrReport)) {
            this.document           = documentOrReport.document;
            this.message            = documentOrReport.message;
            this.mark               = documentOrReport.mark;
            this.classification     = documentOrReport.classification       || Report.Classification.General;
            this.severity           = documentOrReport.severity             || Report.Severity.Fatal;
        } else {
            throw new TypeError('Unable to decode parameters to Report.');
        }
    }

    toString (compact? : boolean) {
        return `Report(${this.message})`;
    }
}
export namespace Report {
    export enum Classification {
        General= 1,
        Syntax,
        Decoding,
        Encoding,
    }

    export enum Severity {
        Info = 1,
        Warning,
        Fatal,
    }

    export interface Details {
        readonly document               : YamlDocument;
        readonly message                : string;
        readonly mark?                  : Mark;
        readonly severity?              : Severity;
        readonly classification?        : Classification;
    }

    export function isDetail (obj : any|Details) : obj is Details {
        return (typeof obj === 'object' && 'document' in obj && 'message' in obj);
    }
}

export interface YamlListener {
    onReport?       (report : Report);
    onLoaded?       (document : YamlDocument);
    onSaved?        (document : YamlDocument);
    onError?        (document : YamlDocument, exception : YamlException);
}

 */

/*
export function extend(target, source) {
    var index, length, key, sourceKeys;

    if (source) {
        sourceKeys = Object.keys(source);

        for (index = 0, length = sourceKeys.length; index < length; index += 1) {
            key = sourceKeys[index];
            target[key] = source[key];
        }
    }

    return target;
}

*/
