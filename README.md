TS-YAML - YAML 1.2 parser / writer for JavaScript
=================================================

This package provides a yaml 1.2 parsed based on the original
[ja-yaml](https://github.com/nodeca/js-yaml) with the main difference
being the use of ES-style classes and refactoring.

Changes:
 * ES-style classes
 * Incorporate modern javascript concepts
 * Better integration with typescript

Future goals:
 * Lazy loading of schemas (useful for plugins)
 * Use of modern javascript classes - Maps/Sets
 * Decorator helpers & metadata
 
Things that are not goals:
 * Compatibility with the original library
 * Legacy javascript

API Differences:
 * YAMLException was renamed to YamlException
 * Location of schemas/types changes:
   * ts-yaml/type exports builtinType
   * ts-yaml/schema exports builtinSchema 
 * JS-types not implemented. (There is no difference between safe schema and full.)
