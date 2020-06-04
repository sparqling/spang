#!/usr/bin/env node

const syncRequest = require('sync-request');
const prefixModule = require('../lib/prefix.js');

const program = require('commander')
      .option('-r, --prefix <PREFIX_FILES>', 'read prefix declarations (default: SPANG_DIR/etc/prefix,~/.spang/prefix)')
      .option('-q, --quit', 'show expanded URI and quit')
      .version(require("../package.json").version)
      .arguments('<URI>')
      .parse(process.argv);

if (program.args.length == 0) {
  program.help();
}
const arg = program.args[0];
let uri;

if (program.prefix) {
  prefixModule.setPrefixFiles(program.prefix.split(',').map(path => path.trim()));
} else if (program.ignore) { // --prefix has priority over --ignore
  prefixModule.setPrefixFiles([`${__dirname}/../etc/prefix`]);
} else { // default paths
  prefixModule.setPrefixFiles([`${__dirname}/../etc/prefix`, `${require('os').homedir()}/.spang/prefix`]);
}

if (/^(http|https):\/\//.test(arg)) {
  uri = arg;
} else if (/^\w+:/.test(arg)) {
  const matched = arg.match(/^(\w+):(.*)$/);
  uri = expandPrefix(matched[1]) + matched[2];
} else {
  uri = expandPrefix(arg);
}

if (uri) {
  if (program.quit) {
    console.log(uri);
    process.exit(0);
  }

  const text = syncRequest('GET', uri).getBody('utf8');
  console.log(text);
}

// Function
function expandPrefix(prefix){
  const line = prefixModule.searchPrefix(prefix);
  if (line) {
    const tokens = line.split(/\s+/);
    if(tokens.length == 3 && tokens[0] == 'PREFIX' &&
       tokens[1].endsWith(':') && tokens[2].startsWith('<') &&
       tokens[2].endsWith('>'))
    {
      const expanded = tokens[2].substring(1, tokens[2].length - 1);
      return expanded;
    }
  }
}
