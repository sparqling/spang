#!/usr/bin/env node

var version = require("../package.json").version;

querySparql = (endpoint, query, accept) => {
  var options = {
    uri: endpoint + '?timeout=0', // infinite 
    form: {query: query},
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

var db, sparqlTemplate;

var commander = require('commander').version(version)
    .option('-f, --format <FORMAT>', 'tsv, json, n-triples (nt), turtle (ttl), rdf/xml (rdfxml), n3, xml, html; default tsv', 'tsv')
    .option('-e, --endpoint <ENDPOINT>', 'target endpoint')
    .arguments('<SPARQL_TEMPLATE>').action((s) => {
      sparqlTemplate = s;
    });

commander.parse(process.argv);

if(commander.args.length < 1) {
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

var acceptHeaderMap = {
  "xml"      : "application/sparql-results+xml",
  "json"     : "application/sparql-results+json",
  // TODO receive as json and format afterward
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

querySparql(db, fs.readFileSync(sparqlTemplate, 'utf8'), acceptHeaderMap[commander.format]);
