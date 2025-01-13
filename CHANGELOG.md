# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2024-03-XX

### Added
- Initial release of `zod-to-vertex-schema`
- Core functionality to convert Zod schemas to Vertex AI/Gemini compatible schemas
- Support for basic types:
  - String (with date and datetime formats)
  - Number (with integer and float support)
  - Boolean
  - Arrays
  - Objects
  - Enums
- Support for complex types:
  - Unions
  - Discriminated unions
  - String literals
- Support for modifiers:
  - Optional fields
  - Nullable fields
  - Number constraints (min, max)
- Property ordering preservation in objects
- TypeScript type definitions and source maps
- Comprehensive test suite
- GitHub Actions for CI/CD
- ESLint and Prettier configuration

### Notes
- Recursive schemas (using `z.lazy()`) are not supported due to Vertex AI schema limitations
- Non-string literals are not supported in this version
- Default values are intentionally ignored in schema conversion 


## [0.1.2] - 2025-01-13

### Added
- Fix imports