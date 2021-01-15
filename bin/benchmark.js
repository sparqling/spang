#!/usr/bin/env node

const fs = require('fs');
const { spawnSync } = require('child_process');
const csvWriter = require('csv-write-stream');
const ls = require('ls');
const path = require('path');

const commander = require('commander')
  .option('-i, --iteration <ITERATION_NUM>', 'number of iteration of measurement', 1)
  .option('-d, --delimiter <DELIMITER>', 'delimiter of output', ',')
  .option('-e, --endpoint <ENDPOINT>', 'url of target endpoint')
  .option('-m, --method <METHOD>', 'method of HTTP requers (GET or POST)', 'GET')
  .option('-s, --skip_comparison', 'skip comparison with expected result')
  .option('-p, --pattern <REGEX>', 'extra constraint for file pattern specified in regex')
  .option('--exclude <REGEX>', 'extra constraint for file pattern to be excluded specified in regex')
  .option('--sec', 'output in "sec" (default: in "ms")')
  .option('--output_error', 'output to stderr')
  .option('-a, --average', 'calculate average')
  .option('-v, --verbose', 'output progress to stderr')
  .arguments('[json_or_queries...]');

commander.parse(process.argv);

if (commander.args.length < 1) {
  commander.help();
}

header = ['name'];
header = header.concat(Array.from({ length: commander.iteration }, (_, k) => k + 1));
if (commander.average) {
  header.push('average');
}

let writer = csvWriter({
  separator: commander.delimiter,
  newline: '\n',
  headers: header,
  sendHeaders: true
});

writer.pipe(process.stdout);
readFile = (path) => fs.readFileSync(path, 'utf8').toString();

benchmarks = [];
for (let arg of commander.args) {
  if (arg.endsWith('.json')) {
    benchmarks = benchmarks.concat(JSON.parse(readFile(arg)));
  } else {
    benchmarks.push({
      query: arg
    });
  }
}

let rows = [];

function measureQuery(queryPath, expected) {
  let row = { name: queryPath };
  let times = [];
  if (commander.verbose) console.error(queryPath);
  for (let i = 0; i < commander.iteration; i++) {
    let column = (i + 1).toString();
    if (commander.verbose) console.error(`query: ${column}`);
    let arguments = ['--time', queryPath, '--method', commander.method];
    if (commander.endpoint) arguments = arguments.concat(['--endpoint', commander.endpoint]);
    let result = spawnSync('spang2', arguments);
    if (result.status) {
      // error
      row[column] = result.stderr.toString();
    } else {
      let matched = result.stderr.toString().match(/(\d+)ms/);
      if (matched) {
        time = matched[1];
        if (commander.sec) {
          time = time / 1000;
        }
        times.push(time);
        if (!expected || expected === result.stdout.toString()) {
          row[column] = time;
        } else {
          row[column] = `${time}_wrong`;
          if (commander.output_error) {
            console.error(result.stdout.toString());
          }
        }
      } else {
        row[column] = `no_time`;
      }
    }
    if (commander.verbose) console.error(row[column]);
  }
  if (commander.average) {
    const average = times.map((t) => parseInt(t)).reduce((a, b) => a + b, 0) / times.length;
    row['average'] = average.toString();
  }
  writer.write(row);
}

const pattern = commander.pattern ? new RegExp(commander.pattern) : null;
const exclude = commander.exclude ? new RegExp(commander.exclude) : null;

for (let benchmark of benchmarks) {
  const queries = ls(benchmark.query);
  for (let file of queries) {
    if (pattern && !file.full.match(pattern)) continue;
    if (exclude && file.full.match(exclude)) continue;
    let expected = null;
    const defaultExpectedName = file.full.replace(/\.[^/.]+$/, '') + '.txt';
    if (!commander.skip_comparison) {
      if (!benchmark.expected && fs.existsSync(defaultExpectedName)) {
        expected = readFile(defaultExpectedName);
      } else if (benchmark.expected) {
        let files = ls(benchmark.expected);
        const basename = path.basename(defaultExpectedName);
        if (files.length == 1) {
          expected = readFile(files[0].full);
        } else {
          const matched = files.find((file) => file.file === basename);
          if (matched) {
            expected = readFile(matched.full);
          }
        }
      }
    }
    measureQuery(file.full, expected);
  }
}

writer.end();
