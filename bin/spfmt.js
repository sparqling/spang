#!/usr/bin/env node

fs = require('fs');
spfmt = require('../lib/spfmt.js');

var commander = require('commander')
    .version(require("../package.json").version)
    .arguments('<SPARQL>');

commander.parse(process.argv);

var sparqlQuery;

if(commander.args[0]) {
  sparqlQuery = fs.readFileSync(commander.args[0], "utf8").toString();
} else if (process.stdin.isTTY) {
  commander.help();
} else {
  sparqlQuery = fs.readFileSync(0).toString();
}

console.log(spfmt.reformat(sparqlQuery));
