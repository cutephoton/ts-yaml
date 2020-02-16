import {Type, TypeOptions} from "../type";
import {iterConcat, JsType, Kind, SimpleMap, Tag, TagURI} from "../common";
import {
    ConstructFunc,
    PredicateFunc,
    RepresentFunc,
    RepresentStyleFunc,
    ResolveFunc
} from "../type/type";
import {Schema} from "./schema";

export class TypeBuilderError extends TypeError {
    constructor(readonly target : any, readonly reason : string) {
        super(
            typeof target === 'function' ?
                `Class '${target.name}': ${reason}` :
                `Class <invalid>: ${reason}`
        );//throw new TypeError(`Target does not appear to be a valid class. Prototype constructor does not match target.`);
        this.name = 'ClassTypeError';
    }
}

const gPropertyBlacklist = new Set([
    'toString',
    'constructor',
    'prototype',
    'caller',
    ''
]);

export const YamlType                   : unique symbol = Symbol('yaml.Type');
export const YamlConstruct              : unique symbol = Symbol('yaml.YamlConstruct');
export const YamlApply                  : unique symbol = Symbol('yaml.YamlApply');
export const YamlRepresent              : unique symbol = Symbol('yaml.YamlRepresent');
export const YamlResolve                : unique symbol = Symbol('yaml.YamlResolve');
export const YamlPredicate              : unique symbol = Symbol('yaml.YamlPredicate');
const        YamlBuilderState           : unique symbol = Symbol('yaml.YamlFieldSet');

type AnyConstructor<T>                  = {new(...args:any[]): T};

interface YamlishConstructor<T extends YamlishInstance>  {
    new(...args:any[])      : T;
    [YamlType]?             : Type;
    [YamlResolve]?          : ResolveFunc;
    [YamlConstruct]?        : ConstructFunc;
    [YamlPredicate]?        : PredicateFunc;
    [YamlRepresent]?        : RepresentFunc;
    [YamlBuilderState]?     : DecoratorCollector<any>;
}

interface YamlishInstance {
    [YamlRepresent]?        : InstRepresentFunc;
    [YamlApply]?            : ApplyFunc;
    [YamlPredicate]?        : InstPredicateFunc;
    [YamlType]?             : Type;
}

export type ApplyFunc                   = (data:any)=>void;
export type ValidateFunc                = (target:any,data:any)=>void;
export type InstPredicateFunc           = (() => boolean);
export type InstRepresentFunc           = (style?:string)=>any;
export type PropertyApply               = ((target:any, value:any) => void);
export type DefaultValueGenerator       = () => any;

export interface TypeBuilderOptions extends TypeOptions{
    tag?                                : Tag;
    baseTagURI?                         : TagURI;
    assignTypeSymbol?                   : boolean;
    skipConstructor?                    : boolean;
    properties?                         : Set<string|number|PropertyDetail>;
    blacklist?                          : Set<PropertyKey>;
    blacklistPrefix?                    : string;
    permitUnknownProperties?            : boolean;
    ignoreBlacklistDefault?             : boolean;
    noImplicitConstructorCheck?         : boolean;
    allowFunctionAssignment?            : boolean;
    includeImplicitProperties?          : boolean;
}

export interface PropertyDetail {
    key                                 : PropertyKey;
    yamlApply?                          : boolean|PropertyApply;
    defaultValue?                       : any|DefaultValueGenerator;
    yamlKey?                            : string|number;
    priority?                           : number;
    validateYamlValue?                  : ValidateFunc;
    validateObjectValue?                : ValidateFunc;
}/*
export interface PropertyValidation {
    mustBeInstanceOf                    : AnyConstructor<any>;
    distinctValue                       : Set<any>;
}*/

function tagSanitize(defaultName: string, tag?:Tag, base?:TagURI) : Tag {
    let out = tag || defaultName as Tag;
    if (out.startsWith("tag:")) {
        return out;
    }
    if (base) {
        if (!base.endsWith('/')) {
            base = base + '/' as TagURI;
        }
        return base + out as TagURI;
    } else {
        return out;
    }
}

class DecoratorCollector<T> {
    private static gWeakMap = new WeakMap<YamlishConstructor<any>>();
    private _properties = new Map<PropertyKey,PropertyDetail>();
    private _blacklist = new Set<PropertyKey>();

    protected constructor(
        readonly builder:SchemaBuilder,
        readonly target:YamlishConstructor<T>
    ) {}

    addProperty (detail : PropertyDetail) {
        this._properties.set(detail.key, detail);
    }

    addBlacklist (key : PropertyKey) {
        this._blacklist.add(key);
    }

    updateProperty (key : PropertyKey, detail? : Partial<PropertyDetail>) {
        if (!this._properties.has(key)) {
            let data ={...detail, key:key};
            this._properties.set(key, data);
        } else if (detail) {
            let data = this._properties.get(key)!;
            Object.assign(data,detail);
            this._properties.set(key, data);
        }
    }

    hasProperty (key : PropertyKey) : boolean {
        return this._properties.has(key);
    }

    properties () : IterableIterator<PropertyDetail> {
        return this._properties.values();
    }

    blacklist () : IterableIterator<PropertyKey> {
        return this._blacklist.values();
    }

    static get<T extends any> (builder:SchemaBuilder, obj:YamlishConstructor<T>|T) : DecoratorCollector<T>;
    static get<T extends any> (builder:SchemaBuilder, obj:YamlishConstructor<T>|T, dontCreate?: boolean) : DecoratorCollector<T>|null;
    static get<T extends any> (builder:SchemaBuilder, obj:YamlishConstructor<T>|T, dontCreate?: boolean) : DecoratorCollector<T>|null {
        let cls : YamlishConstructor<T>;
        if (typeof obj === 'function') {
            cls = obj as YamlishConstructor<T>;
        } else if (typeof obj === 'object') {
            cls = obj.constructor as YamlishConstructor<T>;
        } else {
            throw new TypeError(`DecoratorCollector only supports class constructors or their prototypes.`);
        }
        let out = DecoratorCollector.gWeakMap.get(cls);
        if (!out) {
            if (dontCreate) {
                return null;
            }
            DecoratorCollector.gWeakMap.set(cls, out = new DecoratorCollector(builder,cls));
        }
        if (out.builder !== builder) {
            throw new TypeBuilderError(cls, 'uses decorator on different schema builder.');
        }

        return out;
    }

    static unlink<T extends any> (builder:SchemaBuilder, obj:YamlishConstructor<T>|T) : DecoratorCollector<T>|null {
        let cls : YamlishConstructor<T>;
        if (typeof obj === 'function') {
            cls = obj as YamlishConstructor<T>;
        } else if (typeof obj === 'object') {
            cls = obj.constructor as YamlishConstructor<T>;
        } else {
            throw new TypeError(`DecoratorCollector only supports class constructors or their prototypes.`);
        }
        let out = DecoratorCollector.gWeakMap.get(cls);
        if (!out) {
            return null;
        }
        if (out.builder !== builder) {
            throw new TypeBuilderError(cls, 'uses decorator on different schema builder.');
        }

        DecoratorCollector.gWeakMap.delete(cls);

        return out;
    }
}

class TypeBuilder<T> {
    readonly name                       : string;
    readonly kind                       : Kind;
    readonly tag                        : Tag;
    readonly hasImplicitConstruct       : boolean;
    readonly hasImplicitRepresent       : boolean;
    readonly hasImplicitResolve         : boolean;
    readonly hasImplicitApply           : boolean;
    readonly hasImplicits               : boolean;

    private _funcConstruct?             : ConstructFunc|null;
    private _funcRepresent?             : RepresentFunc|RepresentStyleFunc|null;
    private _funcPredicate?             : PredicateFunc|null;
    private _funcResolve?               : ResolveFunc|null;
    private _funcApply?                 : ApplyFunc;

    //private _yamlProperties?            : Map<string, ResolvedPropertyDetail>;
    //private _objProperties?             : Map<PropertyKey, ResolvedPropertyDetail>;
    private _blacklist                  : Set<PropertyKey>;
    private _blacklistPrefix?           : string;
    //private _knownSetters               : Set<PropertyKey>;
    private _explicitYamlProperties?    : Map<string|number, PropertyDetail>;
    private _explicitObjProperties?     : Map<PropertyKey, PropertyDetail>;

    // Construct Implicits
    private _funcImplicitCreate?        : () => T;
    private _resolvedOptions?           : TypeOptions;
    readonly type                       : Type;
    readonly decoratorCollector         : DecoratorCollector<T>|null;

    constructor(
        readonly schema                 : SchemaBuilder,
        readonly target                 : YamlishConstructor<T>,
        readonly options                : TypeBuilderOptions
    ) {
        if (typeof target !== 'function') {
            throw new TypeBuilderError(target,`not a function or constructor.`);
        }
        this.name                   = target.name;
        this.tag                    = tagSanitize(this.name, options.tag, options.baseTagURI);
        this._blacklist             = new Set();
        this.decoratorCollector     = DecoratorCollector.unlink(schema, target);
        //this._knownSetters          = new Set();

        if (Reflect.has(target.prototype, YamlType)) {
            throw new TypeBuilderError(target,`already been defined in a schema and been assigned a @@YamlType.`);
        }
        // Loader
        if (Reflect.has(target, YamlConstruct)              && options.construct) {
            throw new TypeBuilderError(target,`has both explicit @@YamlConstruct and 'option.construct'.`);
        }
        if (Reflect.has(target, YamlResolve)                && options.resolve) {
            throw new TypeBuilderError(target,`has both explicit @@YamlResolve and 'option.resolve'.`);
        }
        // Dumper
        // ... match static functions
        if(Reflect.has(target, YamlPredicate)               && options.predicate) {
            throw new TypeBuilderError(target, `has both explicit @@YamlPredicate and 'option.predicate'.`);
        }
        if (Reflect.has(target, YamlRepresent)              && options.represent) {
            throw new TypeBuilderError(target,`has both explicit @@YamlRepresent and 'option.represent'.`);
        }
        // ... match instance functions
        if (Reflect.has(target.prototype, YamlPredicate)    && options.predicate) {
            throw new TypeBuilderError(target,`has both explicit prototype[@@YamlPredicate] and 'option.predicate'.`);
        }
        if (Reflect.has(target.prototype, YamlRepresent)    && options.represent) {
            throw new TypeBuilderError(target,`has both explicit prototype[@@YamlRepresent] and 'option.represent'.`);
        }
        // ... do not allow instance and static to conflict
        if (Reflect.has(target.prototype, YamlPredicate)    && Reflect.has(target, YamlPredicate)) {
            throw new TypeBuilderError(target,`has both explicit prototype[@@YamlPredicate] and @@YamlPredicate.`);
        }
        if (Reflect.has(target.prototype, YamlRepresent)    && Reflect.has(target, YamlRepresent)) {
            throw new TypeBuilderError(target,`has both explicit prototype[@@YamlRepresent] and @@YamlRepresent.`);
        }

        // Pull functions from options first for explicit
        this._funcConstruct     = options.construct;
        this._funcPredicate     = options.predicate;
        this._funcRepresent     = options.represent;
        this._funcResolve       = options.resolve;
        this._funcApply         = undefined;

        // loader
        if (!this._funcConstruct) {
            if (Reflect.has(target, YamlConstruct)) {
                this._funcConstruct = Reflect.get(target, YamlConstruct);
            } else if (Reflect.has(target.prototype, YamlApply)) {
                this._funcApply = Reflect.get(target.prototype, YamlApply);
            }
        } else {
            if (Reflect.has(target.prototype, YamlApply)) {
                throw new TypeBuilderError(target,`has prototype[@@YamlApply] but is not using implicit constructor.`);
            }
        }
        if (!this._funcResolve && Reflect.has(target, YamlResolve)) {
            this._funcResolve = Reflect.get(target, YamlResolve);
        }

        // dumper
        if (Reflect.has(target, YamlPredicate)) {
            // this really doesn't make all that much sense in this context but whatever!
            this._funcPredicate = (Reflect.get(target,YamlPredicate) as PredicateFunc);
        } else if (Reflect.has(target.prototype, YamlPredicate)) {
            // this really doesn't make all that much sense in this context but whatever!
            this._funcPredicate = function (data : any) : boolean {
                return (data[YamlPredicate] as InstPredicateFunc)();
            };
        }

        if (Reflect.has(target, YamlRepresent)) {
            // this really doesn't make all that much sense in this context but whatever!
            this._funcRepresent = (Reflect.get(target,YamlRepresent) as RepresentFunc);
        } else if (Reflect.has(target.prototype, YamlRepresent)) {
            // this really doesn't make all that much sense in this context but whatever!
            this._funcRepresent = function (data : any) : any {
                return (data[YamlRepresent] as InstRepresentFunc)();
            };
        }

        this.hasImplicitConstruct   = !this._funcConstruct;
        this.hasImplicitResolve     = !this._funcResolve;
        this.hasImplicitRepresent   = !this._funcRepresent;
        this.hasImplicitApply       = this.hasImplicitConstruct && !this._funcApply;
        this.hasImplicits           = this.hasImplicitConstruct||this.hasImplicitResolve||this.hasImplicitRepresent||this.hasImplicitApply;
        this.kind                   = options.kind || ((this.hasImplicitApply||this.hasImplicitRepresent) && Kind.Mapping) || Kind.Fallback;

        // without an implicitly generated apply function, this step provides no additional value
        if (this.hasImplicits) {
            this._initPropertyInfo();
            if (this.hasImplicitConstruct) {
                if (this.target.length>0 && !this.options.noImplicitConstructorCheck) {
                    throw new TypeBuilderError(this.target, `has implicit @@YamlConstruct, but constructor needs ${this.target.length} arguments.`);
                }
                this._createImplicitCreate();
                if (this.hasImplicitApply) {
                    this._createImplicitApply();
                }
                this._createImplicitConstruct();
            }

            if (this.hasImplicitResolve) {
                this._createImplicitResolve();
            }

            if (this.hasImplicitRepresent) {
                this._createImplicitRepresent();
            }
        }

        this._resolvedOptions = {
            ...options,
            construct:      this._funcConstruct,
            represent:      this._funcRepresent,
            resolve:        this._funcResolve,
            predicate:      this._funcPredicate,
            kind:           this.kind,
            instanceOf:     this.target,
        };

        this.type = new Type(this.tag, this._resolvedOptions);

        if (options.assignTypeSymbol) {
            Reflect.defineProperty(target, YamlType, {
                writable:       false,
                value:          this.type
            })
        }
    }

    private _initPropertyInfo() {
        // Build the blacklist:
        let blacklist = this._blacklist;
        let decorated = this.decoratorCollector;
        this._blacklistPrefix = this.options.blacklistPrefix;
        // Unless otherwise state, import common problematic types:
        if (!this.options.ignoreBlacklistDefault) {
            gPropertyBlacklist.forEach(x => blacklist.add(x));
        }
        if (this.options.blacklist) {
            this.options.blacklist.forEach(x => blacklist.add(x));
        }

        let properties : Set<PropertyDetail|PropertyKey> = new Set(Array.from(iterConcat(
            this.options.properties && this.options.properties.values() || undefined,
            decorated && decorated.properties() || undefined
        )).sort((a,b)=>
            ((typeof a === 'object' && a.priority) || 0) - ((typeof b === 'object' && b.priority) || 0))
        );

        if (decorated) {
            for (let i of decorated.blacklist()){
                blacklist.add(i);
            }
        }

        if (properties.size > 0) {
            //this._explicitProperties    = ( && new Set(Array.from(options.properties))) || undefined;
            let explicitYaml    = this._explicitYamlProperties  = new Map();
            let explicitObj     = this._explicitObjProperties   = new Map();
            for (let keyOrProp of properties.values()) {
                if (typeof keyOrProp === 'object') {
                    let clone = {...keyOrProp};
                    if (!clone.yamlKey) {
                        if (typeof clone.key === 'symbol') {
                            throw new TypeBuilderError(this.target, `specified property was a symbol without 'PropertyDetail.yamlKey'.`);
                            //keyOrProp.yamlKey
                        }
                        clone.yamlKey = clone.key;
                    }
                    if (this._blacklist.has(clone.key)) {
                        throw new TypeBuilderError(this.target, `specified property '${typeof clone.key === 'symbol' ? '<<symbol>>' : clone.key}' is on the blacklist.`);
                    }
                    explicitObj.set(clone.key, clone);
                    explicitYaml.set(clone.yamlKey, clone);
                } else {
                    if (typeof keyOrProp === 'symbol') {
                        throw new TypeBuilderError(this.target, `key is a symbol and cannot be mapped to yamlKey.`);
                    }

                    let simple : PropertyDetail = {
                        key: keyOrProp,
                        yamlKey: keyOrProp
                    };
                    if (this._blacklist.has(simple.key)) {
                        throw new TypeBuilderError(this.target, `specified property '${typeof simple.key === 'symbol' ? '<<symbol>>' : simple.key}' is on the blacklist.`);
                    }
                    explicitObj.set(simple.key, simple);
                    explicitYaml.set(simple.yamlKey, simple);
                }
            }
        }
    }

    private _createImplicitResolve () {
        // do nothing
    }

    private _createImplicitRepresent () {
        if (this.kind!==Kind.Mapping) {
            throw new TypeBuilderError(this.target, `has implicit @@YamlRepresent but is not mapping type.`);
        }

        let blacklist           = this._blacklist;
        let blacklistPrefix     = this._blacklistPrefix;
        let allowFunctions      = this.options.allowFunctionAssignment;

        if (this._explicitObjProperties) {
            let objProperties = this._explicitObjProperties;
            let incImplicit = this.options.includeImplicitProperties;
            function implicitRepresentProvided(data: any) : any {
                let out : any = {};
                if (incImplicit) {
                    for (let key of Reflect.ownKeys(data)) {
                        if (typeof key === 'symbol' || blacklist.has(key) || (blacklistPrefix && typeof key === 'string' && key.startsWith(blacklistPrefix))) {
                            continue;
                        }
                        let val = data[key];
                        if (typeof val === 'symbol') {
                            continue;
                        } else if (typeof val === 'function' && !allowFunctions) {
                            continue;
                        }
                        if (!objProperties.has(key)){
                            out[key] = data[key];
                        }
                    }
                }
                for (let item of objProperties.values()) {
                    if(item.validateObjectValue) {
                        item.validateObjectValue(data, data[item.key]);
                    }
                    if (Reflect.has(data, item.key)) {
                        let value = data[item.key];
                        if (item.validateYamlValue) {
                            item.validateYamlValue(data,value);
                        }
                        out[item.yamlKey!] = data[item.key];
                    }
                }
                return out;
            }

            this._funcRepresent = implicitRepresentProvided;
        } else {
            function implicitRepresentAuto(data: SimpleMap<any>) : SimpleMap<any> {
                let out : SimpleMap<any> = {};
                for (let key of Reflect.ownKeys(data)) {
                    if (typeof key === 'symbol' || blacklist.has(key) || (blacklistPrefix && typeof key === 'string' && key.startsWith(blacklistPrefix))) {
                        continue;
                    }
                    let val = data[key];
                    if (typeof val === 'symbol') {
                        continue;
                    } else if (typeof val === 'function' && !allowFunctions) {
                        continue;
                    }
                    out[key] = data[key];
                }
                return out;
            }
            this._funcRepresent = implicitRepresentAuto;
        }
    }

    private _createImplicitConstruct () {
        if (!this._funcImplicitCreate || !this._funcApply) {
            throw new TypeBuilderError(this.target, 'Implicit constructor is missing create/apply. (Internal error.)');
        }
        let construct   = this._funcImplicitCreate;
        let apply       = this._funcApply;
        function implicitConstruct (data : any):any {
            let obj = construct();
            apply.call(obj, data);
            return obj;
        }
        this._funcConstruct = implicitConstruct;
    }

    private _createImplicitCreate () {
        if (this.options.skipConstructor) {
            this._funcImplicitCreate = Object.create.bind(null, this.target.prototype, null);
        } else {
            this._funcImplicitCreate = Reflect.construct.bind(null, this.target, []);
        }
    }

    private _createImplicitApply () {
        if (this.kind!==Kind.Mapping) {
            throw new TypeBuilderError(this.target, `has implicit @@YamlApply but is not mapping type.`);
        }

        let blacklist           = this._blacklist;
        let blacklistPrefix     = this._blacklistPrefix;

        if (this._explicitYamlProperties) {
            let yamlProperties = this._explicitYamlProperties!;
            let objProperties = this._explicitObjProperties!;
            let incImplicit = this.options.includeImplicitProperties;

            function implicitApplyProvided(this: () => object, data: SimpleMap<any>) {
                if (incImplicit) {
                    for (let key of Reflect.ownKeys(data)) {
                        if (typeof key === 'symbol' || blacklist.has(key) || (blacklistPrefix && typeof key === 'string' && key.startsWith(blacklistPrefix))) {
                            continue;
                        }
                        if (!objProperties.has(key)) {
                            this[key] = data[key];
                        }
                    }
                }
                for (let item of yamlProperties.values()) {
                    if (Reflect.has(data, item.yamlKey!)) {
                        let value = data[item.yamlKey!];
                        if (item.validateObjectValue) {
                            item.validateObjectValue(data,value);
                        }
                        Reflect.set(this, item.key, value);
                    } else if ('defaultValue' in item) {
                        Reflect.set(this, item.key, typeof item.defaultValue === 'function' ? item.defaultValue() : item.defaultValue);
                    }
                }
            }

            this._funcApply = implicitApplyProvided;
        } else {
            function implicitApplyAuto(this: () => object, data: SimpleMap<any>) {
                for (let key of Reflect.ownKeys(data)) {
                    if (typeof key === 'symbol' || blacklist.has(key) || (blacklistPrefix && typeof key === 'string' && key.startsWith(blacklistPrefix))) {
                        continue;
                    }
                    this[key] = data[key];
                }
            }

            this._funcApply = implicitApplyAuto;
        }

    }
}

export interface ExpectOptions {
    jsType?         : JsType;
    instanceOf?     : Set<any>|any|null;
    entries?        : Map<PropertyKey,ExpectOptions>|null;
    isOptional?     : boolean;
    isNullable?     : boolean;
    isArray?        : boolean;
    accept?         : Set<any>|null;
    min?            : number|null;
    max?            : number|null;
}

interface ApplyFunctions {
    (options? : TypeBuilderOptions) : ClassDecorator;
    property (options?:Partial<PropertyDetail>) : PropertyDecorator;
    blacklist () : PropertyDecorator;
    expectType (options: ExpectOptions) : PropertyDecorator;
}

namespace applyImpl {
    function sanitizeExpect (options: ExpectOptions):Required<ExpectOptions> {
        let instOf      = options.instanceOf;
        let isArray     = false;

        if (instOf) {
            if (typeof instOf === 'object' && instOf instanceof Set) {
                let elems = Array.from(instOf);
                isArray = elems.every(x => x.isPrototypeOf(Array));
            } else if (typeof instOf === 'function') {
                isArray = instOf.isPrototypeOf(Array);
            }
        }

        let clone :Required<ExpectOptions> = {
            min                 : null,
            max                 : null,
            ...options,
            isArray             : options.isArray === undefined ? isArray : !!options.isArray,
            jsType              : options.jsType        || (instOf ? 'object' : "any"),
            isNullable          : options.isNullable    ||false,
            isOptional          : options.isOptional    ||false,
            instanceOf          : options.instanceOf    ||null,
            accept              : options.accept        ? new Set ( Array.from(options.accept.values()) )   : null,
            entries             : options.entries       ? new Map ( Array.from(options.entries.entries()) ) : null,
        };

        return clone;
    }

    function mkErrMsg(target:any, key : PropertyKey, msg : string, expect: any, got: any):string {
        return `${msg} : ${target.name}[${typeof key === 'symbol'?'<<symbol>>':key}] expects '${expect}' but got '${got}' instead.`;
    }

    function testExpect (options: Required<ExpectOptions>, key : PropertyKey, target:any, data:any):void {
        let type = typeof data;

        if (!(type === options.jsType || options.jsType === 'any')) {
            throw new TypeError(mkErrMsg(target,key,'type', options.jsType, type));
        }

        if (type === 'number') {
            if (options.max !== null && data >= options.max) {
                throw new TypeError(mkErrMsg(target,key,'maximum value', options.max, data));
            } else if (options.min !== null && data < options.min) {
                throw new TypeError(mkErrMsg(target,key,'minimum value', options.min, data));
            }
        }

        if ((options.isOptional && data === undefined)||(options.isNullable && data === null)) {
            return;
        }

        if (options.isArray) {
            if (!Array.isArray(data)) {
                throw new TypeError(mkErrMsg(target,key,'array', '[]', 'non-array'));
            }
        } else {
            if (Array.isArray(data)) {
                throw new TypeError(mkErrMsg(target,key,'array', 'object', 'array'));
            }
            if (options.instanceOf !== null) {
                if (options.instanceOf instanceof Set) {
                    let valid = false;
                    for (let item of options.instanceOf.values()) {
                        if (!(data instanceof item)) {
                            valid = true;
                            break;
                        }
                    }
                    if (!valid) {
                        throw new TypeError(mkErrMsg(target,key,'instance of', Array.from(options.instanceOf.values()).map(x=>typeof x==='function'?x.name:'?').join(', '), data.prototype.constructor.name));
                    }
                } else {
                    if (!(data instanceof options.instanceOf)) {
                        throw new TypeError(mkErrMsg(target,key,'instance of', options.instanceOf.name, data.prototype.constructor.name));

                    }
                }
            }
        }

        if (options.accept && !options.accept.has(data)) {
            throw new TypeError(mkErrMsg(target,key,'accepts only one of', Array.from(options.accept).map(x=>typeof x==='symbol'?'<<symbol>>':`'${x}'`).join(', '), data));
        }
    }


    function applyClass(this: SchemaBuilder, options?: TypeBuilderOptions): ClassDecorator {
        return (<T extends Function>(target: T): T => {
            this.addClass(target as unknown as YamlishConstructor<any>, options);
            return target;
        });
    }

    function applyProperty(this: SchemaBuilder, options?: Partial<PropertyDetail>): PropertyDecorator {
        return ((target: Object, propertyKey: string | symbol): void => {
            let deco = DecoratorCollector.get(this, target);
            deco.updateProperty(propertyKey, options);
        });
    }

    function applyBlacklist(this: SchemaBuilder, options?: Partial<PropertyDetail>): PropertyDecorator {
        return ((target: Object, propertyKey: string | symbol): void => {
            let deco = DecoratorCollector.get(this, target);
            deco.addBlacklist(propertyKey);
        });
    }

    function applyExpectTypes(this: SchemaBuilder, options: ExpectOptions) : PropertyDecorator {
        return ((target: Object, propertyKey: string | symbol): void => {
            let deco = DecoratorCollector.get(this, target);
            let vopts = sanitizeExpect(options);
            let func = testExpect.bind(null,vopts, propertyKey);
            deco.updateProperty(propertyKey, {
                validateObjectValue     : func,
                validateYamlValue       : func
            });
        });
    }

    export function bind(thisArg:SchemaBuilder) : ApplyFunctions {
        let out = applyClass.bind(thisArg) as ApplyFunctions;
        out.property = applyProperty.bind(thisArg);
        out.expectType = applyExpectTypes.bind(thisArg);
        out.blacklist = applyBlacklist.bind(thisArg);
        return out;
    }
}

export class SchemaBuilder {
    private _types = new Set<Type>();
    private _includes = new Set<Schema>();
    private _resolved? : Schema;
    readonly apply : ApplyFunctions;

    constructor(
        readonly baseURI? : TagURI
    ) {
        this.apply = applyImpl.bind(this);
    }

    add (item : Type|Schema) {
        if (this._resolved) {
            throw new Error("Schema has already been resolved.");
        }
        if (item instanceof Type) {
            this._types.add(item);
        } else {
            this._includes.add(item);
        }
    }

    addClass<T> (target : YamlishConstructor<T>, options? : TypeBuilderOptions) : Type {
        let opt : TypeBuilderOptions = {baseTagURI: this.baseURI, ...options};
        let type = new TypeBuilder(this, target, opt).type;
        this.add(type);
        return type;
    }

    /*apply (options? : TypeBuilderOptions) : ClassDecorator {
        return (<T extends Function>(target:T) : T => {
            this.addClass(target as unknown as YamlishConstructor<any>, options);
            return target;
        });
    }

    applyProperty (options?:Partial<PropertyDetail>) : PropertyDecorator {
        return ((target: Object, propertyKey: string | symbol) : void => {
            let deco = DecoratorCollector.get(this, target);
            deco.updateProperty(propertyKey,options);
        });
    }*/

    /*applyExpect (options?:Partial<PropertyDetail>) : PropertyDecorator {
        return ((target: Object, propertyKey: string | symbol) : void => {
            let deco = DecoratorCollector.get(this, target);
            deco.updateProperty(propertyKey,options);
        });
    }*/

    resolve () : Schema {
        if (this._resolved){
            return this._resolved;
        }
        let res = this._resolved = new Schema({
            explicit    : Array.from(this._types.values()),
            include     : Array.from(this._includes.values())
        });
        return res;
    }
}

export function getYamlType(obj:any) : Type|null {
    if ((typeof obj === 'object' || typeof obj === 'function') && obj !== null) {
        if (Reflect.has(obj, YamlType)) {
            return obj[YamlType];
        } else if (obj.constructor && Reflect.has(obj.constructor, YamlType)) {
            return obj.constructor[YamlType];
        }
    }
    return null;
}
