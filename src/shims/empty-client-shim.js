// Empty shim for optional packages that @wagmi/connectors tries to import
// but are not installed. Webpack resolves these imports to this no-op module
// instead of failing the build with "Module not found".
module.exports = {}
