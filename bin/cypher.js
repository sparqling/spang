#!/usr/bin/env node

fs = require('fs');

const search_db_name = require('../lib/search_db_name');
const request = require('request');
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
  .option('-r, --relation <LABEL>', 'shortcut to search for relation with LABEL')
  .option('-n, --node <LABEL>', 'shortcut to search for node with LABEL')
  .option('-i, --id <ID>', 'specify id of node')
  .option('-p, --props <PROP:VAL,...>', 'shortcut to filter by property values for nodes')
  .option('-R, --ret <PROP,...>', 'shortcut to select output node properties')
  .option('-L, --limit <LIMIT>', 'LIMIT output')
  .option('-C, --count', 'shortcut to COUNT results')
  .option('-q, --show_query', 'show query and quit')
  .option('--show_metadata', 'show metadata and quit')
  .option('--param <PARAMS>', 'parameters to be embedded (in the form of "--param par1=val1,par2=val2,...")')
  .option('--time', 'measure time of query execution (exluding construction of query)')
  .option('-l, --list_nick_name', 'list up available nicknames of endpoints and quit')
  .arguments('[QUERY_TEMPLATE] [par1=val1,par2=val2,...]')
  .action((s) => {
    templatePath = s;
  });

commander.parse(process.argv);

const dbMap = search_db_name.listup();

if (commander.args.length < 1) {
  if (!commander.node && !commander.props && !commander.ret && !commander.count && !commander.relation && !commander.id && !commander.limit) {
    console.error('Specify a query (template or shortcut).\n');
    commander.help();
  } else if (!commander.endpoint && !dbMap['default']) {
    console.error('Specify the target endpoint (using -e option or in <QUERY_TEMPLATE>).\n');
    commander.help();
  }
}

if (commander.node || commander.props || commander.ret || (commander.limit && !templatePath) || commander.count || commander.id || commander.relation) {
  queryTemplate = shortcut(
    { n: commander.node, p: commander.props, R: commander.ret, L: commander.limit, C: commander.count, i: commander.id, r: commander.relation }
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

if (/^\w/.test(db)) {
  if (!/^(http|https):\/\//.test(db)) {
    if (!dbMap[db]) {
      console.error(`${db}: no such endpoint`);
      process.exit(-1);
    }
    [db, retrieveByGet] = search_db_name.searchDBName(db);
  }
  queryCypher(db, queryTemplate);
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
      tsv +=
        data
          .map((elem) => {
            row = elem.row.map(JSON.stringify);
            meta = elem.meta
              .filter(Boolean) // remove null elements
              .map(JSON.stringify);
            return row.concat(meta).join('\t');
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
        headingTransform: (x) => x
      }).replace(/\s+$/gm, '')
    );
  } else {
    process.stdout.write(tsv);
  }
};

function queryCypher(endpoint, query) {
  const options = {
    uri: endpoint,
    followAllRedirects: true,
    headers: {
      'Content-type': 'application/json'
    },
    body: query
  };

  if (commander.user && commander.pass) {
    options.auth = {
      user: commander.user,
      password: commander.pass
    };
  }

  let start = new Date();
  request.post(options, (error, response, body) => {
    if (error !== null) {
      console.error(error);
      return false;
    }
    if (error || response.statusCode != 200) {
      console.error('Error: ' + response.statusCode);
      console.error(body);
    } else {
      let end = new Date() - start;
      if (commander.format == 'tsv') {
        printTsv(jsonToTsv(body, Boolean(commander.vars)));
      } else {
        console.log(body);
      }
      if (commander.time) {
        console.error('Time of query: %dms', end);
      }
    }
  });
}

function constructCypher(queryTemplate, metadata, parameterMap, positionalArguments, input = '') {
  if (metadata.param) {
    parameterMap = { ...Object.fromEntries(metadata.param.entries()), ...parameterMap };
    let i = 0;
    for (let param of metadata.param.keys()) {
      if (i >= positionalArguments.length) break;
      parameterMap[param] = positionalArguments[i++];
    }
  }

  // get input, or use metadata by default
  if (input) {
    parameterMap['INPUT'] = input
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => '(' + line + ')')
      .join(' ');
  } else if (metadata.input) {
    parameterMap['INPUT'] = '(' + metadata.input.join(' ') + ')';
  }

  let cypher = '';
  queryTemplate.split('\n').forEach((line) => {
    if (!line.match(/^\s*(#|\/\/)/)) {
      cypher += ' ' + line;
    }
  });

  let json = '{\n';
  json += '  "statements": [\n';
  json += `    { "statement": "${cypher.trim()}" }\n`;
  json += '  ]\n';
  json += '}\n';
  return json;
}

function shortcut(options) {
  let cypher = 'MATCH ';

  let node = 'n';
  if (options.n) {
    node += ` ${options.n}`;
  }
  if (options.p) {
    node += ` { ${options.p} }`;
  }

  let where = '';
  if (options.i) {
    where = ` WHERE id(n)=${options.i}`;
  }

  let limit = ' LIMIT 10';
  if (options.L) {
    limit = ` LIMIT ${options.L}`;
  }

  let retNode = 'n';
  if (options.R) {
    retNode = options.R.split(',').map(v => {
      return v.includes('.') ? v : `n.${v}`;
    }).join(',');
  }
  retNode += limit;
  if (options.C) {
    retNode = 'COUNT(n)';
  }

  if (options.r) {
    cypher += `(n1)-[r:${options.r}]->(n2)`;
    cypher += ' RETURN ';
    if (options.C) {
      cypher += 'COUNT(r)';
    } else {
      if (options.R) {
        const vars1 = options.R.split(',').map(v => `n1.${v}`).join(',');
        const vars2 = options.R.split(',').map(v => `n2.${v}`).join(',');
        cypher += `${vars1},${vars2}`;
      } else {
        cypher += `n1,n2`;
      }
      cypher += limit;
    }
  // } else if (options.G) {
  //   cypher += '(n)-[r]->() RETURN COUNT(r)';
  } else {
    cypher += `(${node})${where} RETURN ${retNode}`;
  }

  cypher = cypher.replace(/\"/g, '\\"').trim();

  let json = '{\n';
  json += '  "statements": [\n';
  json += `    { "statement": "${cypher}" }\n`;
  json += '  ]\n';
  json += '}\n';
  return json;
}
