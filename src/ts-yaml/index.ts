import * as icommon                 from './common';
import * as ischema                 from './schema';
import * as iloader                 from './loader';
import * as idumper                 from './dumper';
import * as itype                   from './type';

export import YamlException         = icommon.YamlException;
export import Schema                = ischema.Schema;
export import Type                  = itype.Type;
export import Kind                  = icommon.Kind;
export import Mark                  = icommon.Mark;

export import builder               = ischema.builder;

export namespace tag {
    export import TagURI            = icommon.TagURI;
    export import Tag               = icommon.Tag;
    export import isTagURI          = icommon.isTagURI;
    export import isTag             = icommon.isTag;
    export import makeTag           = icommon.makeTag;
    export import makeTagURI        = icommon.makeTagURI;
    export import tagURIParts       = icommon.tagURIParts;
}

export import load                  = iloader.load;
export import safeLoad              = iloader.safeLoad;
export import LoadOptions           = iloader.Options;

export import safeDump              = idumper.safeDump;
export import dump                  = idumper.dump;
export import DumpOptions           = idumper.Options;

export namespace builtin {
    export import schema            = ischema.buildinSchema;
    export import type              = itype.builtinType;
}
