import {yaml} from "../helpers";
import test from 'ava';

// -------------------------------------------------------------------------------------------
import builder = yaml.builder;

const mySchemaBuilder = new yaml.builder.SchemaBuilder(yaml.tag.makeTagURI('tag:cutephoton.com,2020/test'));

mySchemaBuilder.add(yaml.builtin.schema.DEFAULT_SAFE);

@mySchemaBuilder.apply()
class Person {
    first?          : string;
    last?           : string;
    address?        : Address|Address2|Address3;
    constructor() {}
}

@mySchemaBuilder.apply({noImplicitConstructorCheck:true, assignTypeSymbol: true})
class Address {
    street?        : string;
    city?          : string;
    zip?           : string;
    state?         : string;
    constructor(useless:any) {}
}

@mySchemaBuilder.apply({assignTypeSymbol: true})
class Address2 {
    street?        : string;
    city?          : string;
    zip?           : string;
    state?         : string;
    constructor() {}
    [yaml.builder.YamlApply] (data:any) {
        this.state      = data['street'];
        this.city       = data['city'];
        this.zip        = data['zip'];
        this.state      = data['state'];
    }
}

@mySchemaBuilder.apply({kind:yaml.Kind.Mapping})
class Address3 {
    street?        : string;
    city?          : string;
    zip?           : string;
    state?         : string;
    constructor() {}
    [yaml.builder.YamlApply] (data:any) {
        this.state      = data['street_a'];
        this.city       = data['city_a'];
        this.zip        = data['zip_a'];
        this.state      = data['state_a'];
    }
    [yaml.builder.YamlRepresent] () : any {
        return {
            street_a: this.street,
            city_a: this.city,
            zip_a: this.zip,
            state_a: this.street
        }
    }
}

const mySchema = mySchemaBuilder.resolve();
// -------------------------------------------------------------------------------------------

test('Schema Builder - test', t => {

    let persons = new Array<Person>(3);
    persons[0] = new Person();
    persons[1] = new Person();
    persons[2] = new Person();

    persons[0].address = new Address(1);
    persons[0].first                = 'Bob';
    persons[0].last                 = 'Jones';
    persons[0].address.street       = '510 Faker St.';
    persons[0].address.state        = 'California';
    persons[0].address.city         = 'Cupterino';
    persons[0].address.zip          = '91111';

    persons[1].address = new Address2();
    persons[1].first                = 'Jane';
    persons[1].last                 = 'Stalwart';
    persons[1].address.street       = '123 Random St.';
    persons[1].address.state        = 'California';
    persons[1].address.city         = 'Half Moon Bay';
    persons[1].address.zip          = '94019';

    persons[2].address = new Address3();
    persons[2].first                = 'Jane';
    persons[2].last                 = 'Stalwart';
    persons[2].address.street       = '123 Random St.';
    persons[2].address.state        = 'California';
    persons[2].address.city         = 'Half Moon Bay';
    persons[2].address.zip          = '94019';

    let toYaml = yaml.safeDump(persons, {schema:mySchema});

    console.log("---------------------\nOutput\n---------------------\n\n%s\n\n---------------------", toYaml);

    console.log(`getYamlType(P0): ${builder.getYamlType(persons[0].address)}`);
    console.log(`getYamlType(P1): ${builder.getYamlType(persons[1].address)}`);
    console.log(`getYamlType(P1): ${builder.getYamlType(persons[2].address)}`);
    console.log(`getYamlType(Address): ${builder.getYamlType(Address)}`);
    console.log(`getYamlType(Address2): ${builder.getYamlType(Address2)}`);
    console.log(`getYamlType(Address3): ${builder.getYamlType(Address3)}`);

    let fromYaml = yaml.safeLoad(toYaml, {schema:mySchema});

    console.log(fromYaml);

    t.pass();
});
