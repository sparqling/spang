const prefixModule = require('../lib/prefix.js');
const alias = require('../lib/alias.js');

exports.initialize = (opts) => {
  // --prefix has priority over --ignore-user-prefix
  if (opts.prefix) {
    prefixModule.setPrefixFiles(opts.prefix.split(',').map((path) => path.trim()));
  } else if (opts.ignoreUserPrefix) {
    prefixModule.setPrefixFiles([`${__dirname}/../etc/prefix`]);
  } else if (opts.ignoreLocalPrefix) {
  } else {
    prefixModule.setPrefixFiles([`${__dirname}/../etc/prefix`, `${require('os').homedir()}/.spang/prefix`]);
    // default
  }

  alias.setAliasFiles([`${__dirname}/../etc/alias`, `${require('os').homedir()}/.spang/alias`]);
};
