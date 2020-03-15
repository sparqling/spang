#!/usr/bin/env node

fs = require('fs');

const version = require("../package.json").version;
const child_process = require('child_process');
const search_db_name = require('./search_db_name');
const prefixModule = require('./prefix.js');
const shortcut = require('./shortcut.js').shortcut;
const constructSparql = require('./construct_sparql.js').constructSparql;
const querySparql = require('./query_sparql.js');
const syncRequest = require('sync-request');


toString = (resource) => {
  if(resource.type == 'uri') {
    if(commander.abbr) return prefixModule.abbreviateURL(resource.value);
    return `<${resource.value}>`;
  } else if(resource.type == 'typed-literal') {
    if(commander.abbr) return `"${resource.value}"^^${prefixModule.abbreviateURL(resource.datatype)}`;
    return `"${resource.value}"^^<${resource.datatype}>`;
  } else {
    return `"${resource.value}"`;
  }
}

debugPrint = (object) => {
  console.log(JSON.stringify(object, undefined, 2));
};


var db, sparqlTemplate, localMode;
var parameterMap = {};
var retrieveByGet = false;

var commander = require('commander').version(version)
    .option('-e, --endpoint <ENDPOINT>', 'target SPARQL endpoint')
    .option('--param <PARAMS>', 'parameters to be embedded (in the form of "--param par1=val1,par2=val2,...")')
    .option('-f, --format <FORMAT>', 'tsv, json, n-triples (nt), turtle (ttl), rdf/xml (rdfxml), n3, xml, html', 'tsv')
    .option('-a, --abbr', 'abbreviate results using predefined prefixes')
    .option('-S, --subject <SUBJECT>', 'shortcut to specify subject')
    .option('-P, --predicate <PREDICATE>', 'shortcut to specify predicate')
    .option('-O, --object <OBJECT>', 'shortcut to specify object')
    .option('-L, --limit <LIMIT>', 'LIMIT output (use alone or with -[SPOF])')
    .option('-F, --from <FROM>', 'shortcut to search FROM specific graph (use alone or with -[SPOLN])')
    .option('-N, --number', 'shortcut of COUNT query (use alone or with -[SPO])')
    .option('-G, --graph', 'shortcut to search Graph names (use alone or with -[SPO])')
    .option('-q, --show_query', 'show query and quit')
    .option('-l, --list_nick_name', 'list up available nicknames of endpoints and quit')
    .arguments('<SPARQL_TEMPLATE>').action((s) => {
      sparqlTemplate = s;
    });

splitShortOptions = (argv) => {
  var index = 0;
  var matched;
  const shortOptions = commander.options.filter((option) => option.short).map((option) => option.short[1]);
  var splitted = [];
  argv.forEach(arg => {
    const matched = arg.match(/^-(\w+)$/);
    if(matched && matched[1].length > 1 && !shortOptions.includes(matched[1][1]) ) {
      splitted.push(`-${matched[1][0]}`);
      splitted.push(matched[1].substring(1));
    } else {
      splitted.push(arg);
    }
  });
  return splitted;
};

commandArguments = splitShortOptions(process.argv);

commander.parse(commandArguments);

const dbMap = search_db_name.listup();

if(commander.list_nick_name) {
  console.log('SPARQL endpoints');
  const maxLen = Object.keys(dbMap).map(key => key.length).reduce((a, b) => Math.max(a, b));
  for(const entry in dbMap) {
    console.log(` ${entry.padEnd(maxLen, ' ')} ${dbMap[entry].url}`);
  }
  process.exit(0);
}

if(commander.args.length < 1) {
  if(!commander.subject && !commander.predicate && !commander.object && !commander.number && !commander.from && !commander.graph && !commander.limit) {
    console.log(`SPANG v${version}: Specify a SPARQL query (using template or shortcut).\n`);
    commander.help();
  } else if(!commander.endpoint && !dbMap['default']) {
    console.log(`SPANG v${version}: Specify the target SPARQL endpoint (using -e option or in <SPARQL_TEMPLATE>).\n`);
    commander.help();
  }
}

if(commander.param) {
  params = commander.param.split(',');
  params.forEach((par) => {
    [k, v] = par.split('=');
    parameterMap[k] = v;
  });
}

if(commander.subject || commander.predicate || commander.object || commander.limit ||
   commander.number || commander.graph || commander.from) {
  sparqlTemplate = shortcut({S: commander.subject, P: commander.predicate, O: commander.object,
                             L: commander.limit, N: commander.number, G: commander.graph, F: commander.from}, prefixModule.getPrefixMap());
  metadata = {};
} else {
  if(/^(http|https):\/\//.test(sparqlTemplate)) {
    sparqlTemplate = syncRequest("GET", sparqlTemplate).getBody("utf8");
  } else {
    sparqlTemplate = fs.readFileSync(sparqlTemplate, 'utf8');
  }
  [sparqlTemplate, metadata] = constructSparql(sparqlTemplate, parameterMap);
}

if(commander.show_query) {
  console.log(sparqlTemplate);
}
else if(localMode) {
  console.log(child_process.execSync(`sparql --data ${db} --results ${commander.format} '${sparqlTemplate}'`).toString());
} else {
  if(commander.endpoint) {
    db = commander.endpoint;
  } else if(metadata.endpoint) {
    db = metadata.endpoint;
  } else if(dbMap['default']) {
    db = dbMap['default'].url;
  } else {
    console.log('Endpoint is required');
    process.exit(-1);
  }

  if(/^\w/.test(db)) {
    if (!(/^(http|https):\/\//.test(db))) {
      if (!dbMap[db]) {
        console.log(`${db}: no such endpint`);
        process.exit(-1);
      }
      [db, retrieveByGet] = search_db_name.searchDBName(db);
    }
  } else {
    localMode = true;
    if (db == '-') {
      db = fs.readFileSync(process.stdin.fd, "utf8");
    } else if(!fs.existsSync(db)) {
      console.log(`${db}: no such file`);
      process.exit(-1);
    }
  }
  querySparql(db, sparqlTemplate, commander.format, retrieveByGet, (error, response, body) => {
    if (!error && response.statusCode == 200) {
      if(commander.format == 'tsv') {
        const obj = JSON.parse(body);
        const vars = obj.head.vars;
        obj.results.bindings.forEach(b => {
          console.log(vars.map(v => toString(b[v])).join("\t"));
        });
      } else {
        console.log(body);
      }
    } else {
      console.log('Error: '+ response.statusCode);
      console.log(body);
    }
  });
}
