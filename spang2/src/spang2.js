#!/usr/bin/env node

var version = require("../package.json").version;

querySparql = (endpoint, query) => {
  var options = {
    uri: endpoint + '?timeout=0', // infinite 
    form: {query: query},
    headers:{ 
      "User-agent": `spang2/spang2_${version}`, 
      "Accept": "text/tab-separated-values"
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
    .arguments('<DB> <SPARQL_TEMPLATE>').action((d, s) => {
      db = d;
      sparqlTemplate = s;
    });

commander.parse(process.argv);

if(commander.args.length < 1) {
  commander.help();
}

querySparql(db, fs.readFileSync(sparqlTemplate, 'utf8'));
