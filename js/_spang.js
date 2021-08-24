spang = {};
spang.embed = require('../lib/embed_parameter.js').embedParameter;
spang.request = require('request');
spang.prefix = require('../lib/prefix.js');
const metadataModule = require('../lib/metadata.js');
const version = require('../package.json').version;
const syncRequest = require('sync-request');
const { jsonToTsv } = require('../lib/util.js');
spang.makeSparql = require('../lib/make_sparql.js').makeSparql;

spang.getTemplate = (url, callback) => {
  var options = {
    uri: url, 
    followAllRedirects: true,
    headers:{ 
      'User-agent': `SPANG/${version}`, 
      'Accept': 'text/plain'
    }
  };
  spang.request.get(options, function(error, response, body){
    if (!error && response.statusCode == 200) {
      callback(body);
    } else {
      console.log('error: '+ response.statusCode);
      console.log(body);
    }
  });
};

spang.prefix.loadPrefixFile('https://raw.githubusercontent.com/hchiba1/spang2/master/etc/prefix');
spang.shortcut = require('../lib/shortcut.js').shortcut;

spang.query = (sparqlTemplate, endpoint, options, callback) => {
  var sparql, metadata;
  metadata = metadataModule.retrieveMetadata(sparqlTemplate);
  sparql = spang.makeSparql(sparqlTemplate, {}, options.param, []);
  if(!endpoint) {
    endpoint = metadata.endpoint;
  }
  require('../lib/query_sparql.js')(endpoint, sparql, options.format, options.get, (error, code, bodies) => {
    if (bodies.length === 1) {
      callback(error, code, bodies[0]);
    }
    else if (['tsv', 'text', 'n-triples', 'nt', 'turtle', 'ttl'].includes(options.format)) {
      let result = '';
      switch (options.format) {
      case 'tsv':
        result += jsonToTsv(bodies[0], Boolean(options.vars), Boolean(options.abbr));
        for (let i = 1; i < bodies.length; i++) {
          result += '\n' + jsonToTsv(bodies[i], false, Boolean(options.abbr));
        }
        break;
      case 'text':
        result += bodies[0];
        // remove header line for i > 0
        for (let i = 1; i < bodies.length; i++) {
          if (!bodies[i - 1].endsWith('\n')) {
            result += '\n';
          }
          result += bodies[i].substring(bodies[i].indexOf('\n') + 1);
        }
        break;
      default:
        for (let i = 0; i < bodies.length; i++) {
          result += bodies[i];
          result += "\n";
        }
      }
      callback(status, code, result);
    } else {
      callback("The resut has multiple pages but the specified format does not support them.", code, bodies);
    }
  });
};
