#!/usr/bin/env node

fs = require('fs');
reformatter = require('./reformatter.js');

var commander = require('commander').version(require("../package.json").version)
    .arguments('<src>');

commander.parse(process.argv);

var src;

if(commander.args[0]) {
  src = fs.readFileSync(commander.args[0]).toString();
} else {
  src = fs.readFileSync(0).toString();
}

console.log(reformatter.reformat(src));
