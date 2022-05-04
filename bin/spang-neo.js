#!/usr/bin/env node

fs = require('fs');

const program = require('commander');
const axios = require('axios');
const syncRequest = require('sync-request');
const columnify = require('columnify');
const csvParse = require('csv-parse/lib/sync');
const search_db_name = require('../lib/search_db_name');
const metadataModule = require('../lib/metadata.js');

let templatePath;
let templateSpecified;
let queryTemplate;
let metadata;
let db;
let parameterArr = [];
let parameterMap = {};
let retrieveByGet = false;

let opts = program
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
  .option('--path', 'output path')
  .option('--show_metadata', 'show metadata and quit')
  .option('--param <PARAMS>', 'parameters to be embedded (in the form of "--param par1=val1,par2=val2,...")')
  .option('--time', 'measure time of query execution (exluding construction of query)')
  .option('-l, --list_nick_name', 'list up available nicknames of endpoints and quit')
  .arguments('[QUERY_TEMPLATE] [par1=val1,par2=val2,...]')
  .action((s) => {
    templatePath = s;
  })
  .parse(process.argv)
  .opts();

const dbMap = search_db_name.listup();

if (program.args.length < 1) {
  if (!opts.node && !opts.props && !opts.ret && !opts.count && !opts.relation && !opts.id && !opts.limit) {
    console.error('Specify a query (template or shortcut).\n');
    program.help();
  } else if (!opts.endpoint && !dbMap['default']) {
    console.error('Specify the target endpoint (using -e option or in <QUERY_TEMPLATE>).\n');
    program.help();
  }
}

if (opts.node || opts.props || opts.ret || (opts.limit && !templatePath) ||
    opts.count || opts.id || opts.relation) {
  queryTemplate = shortcut();
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
    let args = program.args;
    args = args.concat(metadata.option.split(/\s+/));
    opts.parse(args);
  }
  templateSpecified = true;
}

if (opts.list_nick_name) {
  console.log('endpoints');
  const maxLen = Object.keys(dbMap)
    .map((key) => key.length)
    .reduce((a, b) => Math.max(a, b));
  for (const entry in dbMap) {
    console.log(` ${entry.padEnd(maxLen, ' ')} ${dbMap[entry].url}`);
  }
  process.exit(0);
}

if (opts.param) {
  const params = opts.param.split(',');
  parameterArr = parameterArr.concat(params);
}

if (program.args.length > 1) {
  const params = program.args.slice(1).map((par) => par.split(','));
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
  queryTemplate = constructCypher(queryTemplate, metadata, parameterMap, positionalArguments);
  if (opts.limit) {
    if (!queryTemplate.endsWith('\n')) {
      queryTemplate += '\n';
    }
    queryTemplate += `LIMIT ${opts.limit}\n`;
  }
}

if (opts.show_query) {
  process.stdout.write(queryTemplate);
  process.exit(0);
}

if (opts.show_metadata) {
  console.log(JSON.stringify(metadata));
  process.exit(0);
}

if (opts.endpoint) {
  db = opts.endpoint;
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

function toTsv(obj, withHeader) {
  let tsv = '';

  if (obj.results.length > 0) {
    const columns = obj.results[0].columns;
    const data = obj.results[0].data;
    if (opts.path) {
      if (columns.length === data[0].row.length && data[0].row.length === data[0].meta.length) {
        for (let i=0; i<columns.length; i++) {
          if (withHeader) {
            tsv += columns[i] + '\n';
          }
          let row = data[0].row[i];
          let meta = data[0].meta[i];
          if (row.length === meta.length) {
            for (let j=0; j<row.length; j++) {
              tsv += JSON.stringify(meta[j]) + '\t' + JSON.stringify(row[j]) + '\n';
            }
            tsv += '\n';
          }
        }
      }
    } else {
      if (withHeader) {
        tsv += columns.join('\t') + '\n';
      }
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
  }

  return tsv;
};

function printTsv(tsv) {
  if (opts.align_column) {
    console.log(
      columnify(csvParse(tsv, { columns: Boolean(opts.vars), delimiter: '\t', relax: true }), {
        // relax csvParse to accept "hoge"^^xsd:string
        showHeaders: Boolean(opts.vars),
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

  if (opts.user && opts.pass) {
    options.auth = {
      username: opts.user,
      password: opts.pass
    };
  }

  let start = new Date();
  axios.post(endpoint, JSON.parse(query), options).then(res => {
    let end = new Date() - start;
    if (opts.format == 'tsv') {
      printTsv(toTsv(res.data, Boolean(opts.vars)));
    } else {
      console.log(res.data);
    }
    if (opts.time) {
      console.error('Time of query: %dms', end);
    }
    if (res.data.errors.length) {
      console.error(`${res.status} ${res.statusText}`);
      res.data.errors.forEach((e) => {
        console.error('(' + e.code + ')');
        console.error(e.message);
      });
    }
  }).catch(err => {
    const res = err.response;
    console.error(`${err.code}: ${res.status} ${res.statusText}`);
    res.data.errors.forEach((e) => {
      console.error('(' + e.code + ')');
      console.error(e.message);
    });
  });
}

function constructCypher(queryTemplate, metadata, parameterMap, positionalArguments) {
  if (metadata.param) {
    parameterMap = { ...Object.fromEntries(metadata.param.entries()), ...parameterMap };
    let i = 0;
    for (let param of metadata.param.keys()) {
      if (i >= positionalArguments.length) break;
      parameterMap[param] = positionalArguments[i++];
    }
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

function shortcut() {
  let cypher = 'MATCH ';

  let node = 'n';
  if (opts.node) {
    node += ` ${opts.node}`;
  }
  if (opts.props) {
    node += ` { ${opts.props} }`;
  }

  let where = '';
  if (opts.id) {
    where = ` WHERE id(n)=${opts.id}`;
  }

  let limit = ' LIMIT 10';
  if (opts.limit) {
    limit = ` LIMIT ${opts.limit}`;
  }

  let retNode = 'n';
  if (opts.ret) {
    retNode = opts.ret.split(',').map(v => {
      return v.includes('.') ? v : `n.${v}`;
    }).join(',');
  }
  retNode += limit;
  if (opts.count) {
    retNode = 'COUNT(n)';
  }

  if (opts.relation) {
    cypher += `(n1)-[r:${opts.relation}]->(n2)`;
    cypher += ' RETURN ';
    if (opts.count) {
      cypher += 'COUNT(r)';
    } else {
      if (opts.ret) {
        const vars1 = opts.ret.split(',').map(v => `n1.${v}`).join(',');
        const vars2 = opts.ret.split(',').map(v => `n2.${v}`).join(',');
        cypher += `${vars1},${vars2}`;
      } else {
        cypher += `n1,n2`;
      }
      cypher += limit;
    }
  // } else if (opts.edges) {
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
