spang = {};
spang.embed = require('../lib/embed_parameter.js').embedParameter;
spang.prefix = require('../lib/prefix.js');
const metadataModule = require('../lib/metadata.js');
const version = require('../package.json').version;
const { jsonToTsv } = require('../lib/util.js');
spang.makeSparql = require('../lib/make_sparql.js').makeSparql;
spang.retrieveMetadata = metadataModule.retrieveMetadata;

spang.getTemplate = (url, callback) => {
  fetch(spang.prefix.expandPrefixedUri(url))
    .then(response => {
      if (!response.ok || response.status !== 200) {
        throw new Error(`fetch: ${response.status} ${response.statusText}`);
      }
      return(response.text());
    })
    .then(text => {
      callback(text);
    })
    .catch(reason => {
      console.log(reason);
    });
};

spang.prefix.loadPrefixFile('https://raw.githubusercontent.com/hchiba1/spang2/master/etc/prefix');
spang.shortcut = require('../lib/shortcut.js').shortcut;
spang.proxy = null;

spang.query = (sparqlTemplate, endpoint, options, callback) => {
  var sparql, metadata;
  metadata = metadataModule.retrieveMetadata(sparqlTemplate);
  sparql = spang.makeSparql(sparqlTemplate, metadata, options.param, []);
  if(!endpoint) {
    endpoint = metadata.endpoint;
  }
  require('../lib/query_sparql.js')(endpoint, spang.proxy, sparql, options.format, options.get, (error, code, bodies) => {
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
