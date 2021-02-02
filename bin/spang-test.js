#!/usr/bin/env node

const fs = require('fs');
const { spawnSync } = require('child_process');
const csvWriter = require('csv-write-stream');
const ls = require('ls');
const path = require('path');

const readFile = (path) => fs.readFileSync(path, 'utf8').toString();

const commander = require('commander')
  .option('-c, --command <COMMAND>', 'command', 'spang2')
  .option('-n, --iteration <ITERATION_NUM>', 'number of iteration of measurement', 1)
  .option('-d, --delimiter <DELIMITER>', 'delimiter of output', '\t')
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

let benchmarks = [];
for (let arg of commander.args) {
  if (arg.endsWith('.json')) {
    benchmarks = benchmarks.concat(JSON.parse(readFile(arg)));
  } else {
    benchmarks.push({ query: arg });
  }
}

const pattern = commander.pattern ? new RegExp(commander.pattern) : null;
const exclude = commander.exclude ? new RegExp(commander.exclude) : null;

let header = ['name', 'time', 'valid'];
if (commander.average) {
  header.splice(2, 0, 'average');
}

let writer = csvWriter({ separator: commander.delimiter, newline: '\n', headers: header, sendHeaders: true });
writer.pipe(process.stdout);

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

function measureQuery(queryPath, expected) {
  let row = { name: queryPath };
  let times = [];
  let validations = [];
  if (commander.verbose) console.error(queryPath);
  for (let i = 0; i < commander.iteration; i++) {
    let column = (i + 1).toString();
    if (commander.verbose) console.error(`query: ${column}`);
    let arguments = ['--time', queryPath, '--method', commander.method];
    if (commander.endpoint) arguments = arguments.concat(['--endpoint', commander.endpoint]);
    let result = spawnSync(commander.command, arguments, { maxBuffer: Infinity });
    if (result.status) {
      // error
      console.error(result.stderr.toString());
      times.push('null');
      validations.push('null');
    } else {
      let matched = result.stderr.toString().match(/(\d+)ms/);
      if (matched) {
        time = matched[1];
        if (commander.sec) {
          time = time / 1000;
        }
        times.push(time);
        if (!expected) {
          validations.push('null');
        }
        else if (expected === result.stdout.toString()) {
          validations.push('true');
        } else {
          validations.push('false');
          if (commander.output_error) {
            console.error(result.stdout.toString());
          }
        }
      } else {
        times.push('null');
        validations.push('null');
      }
      if (commander.verbose) console.error(`time: ${times[times.length - 1]}, valid: ${validations[validations.length - 1]}`);
    }
  }
  row['time'] = times.join(',');
  row['valid'] = validations.join(',');
  if (commander.average) {
    let validTimes = times.filter(time => time !== 'null');
    const average = validTimes.map((t) => parseInt(t)).reduce((a, b) => a + b, 0) / validTimes.length;
    row['average'] = average.toString();
  }
  writer.write(row);
}
