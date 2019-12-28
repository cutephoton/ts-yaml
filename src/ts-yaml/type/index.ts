import {Schema} from "../schema";
import {Kind, makeTag, makeTagWithKind, Tag, TagWithKind, YamlAny} from "../common";

export type TypeArrayable = Iterable<Schema>|Schema;

function compileStyleAliases(map:{ [x: string]: any; }|null) : { [x: string]: any; } {
    var result : { [x: string]: any; } = {};

    if (map !== null) {
        Object.keys(map).forEach(function (style) {
            map[style].forEach(function (alias) {
                result[String(alias)] = style;
            });
        });
    }

    return result;
}

export class Type {
    readonly kind           : Kind;
    readonly tag            : Tag;
    readonly resolvedTag    : TagWithKind;
    readonly fallbackTag    : TagWithKind;
    readonly resolve        : (data: any) => boolean;
    readonly construct      : (data: any) => any;
    readonly instanceOf?    : any | null;
    readonly predicate?     : ((data: any) => boolean) | null;
    readonly represent?     : ((data: any,style?:string) => any) | { [x: string]: (data: object, style? : string) => any } | null;
    readonly defaultStyle?  : string | null;
    readonly styleAliases?  : { [x: string]: any; };

    constructor(
        tag : Tag|string,
        options : TypeOptions
    ) {
        this.tag          = makeTag(tag);
        this.kind         = options.kind || Kind.Fallback;
        this.resolvedTag  = makeTagWithKind(this.kind, this.tag);
        this.fallbackTag  = makeTagWithKind(Kind.Fallback, this.tag);
        this.resolve      = options.resolve      || function () { return true; };
        this.construct    = options.construct    || function (data) { return data; };
        this.instanceOf   = options.instanceOf   || null;
        this.predicate    = options.predicate    || null;
        this.represent    = options.represent    || null;
        this.defaultStyle = options.defaultStyle || null;
        this.styleAliases = compileStyleAliases(options.styleAliases || null);
    }

    toString (): string {
        return `Type(${this.tag} is a ${this.kind})`;
    }
}

export interface TypeOptions {
    kind?: Kind|null;
    resolve?: ((data: any) => boolean) | null;
    construct?: ((data: any) => any) | null;
    instanceOf?: object| null;
    predicate?: ((data: any) => boolean) | null;
    represent?: ((data: any,style?:string) => any) | { [x: string]: (data: any) => any } | null;
    defaultStyle?: string| null;
    styleAliases?: { [x: string]: any; }| null;
}

export interface State {
    kind?:          Kind;
    yaml?:          YamlAny;
    object?:        any;
    error?:         string;
}

export namespace wellknown {
    export const Float         = 'tag:yaml.org,2002:float';
    export const Int           = 'tag:yaml.org,2002:int';
    export const Set           = 'tag:yaml.org,2002:set';
    export const Map           = 'tag:yaml.org,2002:map';
    export const Seq           = 'tag:yaml.org,2002:seq';
    export const OMap          = 'tag:yaml.org,2002:omap';
    export const Null          = 'tag:yaml.org,2002:null';
    export const Bool          = 'tag:yaml.org,2002:bool';
    export const Binary        = 'tag:yaml.org,2002:binary';
    export const Pairs         = 'tag:yaml.org,2002:pairs';
    export const Str           = 'tag:yaml.org,2002:str';
    export const Timestamp     = 'tag:yaml.org,2002:timestamp';
    export const Merge         = 'tag:yaml.org,2002:merge';
}
