#!/usr/bin/env node

const fs = require('fs');
const child_process = require('child_process');
const csvParse = require('csv-parse/lib/sync');
const columnify = require('columnify');

const version = require('../package.json').version;
const parser = require('../lib/template_parser');
const formatter = require('../lib/formatter.js');
const metadataModule = require('../lib/metadata.js');
const prefixModule = require('../lib/prefix.js');
const search_db_name = require('../lib/search_db_name');
const shortcut = require('../lib/shortcut.js').shortcut;
const constructSparql = require('../lib/construct_sparql.js').constructSparql;
const expandTemplate = require('../lib/construct_sparql.js').expandTemplate;
const makePortable = require('../lib/construct_sparql.js').makePortable;
const querySparql = require('../lib/query_sparql.js');
const alias = require('../lib/alias.js');
const util = require('../lib/util.js');
const initializeConfig = require('../lib/config.js').initialize;
const { getReasonPhrase } = require('http-status-codes');

let templatePath;
let templateSpecified;
let sparqlTemplate;
let metadata;
let db;
let parameterArr = [];
let parameterMap = {};
let retrieveByGet = true;

const input = process.stdin.isTTY ? '' : util.stdinReadSync();

const commander = require('commander')
  .option('-e, --endpoint <ENDPOINT>', 'target SPARQL endpoint (URL or its predifined name in SPANG_DIR/etc/endpoints,~/.spang/endpoints)')
  .option('-p, --param <PARAMS>', 'parameters to be embedded (in the form of "--param par1=val1,par2=val2,...")')
  .option('-o, --outfmt <FORMAT>', 'tsv, json, n-triples (nt), turtle (ttl), rdf/xml (rdfxml), n3, xml, html', 'tsv')
  .option('-c, --align_column', 'align output columns (only valid for tsv)')
  .option('-a, --abbr', 'abbreviate results using predefined prefixes')
  .option('-v, --vars', 'variable names are included in output (in the case of tsv format)')
  .option('-S, --subject <SUBJECT>', 'shortcut to specify subject')
  .option('-P, --predicate <PREDICATE>', 'shortcut to specify predicate')
  .option('-O, --object <OBJECT>', 'shortcut to specify object')
  .option('-L, --limit <LIMIT>', 'LIMIT output')
  .option('-F, --from <FROM>', 'shortcut to search FROM specific graph (use alone or with -[SPOLN])')
  .option('-N, --number', 'shortcut to COUNT results (use alone or with -[SPO])')
  .option('-G, --graph', 'shortcut to search for graph names (use alone or with -[SPO])')
  .option('--prefix <PREFIX_FILES>', 'read prefix declarations (default: SPANG_DIR/etc/prefix,~/.spang/prefix)')
  .option('-n, --ignore', 'ignore user-specific file (~/.spang/prefix) for test purpose')
  .option('--ignore_local_prefix', 'ignore local prefix files')
  .option('-m, --method <METHOD>', 'GET or POST', 'GET')
  .option('-q, --show_query', 'show query and quit')
  .option('--show_metadata', 'show metadata and quit')
  .option('-f, --fmt', 'format the query')
  .option('-i, --indent <DEPTH>', 'indent depth; use with --fmt', 2)
  .option('-l, --list_nick_name', 'list up available nicknames of endpoints and quit')
  .option('-d, --debug', 'debug (output expanded template, or output AST with --fmt)')
  .option('--time', 'measure time of query execution (exluding construction of query)')
  .option('-r, --reset_option', 'ignore options specified in query file')
  .helpOption(false)
  .option('-h, --help', 'display help for command') // handle help explicitly
  .version(version)
  .arguments('[SPARQL_TEMPLATE] [par1=val1,par2=val2,...]')
  .action((s) => {
    templatePath = s;
  });

commander.parse(process.argv);

let opts = commander.opts();

if (opts.fmt) {
  let sparqlQuery;
  if (commander.args[0]) {
    sparqlQuery = fs.readFileSync(commander.args[0], 'utf8').toString();
  } else if (process.stdin.isTTY) {
    console.error('Format SPARQL query: input is required');
    process.exit(-1);
  } else {
    sparqlQuery = input;
  }
  const syntaxTree = parser.parse(sparqlQuery);
  if (opts.debug) {
    console.log(JSON.stringify(syntaxTree, undefined, 2)); // (value, replacer, space)
  } else {
    console.log(formatter.format(syntaxTree, opts.indent));
  }
  process.exit(0);
}

initializeConfig(opts);

const dbMap = search_db_name.listup();

if (commander.args.length < 1) {
  if (!opts.subject && !opts.predicate && !opts.object && !opts.number && !opts.from && !opts.graph && !opts.limit) {
    console.error(`SPANG v${version}: Specify a SPARQL query (template or shortcut).\n`);
    commander.help();
  } else if (!opts.endpoint && !dbMap['default']) {
    console.error(`SPANG v${version}: Specify the target SPARQL endpoint (using -e option or in <SPARQL_TEMPLATE>).\n`);
    commander.help();
  }
}

if (opts.subject || opts.predicate || opts.object || (opts.limit && !templatePath) || opts.number || opts.graph || opts.from) {
  sparqlTemplate = shortcut({ S: opts.subject, P: opts.predicate, O: opts.object, L: opts.limit, N: opts.number, G: opts.graph, F: opts.from });
  templateSpecified = false;
  metadata = {};
} else {
  templatePath = alias.replaceIfAny(templatePath);
  const templateURL = prefixModule.expandPrefixedUri(templatePath);
  if (templateURL) {
    const syncRequest = require('sync-request');
    sparqlTemplate = syncRequest('GET', templateURL).getBody('utf8');
  } else {
    sparqlTemplate = fs.readFileSync(templatePath, 'utf8');
  }
  metadata = metadataModule.retrieveMetadata(sparqlTemplate);
  if (metadata.option && !opts.reset_option) {
    let args = process.argv;
    args = args.concat(metadata.option.split(/\s+/));
    commander.parse(args);
    opts = commander.opts();
  }
  templateSpecified = true;
}

if (templateSpecified && opts.help) {
  if (metadata.title) {
    console.log(`${metadata.title}`);
  }
  if (metadata.param) {
    Array.from(metadata.param.entries()).forEach(([k,v]) => {
      console.log(`parameter: ${k}=${v}`);
    });
  }
  if (metadata.endpoint) {
    if (dbMap[metadata.endpoint]) {
      console.log(`endpoint: ${dbMap[metadata.endpoint].url}`);
    } else {
      console.log(`endpoint: ${metadata.endpoint}`);
    }
  }
  if (metadata.input) {
    console.log(`input: ${metadata.input}`);
  }
  if (metadata.option) {
    console.log(`option: ${metadata.option}`);
  }
  process.exit(0);
} else if (opts.help) {
  commander.help();
  process.exit(0);
}

if (opts.list_nick_name) {
  console.log('SPARQL endpoints');
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

if (opts.debug) {
  sparqlTemplate = expandTemplate(sparqlTemplate, metadata, parameterMap, positionalArguments, input)
  process.stdout.write(makePortable(sparqlTemplate, dbMap));
  process.exit(0);
}

if (templateSpecified) {
  sparqlTemplate = constructSparql(sparqlTemplate, metadata, parameterMap, positionalArguments, input);
  if (opts.limit) {
    if (!sparqlTemplate.endsWith('\n')) {
      sparqlTemplate += '\n';
    }
    sparqlTemplate += `LIMIT ${opts.limit}\n`;
  }
}

if (opts.show_query) {
  process.stdout.write(makePortable(sparqlTemplate, dbMap));
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
  if (/^get$/i.test(opts.method)) {
    retrieveByGet = true;
  } else if (/^post$/i.test(opts.method)) {
    retrieveByGet = false;
  }
  let start = new Date();
  querySparql(db, sparqlTemplate, opts.outfmt, retrieveByGet, (error, statusCode, bodies) => {
    if (error) {
      if (error.code === 'ENOTFOUND') {
        console.error(`${error.code} ${error.syscall} ${error.hostname}`);
      } else if (error.code === 'ECONNREFUSED') {
        console.error(`${error.code} ${error.syscall} ${error.address}:${error.port}`);
      } else {
        console.error(error);
      }
      return;
    }
    if (statusCode != 200) {
      console.error(`${statusCode} ${getReasonPhrase(statusCode)}`);
      if (statusCode != 404 && statusCode != 414 && statusCode != 503) {
        for (let body of bodies) {
          console.error(body);
        }
      }
      return;
    }
    let end = new Date() - start;
    if (bodies.length == 1) {
      if (opts.outfmt == 'tsv') {
        printTsv(jsonToTsv(bodies[0], Boolean(opts.vars)));
      } else {
        console.log(bodies[0]);
      }
      if (opts.time) {
        console.error('Time of query: %dms', end);
      }
      return;
    }
    if (['tsv', 'text/tsv', 'n-triples', 'nt', 'turtle', 'ttl'].includes(opts.outfmt)) {
      let outputStr = '';
      switch (opts.outfmt) {
        case 'tsv':
          outputStr += jsonToTsv(bodies[0], Boolean(opts.vars));
          for (let i = 1; i < bodies.length; i++) {
            outputStr += '\n' + jsonToTsv(bodies[i]);
          }
          printTsv(outputStr);
          break;
        case 'text/tsv':
          outputStr += bodies[0];
          // remove header line for i > 0
          for (let i = 1; i < bodies.length; i++) {
            if (!bodies[i - 1].endsWith('\n')) {
              outputStr += '\n';
            }
            outputStr += bodies[i].substring(bodies[i].indexOf('\n') + 1);
          }
          printTsv(outputStr);
          break;
        default:
          for (let i = 0; i < bodies.length; i++) {
            console.log(bodies[i]);
          }
      }
    } else {
      console.error('The results are paginated. Those pages are saved as result1.out, result2.out,....');
      for (let i = 0; i < bodies.length; i++) {
        fs.writeFileSync(`result${i + 1}.out`, bodies[i]);
      }
    }
  });
} else {
  if (db == '-') {
    // TODO: save input as a temporary file name
  } else if (!fs.existsSync(db)) {
    console.error(`${db}: no such file`);
    process.exit(-1);
  }
  // TODO: use Jena or other JS implementation
  console.log(child_process.execSync(`sparql --data ${db} --results ${opts.outfmt} '${sparqlTemplate}'`).toString());
}

toString = (resource) => {
  if (!resource) {
    return '';
  }
  if (resource.type == 'uri') {
    if (opts.abbr) {
      return prefixModule.abbreviateURL(resource.value);
    } else {
      return `<${resource.value}>`;
    }
  } else if (resource.type == 'typed-literal') {
    if (opts.abbr) {
      return `"${resource.value}"^^${prefixModule.abbreviateURL(resource.datatype)}`;
    } else {
      return `"${resource.value}"^^<${resource.datatype}>`;
    }
  } else {
    return `"${resource.value}"`;
  }
};

jsonToTsv = (body, withHeader = false) => {
  const obj = JSON.parse(body);
  const vars = obj.head.vars;
  let tsv = '';
  if (withHeader) {
    tsv += vars.join('\t') + '\n';
  }
  tsv += obj.results.bindings
    .map((b) => {
      return vars.map((v) => toString(b[v])).join('\t');
    })
    .join('\n');
  return tsv;
};

printTsv = (tsv) => {
  if (opts.align_column) {
    console.log(
      columnify(csvParse(tsv, { columns: Boolean(opts.vars), delimiter: '\t', relax: true }), {
        // relax csvParse to accept "hoge"^^xsd:string
        showHeaders: Boolean(opts.vars),
        headingTransform: (x) => x
      }).replace(/\s+$/gm, '')
    );
  } else {
    console.log(tsv);
  }
};

function getTemplateURL(templatePath) {
  let match = /^github:\/\/([^\/]+)\/([^\/]+)\/(.+)/.exec(templatePath);
  if (match) {
    return `https://raw.githubusercontent.com/${match[1]}/${match[2]}/master/${match[3]}`;
  }

  match = /^https:\/\/github.com\/([^\/]+)\/([^\/]+)\/blob\/(.+)/.exec(templatePath);
  if (match) {
    return `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${match[3]}`;
  }

  if (/^(http|https):\/\//.test(templatePath)) {
    return templatePath;
  }
}
