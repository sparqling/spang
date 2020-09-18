#!/usr/bin/env node

const fs = require('fs');
const { spawnSync } = require("child_process");
const csvWriter = require('csv-write-stream')
const ls = require('ls');
const path = require('path');


let jsonPath;

const commander = require('commander')
      .option('-i, --iteration <ITERATION_NUM>', 'number of iteration of measurement', 1)
      .option('-d, --delimiter <DELIMITER>', 'delimiter of output', ',')
      .option('-e, --endpoint <ENDPOINT>', 'url of target endpoint')
      .option('-m, --method <METHOD>', 'method of HTTP requers (GET or POST)', 'GET')
      .option('-s, --skip_comparison', 'skip comparison with expected result')
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
    let arguments =  ['--time', queryPath, '--method', commander.method];
    if(commander.endpoint)
      arguments = arguments.concat(['--endpoint', commander.endpoint]);
    let result = spawnSync('spang2', arguments);
    if(result.status) // error
    {
      row[column] = result.stderr.toString();
    } else {
      let matched = result.stderr.toString().match(/(\d+)ms/);
      if(matched) {
        time = matched[1];
        times.push(time);
        if(!expected || expected === result.stdout.toString()) {
          row[column] = time;
        } else {
          row[column] = `${time}_wrong`;
        }
      } else {
        row[column] = `no_time`;
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
  const queries = ls(benchmark.query);
  for(let file of queries) {
    let expected = null;
    const defaultExpectedName = file.full.replace(/\.[^/.]+$/, "") + '.txt'
    if(!commander.skip_comparison) {
      if(!benchmark.expected && fs.existsSync(defaultExpectedName)) {
        expected = readFile(defaultExpectedName);
      } else if(benchmark.expected) {
        let files = ls(benchmark.expected);
        const basename = path.basename(defaultExpectedName);
        if(files.length == 1)
          expected = readFile(files[0].full);
        else {
          const matched = files.find((file) => file.file === basename);
          if(matched) {
            expected = readFile(matched);
          }
        }
      }
    }
    measureQuery(file.full, expected);
  }
}

writer.end();
