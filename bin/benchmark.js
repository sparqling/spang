#!/usr/bin/env node

const fs = require('fs');
const { spawnSync } = require("child_process");
const csvWriter = require('csv-write-stream')
const ls = require('ls');


let jsonPath;

const commander = require('commander')
      .option('-i, --iteration <ITERATION_NUM>', 'number of iteration of measurement', 1)
      .option('-d, --delimiter <DELIMITER>', 'delimiter of output', ',')
      .option('-v, --verbose', 'output progress to stderr')
      .arguments('[json_path]')
      .action((s) => {
        jsonPath = s;
      });

commander.parse(process.argv);

header = ['name'];
header = header.concat(Array.from({length:commander.iteration},(_,k)=>k+1));
header.push('average');

let writer = csvWriter({
  separator: commander.delimiter,
  newline: '\n',
  headers: header,
  sendHeaders: true
});

writer.pipe(process.stdout);
readFile = (path) => fs.readFileSync(path, "utf8").toString();

json = JSON.parse(readFile(commander.args[0]));

let rows = [];

function measureQuery(queryPath, expected){
  let row = { 'name': queryPath };
  let times = [];
  if(commander.verbose) console.error(queryPath);
  for(let i = 0; i < commander.iteration; i++) {
    let column = (i+1).toString();
    if(commander.verbose) console.error(`query: ${column}`);
    let result = spawnSync('spang2', ['--time', queryPath]);
    if(result.status) // error
    {
      row[column] = result.stderr.toString();
    } else {
      let time = result.stderr.toString().match(/(\d+)ms/)[1];
      times.push(time);
      if(!expected || expected === result.stdout.toString()) {
        row[column] = time;
      } else {
        row[column] = `${time}_wrong`;
      }
    }
    if(commander.verbose) console.error(row[column]);
  }
  const average = times.map((t) => parseInt(t)).reduce((a, b) => a+b, 0) / times.length;
  row['average'] = average.toString();
  writer.write(row);
};

for(let benchmark of json)
{
  const expected = benchmark.expected ? readFile(benchmark.expected) : null;
  for(let file of ls(benchmark.query)) {
    measureQuery(file.full, expected);
  }
}

writer.end();
