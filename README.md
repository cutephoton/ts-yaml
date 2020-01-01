TS-YAML - YAML 1.2 parser / writer for JavaScript
=================================================

**Note: The packaging and release stuff isn't there yet.**

This package provides a yaml 1.2 parsed based on the original
[ja-yaml](https://github.com/nodeca/js-yaml) with the main difference
being the use of ES-style classes and refactoring.

Changes:
 * ES-style classes
 * Incorporate modern javascript concepts
 * Better integration with typescript
 * Decorator helpers & metadata (ts-yaml/builder)
   * Implicit class construct/represent
   * Optional, two-step construction (create then apply)
   * Some pretty basic type checking
 * Ability to define the construct/represent/etc as part of your class (i.e. @@YamlConstruct)
 * Explicit typing (i.e. @@YamlType) avoids overhead of scanning the schema

Future goals:
 * Lazy loading of schemas (useful for plugins)
 * Use of modern javascript classes - Maps/Sets
 
Things that are not goals:
 * Compatibility with the original library
 * Legacy javascript

API Differences:
 * YAMLException was renamed to YamlException
 * Location of schemas/types changes:
   * ts-yaml exports builtin{type,schema}
   * Alternatively:
     * ts-yaml/type => builtinType
     * ts-yaml/schema => builtinSchema
 * JS-types not implemented. (There is no difference between safe schema and full.)
