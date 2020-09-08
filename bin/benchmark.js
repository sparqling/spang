#!/usr/bin/env node

const fs = require('fs');
const { spawnSync } = require("child_process");
const { convertArrayToCSV } = require('convert-array-to-csv');


let jsonPath;

const commander = require('commander')
      .option('-i, --iteration <ITERATION_NUM>', 'number of iteration of measurement', 1)
      .arguments('[json_path]')
      .action((s) => {
        jsonPath = s;
      });

commander.parse(process.argv);

readFile = (path) => fs.readFileSync(path, "utf8").toString();

json = JSON.parse(readFile(commander.args[0]));

let rows = [];

for(let benchmark of json)
{
  const queryPath = benchmark.query;
  const expected = benchmark.expected ? readFile(benchmark.expected) : null;
  let row = [queryPath];
  let times = [];
  for(let i = 0; i < commander.iteration; i++) {
    let result = spawnSync('spang2', ['--time', queryPath]);
    if(result.status) // error
    {
      
    } else {
      let time = result.stderr.toString().match(/(\d+)ms/)[1];
      times.push(time);
      if(!expected || expected === result.stdout.toString()) {
        row.push(time);
      } else {
        row.push(`${time}_wrong`);
      }
    }
  }
  const average = times.map((t) => parseInt(t)).reduce((a, b) => a+b, 0) / times.length;
  row.push(average.toString());
  rows.push(row);
}

header = ['name']
header = header.concat(Array.from({length:commander.iteration},(_,k)=>k+1));
header.push('average');

csv = convertArrayToCSV(rows, { header });

console.log(csv);
