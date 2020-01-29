#!/usr/bin/env node

var version = require("../package.json").version;

querySparql = (endpoint, query, accept) => {
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
      console.log(body);
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
embed_parameter = require('./embed_parameter.js');

var db, sparqlTemplate, localMode;
var parameterMap = {};
var retrieveByGet = false;

var commander = require('commander').version(version)
    .option('-f, --format <FORMAT>', 'tsv, json, n-triples (nt), turtle (ttl), rdf/xml (rdfxml), n3, xml, html; default tsv', 'tsv')
    .option('-e, --endpoint <ENDPOINT>', 'target endpoint')
    .option('-S, --subject <SUBJECT>', 'shortcut')
    .option('-P, --predicate <PREDICATE>', 'shortcut')
    .option('-O, --object <OBJECT>', 'shortcut')
    .option('--param <PARAMS>', 'parameters to be embedded (in the form of "--param par1=val1,par2=val2,...")')
    .arguments('<SPARQL_TEMPLATE>').action((s) => {
      sparqlTemplate = s;
    });

commander.parse(process.argv);

if(commander.args.length < 1 &&
   (!commander.subject && !commander.predicate && !commander.object || !commander.endpoint)) {
  commander.help();
}

if(commander.endpoint)
{
  db = commander.endpoint;
} else {
  // TODO: if endpoint is not specified, try to retrieve it from meta-data in templates
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


var acceptHeaderMap = {
  "xml"      : "application/sparql-results+xml",
  "json"     : "application/sparql-results+json",
  // TODO receive as json and format to tsv afterward
  "tsv"      : "text/tab-separated-values",
  "rdf/xml"  : "application/rdf+xml",
  "rdfxml"   : "application/rdf+xml",
  "turtle"   : "application/x-turtle",
  "ttl"      : "application/x-turtle",
  "n3"       : "text/rdf+n3",
  "n-triples": "text/plain",
  "nt"       : "text/plain",
  "html"     : "text/html",
  "rdfjson"  : "application/rdf+json",
  "rdfbin"   : "application/x-binary-rdf",
  "rdfbint"  : "application/x-binary-rdf-results-table",
  "js"       : "application/javascript",
  "bool"     : "text/boolean",
};

if(commander.param) {
  params = commander.param.split(',');
  params.forEach((par) => {
    [k, v] = par.split('=');
    parameterMap[k] = v;
  });
}


if(commander.subject || commander.predicate || commander.object) {
  var select_target = [], prefixes = [], pattern = [];
  [[commander.subject, 's'], [commander.predicate, 'p'], [commander.object, 'o']].forEach( (pair) => {
    var arg = pair[0];
    var placeHolder = pair[1];
    if(arg) {
      pattern.push(arg);
      const prefix = arg.match(/^(\w+):\w+$/)[1];
      if(prefix) prefixes.push(prefix);
    } else {
      select_target.push('?' + placeHolder);
      pattern.push('?' + placeHolder);
    }
  });
  sparqlTemplate = prefixes.map(pre => searchPrefix(pre)).join("\n") + "\n" +
    `SELECT ${select_target.join(' ')} WHERE {\n` +
    '  ' + pattern.join(' ') + "\n" +
    '}';
} else {
  sparqlTemplate = fs.readFileSync(sparqlTemplate, 'utf8')
  sparqlTemplate = embed_parameter.embedParameter(sparqlTemplate, parameterMap);
  prefixes = retrievePrefixes(sparqlTemplate);
  sparqlTemplate = prefixes.map(pre => searchPrefix(pre)).join("\n") + "\n" + sparqlTemplate;
}

if(localMode) {
  console.log(child_process.execSync(`sparql --data ${db} --results ${commander.format} '${sparqlTemplate}'`).toString());
} else {
  querySparql(db, sparqlTemplate, acceptHeaderMap[commander.format]);
}
