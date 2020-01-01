import * as ischema         from './schema';
import * as ibuiltin        from './std';
import * as helper          from './helper';

export import Schema            = ischema.Schema;
export import buildinSchema     = ibuiltin;
export import KindTagMap        = ischema.KindTagMap;

export namespace builder {
    export import SchemaBuilder = helper.SchemaBuilder;
    export import YamlResolve   = helper.YamlResolve;
    export import YamlPredicate = helper.YamlPredicate;
    export import YamlRepresent = helper.YamlRepresent;
    export import YamlConstruct = helper.YamlConstruct;
    export import YamlApply     = helper.YamlApply;
    export import getYamlType   = helper.getYamlType;
}
