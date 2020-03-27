#!/usr/bin/env node

fs = require('fs');
spfmt = require('../lib/spfmt.js');

var commander = require('commander')
    .option('-i, --indent <DEPTH>', "indent depth", 2)
    .version(require("../package.json").version)
    .arguments('<SPARQL>');

splitShortOptions = (argv) => {
  var index = 0;
  var matched;
  const shortOptions = commander.options.filter((option) => option.short).map((option) => option.short[1]);
  var splitted = [];
  argv.forEach(arg => {
    const matched = arg.match(/^-(\w+)$/);
    if(matched && matched[1].length > 1 && !shortOptions.includes(matched[1][1]) ) {
      splitted.push(`-${matched[1][0]}`);
      splitted.push(matched[1].substring(1));
    } else {
      splitted.push(arg);
    }
  });
  return splitted;
};

commander.parse(splitShortOptions(process.argv));

var sparqlQuery;

if(commander.args[0]) {
  sparqlQuery = fs.readFileSync(commander.args[0], "utf8").toString();
} else if (process.stdin.isTTY) {
  commander.help();
} else {
  sparqlQuery = fs.readFileSync(0).toString();
}

console.log(spfmt.reformat(sparqlQuery, commander.indent));
