import {Type, wellknown as ns} from './type';
import * as common from '../common';
import {Kind, YamlException} from '../common';

namespace tbool {
    function resolveYamlBoolean(data) {
        if (data === null) return false;

        var max = data.length;

        return (max === 4 && (data === 'true' || data === 'True' || data === 'TRUE')) ||
            (max === 5 && (data === 'false' || data === 'False' || data === 'FALSE'));
    }

    function constructYamlBoolean(data) {
        return data === 'true' ||
            data === 'True' ||
            data === 'TRUE';
    }

    function isBoolean(object) {
        return Object.prototype.toString.call(object) === '[object Boolean]';
    }

    export const BooleanType = new Type('tag:yaml.org,2002:bool', {
        kind: Kind.Scalar,
        resolve: resolveYamlBoolean,
        construct: constructYamlBoolean,
        predicate: isBoolean,
        represent: {
            lowercase: function (object) {
                return object ? 'true' : 'false';
            },
            uppercase: function (object) {
                return object ? 'TRUE' : 'FALSE';
            },
            camelcase: function (object) {
                return object ? 'True' : 'False';
            }
        },
        defaultStyle: 'lowercase'
    });
}

namespace tfloat {
    var YAML_FLOAT_PATTERN = new RegExp(
        // 2.5e4, 2.5 and integers
        '^(?:[-+]?(?:0|[1-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?' +
        // .2e4, .2
        // special case, seems not from spec
        '|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?' +
        // 20:59
        '|[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\\.[0-9_]*' +
        // .inf
        '|[-+]?\\.(?:inf|Inf|INF)' +
        // .nan
        '|\\.(?:nan|NaN|NAN))$');

    function resolveYamlFloat(data) {
        if (data === null) return false;

        if (!YAML_FLOAT_PATTERN.test(data) ||
            // Quick hack to not allow integers end with `_`
            // Probably should update regexp & check speed
            data[data.length - 1] === '_') {
            return false;
        }

        return true;
    }

    function constructYamlFloat(data) {
        var value, sign, base, digits : number[] = [];

        if (typeof data !== 'string') {
            throw new YamlException('YAML Float requires scalar.');
        }

        value  = data.replace(/_/g, '').toLowerCase();
        sign   = value[0] === '-' ? -1 : 1;
        digits = [];

        if ('+-'.indexOf(value[0]) >= 0) {
            value = value.slice(1);
        }

        if (value === '.inf') {
            return (sign === 1) ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;

        } else if (value === '.nan') {
            return NaN;

        } else if (value.indexOf(':') >= 0) {
            value.split(':').forEach(function (v) {
                digits.unshift(parseFloat(v));
            });

            value = 0.0;
            base = 1;

            digits.forEach(function (d) {
                value += d * base;
                base *= 60;
            });

            return sign * value;
        }
        return sign * parseFloat(value);
    }


    var SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;

    function representYamlFloat(object:any, style?:string) {
        var res;

        if (isNaN(object)) {
            switch (style) {
                case 'lowercase': return '.nan';
                case 'uppercase': return '.NAN';
                case 'camelcase': return '.NaN';
            }
        } else if (Number.POSITIVE_INFINITY === object) {
            switch (style) {
                case 'lowercase': return '.inf';
                case 'uppercase': return '.INF';
                case 'camelcase': return '.Inf';
            }
        } else if (Number.NEGATIVE_INFINITY === object) {
            switch (style) {
                case 'lowercase': return '-.inf';
                case 'uppercase': return '-.INF';
                case 'camelcase': return '-.Inf';
            }
        } else if (common.isNegativeZero(object)) {
            return '-0.0';
        }

        res = object.toString(10);

        // JS stringifier can build scientific format without dots: 5e-100,
        // while YAML requres dot: 5.e-100. Fix it with simple hack

        return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace('e', '.e') : res;
    }

    function isFloat(object) {
        return (Object.prototype.toString.call(object) === '[object Number]') &&
            (object % 1 !== 0 || common.isNegativeZero(object));
    }

    export const FloatType = new Type('tag:yaml.org,2002:float', {
        kind: Kind.Scalar,
        resolve: resolveYamlFloat,
        construct: constructYamlFloat,
        predicate: isFloat,
        represent: representYamlFloat,
        defaultStyle: 'lowercase'
    });
}

namespace tint {

    function isHexCode(c) {
        return ((0x30/* 0 */ <= c) && (c <= 0x39/* 9 */)) ||
            ((0x41/* A */ <= c) && (c <= 0x46/* F */)) ||
            ((0x61/* a */ <= c) && (c <= 0x66/* f */));
    }

    function isOctCode(c) {
        return ((0x30/* 0 */ <= c) && (c <= 0x37/* 7 */));
    }

    function isDecCode(c) {
        return ((0x30/* 0 */ <= c) && (c <= 0x39/* 9 */));
    }

    function resolveYamlInteger(data) {
        if (data === null) return false;

        var max = data.length,
            index = 0,
            hasDigits = false,
            ch;

        if (!max) return false;

        ch = data[index];

        // sign
        if (ch === '-' || ch === '+') {
            ch = data[++index];
        }

        if (ch === '0') {
            // 0
            if (index + 1 === max) return true;
            ch = data[++index];

            // base 2, base 8, base 16

            if (ch === 'b') {
                // base 2
                index++;

                for (; index < max; index++) {
                    ch = data[index];
                    if (ch === '_') continue;
                    if (ch !== '0' && ch !== '1') return false;
                    hasDigits = true;
                }
                return hasDigits && ch !== '_';
            }


            if (ch === 'x') {
                // base 16
                index++;

                for (; index < max; index++) {
                    ch = data[index];
                    if (ch === '_') continue;
                    if (!isHexCode(data.charCodeAt(index))) return false;
                    hasDigits = true;
                }
                return hasDigits && ch !== '_';
            }

            // base 8
            for (; index < max; index++) {
                ch = data[index];
                if (ch === '_') continue;
                if (!isOctCode(data.charCodeAt(index))) return false;
                hasDigits = true;
            }
            return hasDigits && ch !== '_';
        }

        // base 10 (except 0) or base 60

        // value should not start with `_`;
        if (ch === '_') return false;

        for (; index < max; index++) {
            ch = data[index];
            if (ch === '_') continue;
            if (ch === ':') break;
            if (!isDecCode(data.charCodeAt(index))) {
                return false;
            }
            hasDigits = true;
        }

        // Should have digits and should not end with `_`
        if (!hasDigits || ch === '_') return false;

        // if !base60 - done;
        if (ch !== ':') return true;

        // base60 almost not used, no needs to optimize
        return /^(:[0-5]?[0-9])+$/.test(data.slice(index));
    }

    function constructYamlInteger(data) {
        if (typeof data !== 'string') {
            throw new YamlException('Integer must be scalar.');
        }
        var value = data, sign = 1, ch, base, digits : number[] = [];

        if (value.indexOf('_') !== -1) {
            value = value.replace(/_/g, '');
        }

        ch = value[0];

        if (ch === '-' || ch === '+') {
            if (ch === '-') sign = -1;
            value = value.slice(1);
            ch = value[0];
        }

        if (value === '0') return 0;

        if (ch === '0') {
            if (value[1] === 'b') return sign * parseInt(value.slice(2), 2);
            if (value[1] === 'x') return sign * parseInt(value, 16);
            return sign * parseInt(value, 8);
        }

        if (value.indexOf(':') !== -1) {
            value.split(':').forEach(function (v) {
                digits.unshift(parseInt(v, 10));
            });

            let num = 0;
            base = 1;

            digits.forEach(function (d) {
                num += (d * base);
                base *= 60;
            });

            return sign * num;

        }

        return sign * parseInt(value, 10);
    }

    function isInteger(object) {
        return (Object.prototype.toString.call(object)) === '[object Number]' &&
            (object % 1 === 0 && !common.isNegativeZero(object));
    }

    export const IntType = new Type('tag:yaml.org,2002:int', {
        kind: Kind.Scalar,
        resolve: resolveYamlInteger,
        construct: constructYamlInteger,
        predicate: isInteger,
        represent: {
            binary:      function (obj) { return obj >= 0 ? '0b' + obj.toString(2) : '-0b' + obj.toString(2).slice(1); },
            octal:       function (obj) { return obj >= 0 ? '0'  + obj.toString(8) : '-0'  + obj.toString(8).slice(1); },
            decimal:     function (obj) { return obj.toString(10); },
            /* eslint-disable max-len */
            hexadecimal: function (obj) { return obj >= 0 ? '0x' + obj.toString(16).toUpperCase() :  '-0x' + obj.toString(16).toUpperCase().slice(1); }
        },
        defaultStyle: 'decimal',
        styleAliases: {
            binary:      [ 2,  'bin' ],
            octal:       [ 8,  'oct' ],
            decimal:     [ 10, 'dec' ],
            hexadecimal: [ 16, 'hex' ]
        }
    });

}

export const MapType = new Type('tag:yaml.org,2002:map', {
    kind: Kind.Mapping,
    construct: function (data) { return data !== null ? data : {}; }
});

export const MergeType = new Type('tag:yaml.org,2002:merge', {
    kind: Kind.Scalar,
    resolve: function resolveYamlMerge(data) {
        return data === '<<' || data === null;
    }
});


export const NullType = new Type('tag:yaml.org,2002:null', {
    kind: Kind.Scalar,
    resolve: function resolveYamlNull(data) {
        if (data === null) return true;

        var max = data.length;

        return (max === 1 && data === '~') ||
            (max === 4 && (data === 'null' || data === 'Null' || data === 'NULL'));
    },
    construct: function constructYamlNull() {
        return null;
    },
    predicate: function isNull(object) {
        return object === null;
    },
    represent: {
        canonical: function () { return '~';    },
        lowercase: function () { return 'null'; },
        uppercase: function () { return 'NULL'; },
        camelcase: function () { return 'Null'; }
    },
    defaultStyle: 'lowercase'
});

const _hasOwnProperty = Object.prototype.hasOwnProperty;
const _toString       = Object.prototype.toString;

export const OMapType = new Type('tag:yaml.org,2002:omap', {
    kind: Kind.Sequence,
    resolve: function resolveYamlOmap(data) {
        if (data === null) return true;

        var objectKeys : string[] = [], index, length, pair, pairKey, pairHasKey,
            object = data;

        for (index = 0, length = object.length; index < length; index += 1) {
            pair = object[index];
            pairHasKey = false;

            if (_toString.call(pair) !== '[object Object]') return false;

            for (pairKey in pair) {
                if (_hasOwnProperty.call(pair, pairKey)) {
                    if (!pairHasKey) pairHasKey = true;
                    else return false;
                }
            }

            if (!pairHasKey) return false;

            if (objectKeys.indexOf(pairKey) === -1) objectKeys.push(pairKey);
            else return false;
        }

        return true;
    },
    construct: function constructYamlOmap(data) {
        return data !== null ? data : [];
    }
});

export const PairsType = new Type('tag:yaml.org,2002:pairs', {
    kind: Kind.Sequence,
    resolve: function resolveYamlPairs(data) {
        if (data === null) return true;

        var index, length, pair, keys, result,
            object = data;

        result = new Array(object.length);

        for (index = 0, length = object.length; index < length; index += 1) {
            pair = object[index];

            if (_toString.call(pair) !== '[object Object]') return false;

            keys = Object.keys(pair);

            if (keys.length !== 1) return false;

            result[index] = [ keys[0], pair[keys[0]] ];
        }

        return true;
    },
    construct: function constructYamlPairs(data) {
        if (data === null) return [];

        var index, length, pair, keys, result,
            object = data;

        result = new Array(object.length);

        for (index = 0, length = object.length; index < length; index += 1) {
            pair = object[index];

            keys = Object.keys(pair);

            result[index] = [ keys[0], pair[keys[0]] ];
        }

        return result;
    }
});

export const SeqType = new Type('tag:yaml.org,2002:seq', {
    kind: Kind.Sequence,
    construct: function (data) { return data !== null ? data : []; }
});

export const SetType = new Type('tag:yaml.org,2002:set', {
    kind: Kind.Mapping,
    resolve: function resolveYamlSet(data) {
        if (data === null) return true;

        var key, object = data;

        for (key in object) {
            if (_hasOwnProperty.call(object, key)) {
                if (object[key] !== null) return false;
            }
        }

        return true;
    },
    construct: function constructYamlSet(data) {
        return data !== null ? data : {};
    }
});

export const StrType = new Type('tag:yaml.org,2002:str', {
    kind: Kind.Scalar,
    construct: function (data) { return data !== null ? data : ''; }
});

namespace ts {
    var YAML_DATE_REGEXP = new RegExp(
        '^([0-9][0-9][0-9][0-9])'          + // [1] year
        '-([0-9][0-9])'                    + // [2] month
        '-([0-9][0-9])$');                   // [3] day

    var YAML_TIMESTAMP_REGEXP = new RegExp(
        '^([0-9][0-9][0-9][0-9])'          + // [1] year
        '-([0-9][0-9]?)'                   + // [2] month
        '-([0-9][0-9]?)'                   + // [3] day
        '(?:[Tt]|[ \\t]+)'                 + // ...
        '([0-9][0-9]?)'                    + // [4] hour
        ':([0-9][0-9])'                    + // [5] minute
        ':([0-9][0-9])'                    + // [6] second
        '(?:\\.([0-9]*))?'                 + // [7] fraction
        '(?:[ \\t]*(Z|([-+])([0-9][0-9]?)' + // [8] tz [9] tz_sign [10] tz_hour
        '(?::([0-9][0-9]))?))?$');           // [11] tz_minute

    function resolveYamlTimestamp(data) {
        if (data === null) return false;
        if (YAML_DATE_REGEXP.exec(data) !== null) return true;
        if (YAML_TIMESTAMP_REGEXP.exec(data) !== null) return true;
        return false;
    }

    function constructYamlTimestamp(data) {
        var match : RegExpMatchArray|null;
        var year : number, month : number, day : number,
            hour : number, minute : number, second : number, fraction : number = 0,
            delta : number|null = null, tz_hour: number, tz_minute : number, date : Date;

        if (typeof data !== 'string') {
            throw new YamlException(`Timestamp requires a scalar!`);
        }

        match = data.match(YAML_DATE_REGEXP);
        if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(data);

        if (match === null) throw new Error('Date resolve error');

        // match: [1] year [2] month [3] day

        year = +(match[1]);
        month = +(match[2]) - 1; // JS month starts with 0
        day = +(match[3]);

        if (!match[4]) { // no hour
            return new Date(Date.UTC(year, month, day));
        }

        // match: [4] hour [5] minute [6] second [7] fraction

        hour = +(match[4]);
        minute = +(match[5]);
        second = +(match[6]);

        fraction = match[7] ? Number.parseInt(match[7].substr(0,3).padEnd(3,'0')) : 0;

        // match: [8] tz [9] tz_sign [10] tz_hour [11] tz_minute

        if (match[9]) {
            tz_hour = +(match[10]);
            tz_minute = +(match[11] || 0);
            delta = (tz_hour * 60 + tz_minute) * 60000; // delta in mili-seconds
            if (match[9] === '-') delta = -delta;
        }

        date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));

        if (delta) date.setTime(date.getTime() - delta);

        return date;
    }

    function representYamlTimestamp(object /*, style*/) {
        return object.toISOString();
    }

    export const TimestampType = new Type('tag:yaml.org,2002:timestamp', {
        kind: Kind.Scalar,
        resolve: resolveYamlTimestamp,
        construct: constructYamlTimestamp,
        instanceOf: Date,
        represent: representYamlTimestamp
    });

}

export import TimestampType     = ts.TimestampType;
export import BooleanType       = tbool.BooleanType;
export import FloatType         = tfloat.FloatType;
export import IntType           = tint.IntType;
