#!/usr/bin/env node

var version = require("../package.json").version;

const acceptHeaderMap = {
  "xml"      : "application/sparql-results+xml",
  "json"     : "application/sparql-results+json",
  "tsv"      : "application/sparql-results+json", // receive as json and format to tsv afterward
  "text/tsv" : "text/tab-separated-values",
  "n-triples": "text/plain",
  "nt"       : "text/plain",
  "n3"       : "text/rdf+n3",
  "html"     : "text/html",
  "bool"     : "text/boolean",
  "turtle"   : "application/x-turtle",
  "ttl"      : "application/x-turtle",
  "rdf/xml"  : "application/rdf+xml",
  "rdfxml"   : "application/rdf+xml",
  "rdfjson"  : "application/rdf+json",
  "rdfbin"   : "application/x-binary-rdf",
  "rdfbint"  : "application/x-binary-rdf-results-table",
  "js"       : "application/javascript",
};

toString = (resource) => {
  if(resource.type == 'uri') {
    return `<${resource.value}>`;
  } else if(resource.type == 'typed-literal') {
    return `"${resource.value}"^^<${resource.datatype}>`;
  } else {
    return `"${resource.value}"`;
  }
}

debugPrint = (object) => {
  console.log(JSON.stringify(object, undefined, 2));
};

querySparql = (endpoint, query, format) => {
  const accept = acceptHeaderMap[format];
  var options = {
    uri: endpoint, 
    form: {query: query},
    qs: {query: query},
    followAllRedirects: true,
    headers:{ 
      "User-agent": `spang2/spang2_${version}`, 
      "Accept": accept
    }
  };
  request.post(options, function(error, response, body){
    if (!error && response.statusCode == 200) {
      if(format == 'tsv') {
        const obj = JSON.parse(body);
        const vars = obj.head.vars;
        obj.results.bindings.forEach(b => {
          console.log(vars.map(v => toString(b[v])).join("\t"));
        });
      } else {
        console.log(body);
      }
    } else {
      console.log('error: '+ response.statusCode);
      console.log(body);
    }
  });
};

fs = require('fs');
request = require('request')
child_process = require('child_process');
search_db_name = require('./search_db_name');
const prefixModule = require('./prefix.js');
const searchPrefix = prefixModule.searchPrefix;
const retrievePrefixes = prefixModule.retrievePrefixes;
const metadataModule = require('./metadata.js');
embed_parameter = require('./embed_parameter.js');

var db, sparqlTemplate, localMode;
var parameterMap = {};
var retrieveByGet = false;

var commander = require('commander').version(version)
    .option('-f, --format <FORMAT>', 'tsv, json, n-triples (nt), turtle (ttl), rdf/xml (rdfxml), n3, xml, html', 'tsv')
    .option('-e, --endpoint <ENDPOINT>', 'target endpoint')
    .option('-S, --subject <SUBJECT>', 'shortcut to specify subject')
    .option('-P, --predicate <PREDICATE>', 'shortcut to specify predicate')
    .option('-O, --object <OBJECT>', 'shortcut to specify object')
    .option('-F, --from <FROM>', 'shortcut to search FROM specific graph (use alone or with -[SPOLN])')
    .option('-N, --number', 'shortcut of COUNT query (use alone or with -[SPO])')
    .option('-G, --graph', 'shortcut to search Graph names (use alone or with -[SPO])')
    .option('-q, --show_query', 'show query and quit')
    .option('-L, --limit <LIMIT>', 'LIMIT output (use alone or with -[SPOF])')
    .option('-l, --list_nick_name', 'list up available nicknames and quit')
    .option('--param <PARAMS>', 'parameters to be embedded (in the form of "--param par1=val1,par2=val2,...")')
    .arguments('<SPARQL_TEMPLATE>').action((s) => {
      sparqlTemplate = s;
    });

commander.parse(process.argv);


if(commander.list_nick_name) {
  console.log('SPARQL endpoints');
  const dbMap = search_db_name.listup();
  const maxLen = Object.keys(dbMap).map(key => key.length).reduce((a, b) => Math.max(a, b));
  for(const entry in dbMap) {
    console.log(` ${entry.padEnd(maxLen, ' ')} ${dbMap[entry].url}`);
  }
  process.exit(0);
}

if(commander.args.length < 1 &&
   (!commander.subject && !commander.predicate && !commander.object && !commander.number && !commander.from && !commander.graph && !commander.limit || !commander.endpoint)) {
  commander.help();
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
  var select_target = [], prefixes = [], pattern = [];
  [[commander.subject, 's'], [commander.predicate, 'p'], [commander.object, 'o']].forEach( (pair) => {
    var arg = pair[0];
    var placeHolder = pair[1];
    if(arg) {
      const urlMatched = arg.match(/^<?(\w+:\/\/[^>]+)>?$/);
      if(urlMatched) {
        pattern.push(`<${urlMatched[1]}>`);
      } else {
        const prefixMatched = arg.match(/^(\w+):\w+$/);
        if(prefixMatched) {
          prefixes.push(prefixMatched[1]);
          pattern.push(arg);
        } else {
          // literal
          pattern.push(`"${arg}"`);
        }
      }
    } else {
      select_target.push('?' + placeHolder);
      pattern.push('?' + placeHolder);
    }
  });
  sparqlTemplate = prefixes.map(pre => searchPrefix(pre)).join("\n") + "\n";
  if(commander.graph) {
    sparqlTemplate += `SELECT ?graph\nWHERE {\n    GRAPH ?graph {\n        ${pattern.join(' ')}\n    }\n}\nGROUP BY ?grpah\nORDER BY ?graph`;
  } else {
    const fromPart = commander.from ? `\nFROM ${commander.from}` : '';
    if(commander.number) {
      sparqlTemplate += `SELECT COUNT(*)${fromPart}\nWHERE {\n    ${pattern.join(' ')}\n}`;
    } else {
      sparqlTemplate += `SELECT ${select_target.join(' ')}${fromPart}\nWHERE {\n    ${pattern.join(' ')}\n}`;
    }
    if(commander.limit) {
      sparqlTemplate += `\nLIMIT ${commander.limit}`;
    }
  }
  metadata = {};
} else {
  sparqlTemplate = fs.readFileSync(sparqlTemplate, 'utf8')
  metadata = metadataModule.retrieveMetadata(sparqlTemplate);
  sparqlTemplate = embed_parameter.embedParameter(sparqlTemplate, parameterMap);
  prefixes = retrievePrefixes(sparqlTemplate);
  sparqlTemplate = prefixes.map(pre => searchPrefix(pre)).join("\n") + "\n" + sparqlTemplate;
}

if(commander.show_query) {
  console.log(sparqlTemplate);
}
else if(localMode) {
  console.log(child_process.execSync(`sparql --data ${db} --results ${commander.format} '${sparqlTemplate}'`).toString());
} else {
  if(commander.endpoint)
  {
    db = commander.endpoint;
  } else if(metadata.endpoint) {
    db = metadata.endpoint;
  } else {
    console.log('endpoint is required');
    process.exit(-1);
  }

  if(/^\w/.test(db)) {
    if (!(/^(http|https):\/\//.test(db))) {
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
  querySparql(db, sparqlTemplate, commander.format);
}
