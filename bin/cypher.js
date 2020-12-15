#!/usr/bin/env node

fs = require('fs');

const search_db_name = require('../lib/search_db_name');
const prefixModule = require('../lib/prefix.js');
const shortcut = require('../lib/cypher_shortcut.js').shortcut;
const constructCypher = require('../lib/construct_cypher.js').constructCypher;
const queryCypher = require('../lib/query_cypher.js');
const syncRequest = require('sync-request');
const columnify = require('columnify');
const csvParse = require('csv-parse/lib/sync');
const metadataModule = require('../lib/metadata.js');

let templatePath;
let templateSpecified;
let queryTemplate;
let metadata;
let db;
let parameterArr = [];
let parameterMap = {};
let retrieveByGet = false;
const input = process.stdin.isTTY ? '' : fs.readFileSync(process.stdin.fd, 'utf8');

const commander = require('commander')
  .option('-e, --endpoint <ENDPOINT>', 'target endpoint (alias in ~/.spang/endpoints)', 'http://localhost:7474/db/data/transaction/commit')
  .option('--user <USER>', 'username', 'neo4j')
  .option('--pass <PASS>', 'password', 'neo4j')
  .option('-f, --format <FORMAT>', 'tsv, json', 'tsv')
  .option('-c, --align_column', 'align output columns (only valid for tsv)')
  .option('-v, --vars', 'variable names are included in output (in the case of tsv format)')
  .option('-n, --node <LABEL>', 'shortcut to search for node with LABEL')
  .option('-P, --props <PROP,...>', 'shortcut to select output properties')
  .option('-F, --filter <PROP:VAL,...>', 'shortcut to filter by property values for nodes')
  .option('-L, --limit <LIMIT>', 'LIMIT output')
  .option('-N, --count', 'shortcut to COUNT results')
  .option('-G, --graph', 'count relations in the whole graph')
  .option('-r, --relation <LABEL>', 'shortcut to search for relation with LABEL')
  .option('-p, --param <PARAMS>', 'parameters to be embedded (in the form of "--param par1=val1,par2=val2,...")')
  .option('-q, --show_query', 'show query and quit')
  .option('--show_metadata', 'show metadata and quit')
  .option('-l, --list_nick_name', 'list up available nicknames of endpoints and quit')
  .option('--time', 'measure time of query execution (exluding construction of query)')
  .arguments('[QUERY_TEMPLATE] [par1=val1,par2=val2,...]')
  .action((s) => {
    templatePath = s;
  });

commander.parse(process.argv);

const dbMap = search_db_name.listup();

if (commander.args.length < 1) {
  if (!commander.node && !commander.filter && !commander.props && !commander.count && !commander.relation && !commander.graph && !commander.limit) {
    console.error('Specify a query (template or shortcut).\n');
    commander.help();
  } else if (!commander.endpoint && !dbMap['default']) {
    console.error('Specify the target endpoint (using -e option or in <QUERY_TEMPLATE>).\n');
    commander.help();
  }
}

if (commander.node || commander.filter || commander.props || (commander.limit && !templatePath) || commander.count || commander.graph || commander.relation) {
  queryTemplate = shortcut(
    { S: commander.node, F: commander.filter, P: commander.props, L: commander.limit, N: commander.count, G: commander.graph, R: commander.relation },
    prefixModule.getPrefixMap()
  );
  templateSpecified = false;
  metadata = {};
} else {
  if (/^(http|https):\/\//.test(templatePath)) {
    queryTemplate = syncRequest('GET', templatePath).getBody('utf8');
  } else {
    queryTemplate = fs.readFileSync(templatePath, 'utf8');
  }
  metadata = metadataModule.retrieveMetadata(queryTemplate);
  if (metadata.option) {
    let args = process.argv;
    args = args.concat(metadata.option.split(/\s+/));
    commander.parse(args);
  }
  templateSpecified = true;
}

if (commander.list_nick_name) {
  console.log('endpoints');
  const maxLen = Object.keys(dbMap)
    .map((key) => key.length)
    .reduce((a, b) => Math.max(a, b));
  for (const entry in dbMap) {
    console.log(` ${entry.padEnd(maxLen, ' ')} ${dbMap[entry].url}`);
  }
  process.exit(0);
}

if (commander.param) {
  const params = commander.param.split(',');
  parameterArr = parameterArr.concat(params);
}

if (commander.args.length > 1) {
  const params = commander.args.slice(1).map((par) => par.split(','));
  parameterArr = parameterArr.concat(params.flat());
}

let positionalArguments = [];
let inPositional = true;
parameterArr.forEach((par) => {
  [k, v] = par.split(/=(.+)/);
  if (v) {
    inPositional = false;
    parameterMap[k] = v;
  } else {
    if (!inPositional) {
      console.error(`Positional arguments must precede named arguments: ${parameterArr}`);
      process.exit(-1);
    }
    positionalArguments.push(par);
  }
});

if (templateSpecified) {
  queryTemplate = constructCypher(queryTemplate, metadata, parameterMap, positionalArguments, input);
  if (commander.limit) {
    if (!queryTemplate.endsWith('\n')) {
      queryTemplate += '\n';
    }
    queryTemplate += `LIMIT ${commander.limit}\n`;
  }
}

if (commander.show_query) {
  process.stdout.write(queryTemplate);
  process.exit(0);
}

if (commander.show_metadata) {
  console.log(JSON.stringify(metadata));
  process.exit(0);
}

if (commander.endpoint) {
  db = commander.endpoint;
} else if (metadata.endpoint) {
  db = metadata.endpoint;
} else if (dbMap['default']) {
  db = dbMap['default'].url;
} else {
  console.error('Endpoint is required');
  process.exit(-1);
}

let auth = {};
if (commander.user && commander.pass) {
  auth = {
    user: commander.user,
    password: commander.pass
  };
}

if (/^\w/.test(db)) {
  if (!/^(http|https):\/\//.test(db)) {
    if (!dbMap[db]) {
      console.error(`${db}: no such endpoint`);
      process.exit(-1);
    }
    [db, retrieveByGet] = search_db_name.searchDBName(db);
  }
  let start = new Date();
  queryCypher(db, queryTemplate, commander.format, auth, (error, statusCode, bodies) => {
    if (!error && statusCode == 200) {
      let end = new Date() - start;
      if (bodies.length == 1) {
        if (commander.format == 'tsv') {
          printTsv(jsonToTsv(bodies[0], Boolean(commander.vars)));
        } else {
          console.log(bodies[0]);
        }
        if (commander.time) {
          console.error('Time of query: %dms', end);
        }
      } else {
        console.error('The results are paginated.');
      }
    } else {
      console.error('Error: ' + statusCode);
      console.error(bodies);
    }
  });
} else {
  console.error(`${db}: no such file`);
  process.exit(-1);
}

jsonToTsv = (body, withHeader) => {
  const obj = JSON.parse(body);
  let tsv = '';

  if (obj.results.length > 0) {
    if (withHeader) {
      tsv += obj.results[0].columns.join('\t') + '\n';
    }
    data = obj.results[0].data;
    if (data.length > 0) {
      tsv += data
        .map((elem) => {
          row = elem.row.map(JSON.stringify);
          meta = elem.meta
            .filter(Boolean) // remove null elements
            .map(JSON.stringify);
          return row.concat(meta).join('\t')
        })
        .join('\n') + '\n';
    }
  }
  if (obj.errors.length > 0) {
    tsv += obj.errors.map(JSON.stringify).join('\n') + '\n';
  }

  return tsv;
};

printTsv = (tsv) => {
  if (commander.align_column) {
    console.log(
      columnify(csvParse(tsv, { columns: Boolean(commander.vars), delimiter: '\t', relax: true }), {
        // relax csvParse to accept "hoge"^^xsd:string
        showHeaders: Boolean(commander.vars),
        headingTransform: (x) => x,
      }).replace(/\s+$/gm, '')
    );
  } else {
    process.stdout.write(tsv);
  }
};
