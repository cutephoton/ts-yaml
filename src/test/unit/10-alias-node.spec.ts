import {yaml} from "../helpers";
import test from 'ava';

// -------------------------------------------------------------------------------------------
class TestClass {
    [key:string] : any;
    constructor (data) {
        Object.keys(data).forEach(key => this[key] = data[key]);
    }
}

var TestClassYaml = new yaml.Type('!test', {
    kind: yaml.Kind.Mapping,
    construct: function (data) { return new TestClass(data); }
});

var TEST_SCHEMA = yaml.Schema.create([ TestClassYaml ]);

// -------------------------------------------------------------------------------------------

test('Alias nodes - Simple built-in primitives', t => {
    //Resolving of an alias node should result the resolved and contructed value of the anchored node
    t.assert(yaml.load('[&1 "foobar", *1]')[1] === 'foobar');
    t.assert(yaml.load('[&1 "foobar", *1]')[1] === 'foobar');
    t.assert((yaml.load('[&1 ~, *1]')[1]=== null));
    t.assert((yaml.load('[&1 true, *1]')[1]=== true));
    t.assert((yaml.load('[&1 42, *1]')[1]=== 42));

});

test('Alias nodes - Simple built-in objects', t => {
    t.deepEqual(yaml.load('[&1 [a, b, c, d], *1]')[1], [ 'a', 'b', 'c', 'd' ]);
    t.deepEqual(yaml.load('[&1 {a: b, c: d}, *1]')[1], { a: 'b', c: 'd' });
});
test('Alias nodes - Recursive built-in objects', t => {
    var actual = yaml.load('[&1 {self: *1}, *1]')[1];

    t.assert(actual === actual.self);
});
test('Alias nodes - Simple custom objects', t => {

    var expected = new TestClass({ a: 'b', c: 'd' }),
        actual = yaml.load('[&1 !test {a: b, c: d}, *1]', { schema: TEST_SCHEMA })[1];

    t.assert(actual instanceof TestClass);
    t.deepEqual(actual, expected);
});

// TODO: Not implemented yet (see issue js-yaml#141)
/*test('Alias nodes - Recursive custom objects', t => {
    var actual = yaml.load('[&1 !test {self: *1}, *1]', { schema: TEST_SCHEMA })[1];
    t.assert(actual instanceof TestClass);
    t.assert(actual.self instanceof TestClass);
    t.assert(actual === actual.self);
});
 */
