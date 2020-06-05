#!/usr/bin/env node

const syncRequest = require('sync-request');
const prefixModule = require('../lib/prefix.js');

const program = require('commander')
      .option('-r, --prefix <PREFIX_FILES>', 'read prefix declarations (default: SPANG_DIR/etc/prefix,~/.spang/prefix)')
      .option('-n, --ignore', 'ignore user-specific file (~/.spang/prefix) for test purpose')
      .option('-q, --quit', 'show expanded URI and quit')
      .version(require("../package.json").version)
      .arguments('<URI>')
      .parse(process.argv);

if (program.args.length == 0) {
  program.help();
}

if (program.prefix) {
  prefixModule.setPrefixFiles(program.prefix.split(',').map(path => path.trim()));
} else if (program.ignore) { // --prefix has priority over --ignore
  prefixModule.setPrefixFiles([`${__dirname}/../etc/prefix`]);
} else { // default paths
  prefixModule.setPrefixFiles([`${__dirname}/../etc/prefix`, `${require('os').homedir()}/.spang/prefix`]);
}

const uri = prefixModule.expandPrefixedUri(program.args[0]);

if (uri) {
  if (program.quit) {
    console.log(uri);
    process.exit(0);
  }

  const text = syncRequest('GET', uri).getBody('utf8');
  console.log(text);
}
