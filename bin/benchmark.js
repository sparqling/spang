#!/usr/bin/env node

const fs = require('fs');
const { spawnSync } = require("child_process");
const { convertArrayToCSV } = require('convert-array-to-csv');
const ls = require('ls');


let jsonPath;

const commander = require('commander')
      .option('-i, --iteration <ITERATION_NUM>', 'number of iteration of measurement', 1)
      .option('-d, --delimiter <DELIMITER>', 'delimiter of output', ',')
      .arguments('[json_path]')
      .action((s) => {
        jsonPath = s;
      });

commander.parse(process.argv);

readFile = (path) => fs.readFileSync(path, "utf8").toString();

json = JSON.parse(readFile(commander.args[0]));

let rows = [];

function measureQuery(queryPath, expected){
  console.error(`${queryPath} started...`);
  let row = [queryPath];
  let times = [];
  for(let i = 0; i < commander.iteration; i++) {
    console.error(`${i}...`);
    let result = spawnSync('spang2', ['--time', queryPath]);
    if(result.status) // error
    {
      console.error("error!");
      row.push(result.stderr.toString());
    } else {
      let time = result.stderr.toString().match(/(\d+)ms/)[1];
      times.push(time);
      if(!expected || expected === result.stdout.toString()) {
        console.error(time);
        row.push(time);
      } else {
        row.push(`${time}_wrong`);
      }
    }
  }
  const average = times.map((t) => parseInt(t)).reduce((a, b) => a+b, 0) / times.length;
  row.push(average.toString());
  rows.push(row);
};

for(let benchmark of json)
{
  const expected = benchmark.expected ? readFile(benchmark.expected) : null;
  for(let file of ls(benchmark.query)) {
    measureQuery(file.full, expected);
  }
}

header = ['name']
header = header.concat(Array.from({length:commander.iteration},(_,k)=>k+1));
header.push('average');

csv = convertArrayToCSV(rows, { header, separator: commander.delimiter });

console.log(csv);
