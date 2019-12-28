import {
    YamlException, Kind, TagWithKind, Tag,
    makeTagWithKind, isTag, isTagURI, isTagHandle
} from "../common";
import * as common                          from "../common";
import {Type,TypeArrayable}                 from "../type";
//import * as schemaBuiltIns                  from "./common";

export type SchemaArrayable         = Iterable<Schema>|Schema;
export type SchemaOrTypeArrayable   = TypeArrayable|SchemaArrayable;

export class KindTagMap extends Map<TagWithKind, Type> {
    private _set : Set<Type> = new Set();

    constructor(... items : (KindTagMap|Type|Iterable<KindTagMap|Type>)[]) {
        super();
        for (let item of items) {
            if (typeof item === 'object') {
                if (item instanceof KindTagMap) {
                    this.add(item);
                } else if (item instanceof Type) {
                    this.add(item);
                } else if (Symbol.iterator in item) {
                    for (let innerItem of item) {
                        if (innerItem instanceof KindTagMap) {
                            this.add(innerItem);
                        } else if (innerItem instanceof Type) {
                            this.add(innerItem);
                        } else {
                            throw new YamlException('KindTagMap.constructor: Value in iterator must be KindTagMap|Type.');
                        }
                    }
                } else {
                    throw new YamlException('KindTagMap.constructor: Value in iterator must be KindTagMap|Type.');
                }
            } else {
                throw new YamlException('KindTagMap.constructor: Value must be KindTagMap|Type or iterator thereof.');
            }
        }
    }

    delete(key: Tag, kind : Kind): boolean;
    delete(key: TagWithKind): boolean;
    delete(tag: Tag|TagWithKind, kind? : Kind): boolean {
        if (isTag(tag)) {
            if (kind) {
                return super.delete(makeTagWithKind(kind, tag));
            }
        } else if (typeof tag === 'string' && !kind) {
            return super.delete(tag);
        }
        throw new YamlException(`KindTagMap: tag/kind parameters not valid. (${tag}, ${kind}, ${isTag(tag)})`);
    }

    has(key: Tag, kind : Kind): boolean;
    has(key: TagWithKind): boolean;
    has(tag: Tag|TagWithKind, kind? : Kind): boolean {
        if (isTag(tag)) {
            if (kind) {
                //console.log(`Tag+Kind: ${tag} ${kind} --> ${makeTagWithKind(kind, tag)} ${super.has(makeTagWithKind(kind, tag))}`);
                return super.has(makeTagWithKind(kind, tag));
            }
        } else if (typeof tag === 'string' && !kind) {
            //console.log(`TagWithKind:  ${tag} -- ${super.has(tag)}`);
            return super.has(tag);
        }
        throw new YamlException(`KindTagMap: tag/kind parameters not valid. cccc (${tag}, ${kind}, ${isTag(tag)}, ${isTagURI(tag)}, ${isTagHandle(tag)})`);
    }

    get(key: Tag, kind : Kind): Type;
    get(key: TagWithKind): Type;
    get(tag: Tag|TagWithKind, kind? : Kind): Type|undefined {
        if (isTag(tag)) {
            if (kind) {
                return super.get(makeTagWithKind(kind, tag));
            }
        } else if (typeof tag === 'string' && !kind) {
            return super.get(tag);
        }
        throw new YamlException(`KindTagMap: tag/kind parameters not valid. (${tag}, ${kind}, ${isTag(tag)})`);
    }

    add(t: Type, fallback? : boolean);
    add(t: KindTagMap);
    add(t: Type|KindTagMap, fallback? : boolean): this {
        if (typeof t === 'object') {
            if (t instanceof  Type) {
                //console.info(`Add: ${t.resolvedTag} ${t.fallbackTag}`);
                this._set.add(t);
                super.set(t.resolvedTag, t);
                super.set(t.fallbackTag, t);
            } else if (t instanceof KindTagMap) {
                t.forEachType(type =>
                    this.add(type)
                )
            }
        }
        return this;
    }

    forEachType(callbackfn: (value: Type) => void, thisArg?: any): void {
        this._set.forEach(x =>callbackfn.call(thisArg, x));
    }

    toString (full?:boolean) {
        return 'SchemaMap(\n' + Array.from(this._set).map(elem => `${elem}`).join('\n') + '\n)';
    }
}

export class Schema {
    static create (schemaOrTypes : SchemaArrayable, types : TypeArrayable);
    static create (schemaOrTypes : TypeArrayable);
    static create (schemaOrTypes : SchemaOrTypeArrayable, argtypes? : TypeArrayable) {
        var schemas : Schema[], types : Type[];

        if (schemaOrTypes && argtypes) {
            schemas = common.toArray(schemaOrTypes as SchemaArrayable);
            types = common.toArray(argtypes);
        } else if (schemaOrTypes && !argtypes) {
            schemas = common.toArray([]);
            types = common.toArray(schemaOrTypes as TypeArrayable);
        } else {
            throw new YamlException('Bad argument combination.');
        }
        /*
        if (!schemas.every(function (schema) { return schema instanceof Schema; })) {
            throw new YamlException('Specified list of super schemas (or a single Schema object) contains a non-Schema object.');
        }

        if (!types.every(function (type) { return type instanceof Type; })) {
            throw new YamlException('Specified list of YAML types (or a single Type object) contains a non-Type object.');
        }
        */

        return new Schema({
            include: schemas,
            explicit: types
        });
    }

    readonly implicit            : Type[];
    readonly explicit            : Type[];
    readonly include             : Schema[];
    readonly compiledImplicit    : KindTagMap;
    readonly compiledExplicit    : KindTagMap;
    readonly compiledTypeMap     : KindTagMap;

    private _mergeInplace (input : KindTagMap, imported : KindTagMap[]) {
        for (let inc of imported.values()) {
            for (let [key, value] of inc.entries()) {
                if (!input.has(key)) {
                    input.add(value);
                }
            }
        }
    }

    constructor(definition : Schema.SchemaDefinition) {
        this.include  = definition.include  || [];
        this.implicit = definition.implicit || [];
        this.explicit = definition.explicit || [];

        this.implicit.forEach(function (type) {
            if (type.kind && type.kind !== 'scalar') {
                throw new YamlException('There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.');
            }
        });

        this.compiledImplicit = new KindTagMap(this.implicit);
        this.compiledExplicit = new KindTagMap(this.explicit);
        this._mergeInplace(this.compiledImplicit, this.include.map(v => v.compiledImplicit));
        this._mergeInplace(this.compiledExplicit, this.include.map(v => v.compiledExplicit));
        this.compiledTypeMap = new KindTagMap(this.compiledImplicit,this.compiledExplicit);
    }

    get (lookup : TagWithKind) : Type|null {
        let rc = this.compiledTypeMap.get(lookup);
        return rc ? rc : null;
    }

    has (lookup : TagWithKind) {
        return this.compiledTypeMap.has(lookup);
    }

    toString (full?:boolean) {
        return `Schema(\n${this.compiledTypeMap}\n)`;
    }
}

export namespace Schema {
    export interface SchemaDefinition {
        implicit?: any[];
        explicit?: Type[];
        include?: Schema[];
    }
}
