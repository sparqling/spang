#!/usr/bin/env node

fs = require('fs');
spfmt = require('../lib/spfmt.js');

var commander = require('commander')
    .version(require("../package.json").version)
    .arguments('<src>');

commander.parse(process.argv);

var src;

if(commander.args[0]) {
    src = fs.readFileSync(commander.args[0], "utf8").toString();
} else if (process.stdin.isTTY) {
  commander.help();
} else {
  src = fs.readFileSync(0).toString();
}

console.log(spfmt.reformat(src));
