const prefixModule = require('../lib/prefix.js');
const alias = require('../lib/alias.js');

exports.initialize = (commander) => {
  if (commander.prefix) {
    prefixModule.setPrefixFiles(commander.prefix.split(',').map((path) => path.trim()));
  } else if (commander.ignore) {
    // --prefix has priority over --ignore
    prefixModule.setPrefixFiles([`${__dirname}/../etc/prefix`]);
  } else if (commander.ignore_local_prefix) {
  } else {
    // default paths
    prefixModule.setPrefixFiles([`${__dirname}/../etc/prefix`, `${require('os').homedir()}/.spang/prefix`]);
  }

  alias.setAliasFiles([`${__dirname}/../etc/alias`, `${require('os').homedir()}/.spang/alias`]);
}
