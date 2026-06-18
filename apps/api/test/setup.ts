// Loaded before any test module. `@Type`/decorator-metadata-driven validation
// (e.g. PaginationQueryDto) calls `Reflect.getMetadata` at class-definition
// time, which needs the reflect-metadata polyfill — the same one main.ts loads
// in production. Importing it once here covers the whole suite.
import 'reflect-metadata';
