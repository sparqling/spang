#!/usr/bin/env node

sparqljs = require('sparqljs');
fs = require('fs');

var commander = require('commander').version(require("./package.json").version)
    .arguments('<src>');

commander.parse(process.argv)

var src;

if(commander.args[0]) {
  src = fs.readFileSync(commander.args[0]).toString();
} else {
  src = fs.readFileSync(0).toString();
}

function reformatSPARQL(sparql, options = {}) {
  var parsedQuery = new sparqljs.Parser().parse(sparql);
  var generator = new sparqljs.Generator(options);
  return generator.stringify(parsedQuery);
}

console.log(reformatSPARQL(src));
