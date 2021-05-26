const prefixModule = require('../lib/prefix.js');
const alias = require('../lib/alias.js');

exports.initialize = (commander) => {
  // --prefix has priority over --ignore-user-prefix
  if (commander.prefix) {
    prefixModule.setPrefixFiles(commander.prefix.split(',').map((path) => path.trim()));
  } else if (commander.ignoreUserPrefix) {
    prefixModule.setPrefixFiles([`${__dirname}/../etc/prefix`]);
  } else if (commander.ignoreLocalPrefix) {
  } else {
    prefixModule.setPrefixFiles([`${__dirname}/../etc/prefix`, `${require('os').homedir()}/.spang/prefix`]);
    // default
  }

  alias.setAliasFiles([`${__dirname}/../etc/alias`, `${require('os').homedir()}/.spang/alias`]);
}
