#!/usr/bin/env node
const program = require('commander');
const JSON5 = require('json5');
const fs = require('fs');
const ls = require('ls');

let opts = program
  .version(require("../package.json").version)
  .arguments('<ARG>')
  .parse(process.argv)
  .opts();

const file = program.args[0];
const data = fs.readFileSync(file);
const obj = JSON5.parse(data);

obj.forEach((db) => {
  console.log(db.name);
  const map = new Map
  if (db.queries) {
    db.queries.forEach((elem) => {
      map[elem] = true;
    });
    const queries = ls(`${db.name}/*.rq`);
    queries.forEach((query) => {
      if (map[query.file]) {
        console.log('+', query.file);
      } else {
        console.log('-', query.file);
      }
    });
  } else {
    console.log('- (all)');
  }
});
